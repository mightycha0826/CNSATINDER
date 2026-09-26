<script lang="ts">
	/**
	 * 대화방 화면 — ChatRoom 상태만 읽어서 그린다.
	 * 실제 방(/chat)과 개발용 미리보기(/dev/chat)가 같은 컴포넌트를 쓴다.
	 */
	import { tick, untrack } from 'svelte';
	import { S, errMsg, toast } from '$lib/state.svelte';
	import type { ChatRoom } from './room.svelte';
	import type { Msg, PartnerProfile, ReactionKey, ReportReason } from './types';
	import ChatIntro from './ChatIntro.svelte';
	import PartnerCard from './PartnerCard.svelte';
	import ReactionBadge from './ReactionBadge.svelte';
	import ReactionPicker from './ReactionPicker.svelte';
	import ReplyQuote from './ReplyQuote.svelte';
	import Starters from './Starters.svelte';
	import MatchScreen from './MatchScreen.svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { pressGestures, swipeReply } from './gestures';
	import { summarize } from './reactions';
	import Avatar from '$lib/ui/Avatar.svelte';
	import BackButton from '$lib/ui/BackButton.svelte';
	import ReportPicker from '$lib/ui/ReportPicker.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { backToSeek, goBack } from '$lib/nav';
	import { mmss as fmtClock } from '$lib/time';
	import { scrollBehavior } from '$lib/motion';

	let {
		room,
		loading,
		initialSheet = null,
		matched = false
	}: {
		room: ChatRoom | null;
		loading: boolean;
		/** 방금 매칭돼서 들어왔다 — 연결 화면을 한 번 */
		matched?: boolean;
		/** 개발용 미리보기에서만 사용 */
		initialSheet?: null | 'menu' | 'report' | 'block' | 'leave' | 'profile';
	} = $props();

	let draft = $state('');
	let listEl: HTMLDivElement | undefined = $state();
	let inputEl: HTMLTextAreaElement | undefined = $state();
	let atBottom = true;

	// 처음 불러왔을 때 맨 아래로
	$effect(() => {
		if (loading) return;
		void tick().then(() => scrollToBottom(false));
	});

	// ── 시간 ─────────────────────────────────────────────────────
	// 클라 시계 대신 서버 시계 기준 (skew 보정). 판정은 서버가 한다 — 여기는 표시용.
	const remainMs = $derived(
		room?.snap ? Math.max(0, Date.parse(room.snap.expires_at) - room.serverNow(S.now)) : 0
	);
	const timeUp = $derived(!!room?.snap && room.snap.status !== 'closed' && remainMs <= 0);
	const mmss = $derived(fmtClock(Math.ceil(remainMs / 1000), true));
	const urgent = $derived(remainMs > 0 && remainMs <= 60_000);
	const closed = $derived(room?.closed ?? false);
	const pending = $derived(room?.snap?.status === 'pending');
	// pending 방은 서버가 쓰기를 막는다(room_is_writable) — 화면도 맞춘다
	const locked = $derived(closed || timeUp || pending);

	// 카운트다운이 0 이 되면 서버에 "끝났나요?"를 묻는다. 판정은 서버가 한다.
	// (throttle 은 ChatRoom.checkExpiry 안에 있다 — S.now 가 매초 이 effect 를 깨운다)
	$effect(() => {
		if (timeUp && room) void room.checkExpiry();
	});

	// ── 연장 투표 ────────────────────────────────────────────────
	// "연장투표중"은 상태가 아니라 만료 N초 전부터의 구간이다.
	const snap = $derived(room?.snap ?? null);
	const canExtendMore = $derived(!!snap && (snap.max_rounds === 0 || snap.round < snap.max_rounds));
	const voteOpen = $derived(
		!!snap &&
			snap.status === 'active' &&
			remainMs > 0 &&
			remainMs <= snap.vote_window_sec * 1000 &&
			canExtendMore
	);

	async function vote(agree: boolean) {
		if (!room) return;
		const r = await room.vote(agree);
		if (r === 'too_early') toast('연장은 마감 직전부터 가능해요');
		else if (r === 'max_rounds') toast('더 이상 연장할 수 없어요');
		else if (r === null) toast('연결을 확인해 주세요');
	}

	// ── 상대 이탈 감지 ───────────────────────────────────────────
	// 대화 중 상대가 45초 넘게 안 보이면(앱을 닫았거나 백그라운드) 넘길 수 있게 한다.
	// 남은 사람이 10분을 허공에 날리지 않게 하는 게 목적.
	let goneSince = $state<number | null>(null);
	$effect(() => {
		const away = !!room && room.connected && room.snap?.status === 'active' && !room.partnerHere;
		if (!away) goneSince = null;
		else if (untrack(() => goneSince) === null) goneSince = Date.now();
	});
	const partnerGone = $derived(goneSince !== null && S.now - goneSince > 45_000 && !closed);

	async function skip() {
		await room?.leave(true);
		backToSeek();
	}

	// ── 메뉴 · 신고 · 차단 ───────────────────────────────────────
	// 시트는 한 번에 한 화면: menu → (leave | block | report) 확인
	let sheet = $state<null | 'menu' | 'leave' | 'block' | 'report' | 'profile'>(untrack(() => initialSheet));
	let reportReason = $state<ReportReason | null>(null);
	let reportNote = $state('');
	let acting = $state(false);

	function openSheet(s: typeof sheet) {
		sheet = s;
		reportReason = null;
		reportNote = '';
		if (s === 'profile') void loadProfile();
	}

	// ── 상대 프로필 ──────────────────────────────────────────────
	// 헤더의 아바타·이름을 누르면 상대의 기본 정보. 같은 방 멤버만 서버가 돌려준다.
	let profile = $state<PartnerProfile | null>(null);
	let profileLoading = $state(false);
	async function loadProfile() {
		if (!room || profileLoading) return;
		profileLoading = true;
		profile = (await room.partnerProfile()) ?? profile;
		profileLoading = false;
	}
	$effect(() => {
		// 개발용 미리보기에서 &sheet=profile 로 바로 열었을 때
		if (room && sheet === 'profile' && !profile) untrack(() => void loadProfile());
	});
	// 대화 맨 위 소개 카드에 쓰려고 방을 열면 한 번 미리 불러온다 (실패해도 다시 조르지 않는다)
	let introTried = false;
	$effect(() => {
		if (room?.snap && !introTried) {
			introTried = true;
			untrack(() => void loadProfile());
		}
	});
	// 방 화면을 보고 있음(presence) > 앱이 켜져 있음(heartbeat) > 꺼짐
	const partnerOnline = $derived(!!room && (room.partnerHere || !!room.snap?.partner_online));

	async function leave() {
		sheet = null;
		await room?.leave(false);
	}

	async function block() {
		if (!room || acting) return;
		acting = true;
		const ok = await room.block();
		acting = false;
		sheet = null;
		toast(ok ? '차단 완료 · 다시는 만나지 않아요' : '연결을 확인해 주세요');
	}

	async function report() {
		if (!room || !reportReason || acting) return;
		acting = true;
		const ok = await room.report(reportReason, reportNote.trim());
		acting = false;
		sheet = null;
		toast(ok ? '신고 접수 · 운영진이 확인할게요' : '연결을 확인해 주세요');
	}

	// 도배 제한에 걸리면 한 번만 알려준다
	let warnedRate = false;
	$effect(() => {
		const hit = room?.msgs.some((m) => m.state === 'rate_limited');
		if (hit && !warnedRate) {
			warnedRate = true;
			toast('너무 빨리 보내고 있어요. 잠시 후 다시 눌러 주세요');
		}
		if (!hit) warnedRate = false;
	});
	const partnerTyping = $derived(!!room && S.now < room.partnerTypingUntil);

	// ── 키보드 (모바일) ──────────────────────────────────────────
	// iOS 는 키보드가 올라와도 100dvh 가 줄지 않고 페이지 전체를 위로 밀어 올린다 → 헤더와 최근 메시지가
	// 화면 밖으로 사라진다. 실제로 보이는 영역(visualViewport)에 대화 화면을 딱 맞춘다.
	let vvH = $state<number | null>(null);
	let vvTop = $state(0);
	let keyboard = $state(false);
	$effect(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const sync = () => {
			vvH = vv.height;
			vvTop = vv.offsetTop;
			keyboard = window.innerHeight - vv.height > 120;
		};
		sync();
		vv.addEventListener('resize', sync);
		vv.addEventListener('scroll', sync);
		return () => {
			vv.removeEventListener('resize', sync);
			vv.removeEventListener('scroll', sync);
		};
	});

	// ── 스크롤 ───────────────────────────────────────────────────
	/** 맨 아래에서 얼마나 떨어져 있는지 — 목록 높이가 바뀌어도(키보드) 보던 자리를 지킨다 */
	let fromBottom = 0;
	function scrollToBottom(smooth = true) {
		listEl?.scrollTo({ top: listEl.scrollHeight, behavior: smooth ? scrollBehavior() : 'auto' });
	}
	function onScroll() {
		if (!listEl) return;
		// 고르기 줄이 열려 있는 동안 사람의 손가락·휠은 가림막(ReactionPicker 의 scrim)이 받아서 닫는다.
		// 그래도 scroll 이 오면 목록이 저절로 움직인 것(상대 입력 중 표시가 사라짐 · 새 메시지) — 닫지 않고 따라간다.
		followPicker();
		paintSoon();
		fromBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
		atBottom = fromBottom < 48;
		if (atBottom) room?.markRead();
	}
	function onListResize() {
		if (!listEl) return;
		// 키보드가 올라와 목록이 줄어들면, 아래쪽(최근 메시지)이 그대로 보이게 위치를 맞춘다
		listEl.scrollTop = listEl.scrollHeight - listEl.clientHeight - (atBottom ? 0 : fromBottom);
		paintSoon();
	}
	// ── 내 말풍선 그라디언트 ─────────────────────────────────────
	// 인스타 DM 처럼 화면 위쪽 말풍선은 보라, 아래쪽은 분홍. 그라디언트 하나를 목록 화면에 깔고
	// 말풍선마다 자기 위치만큼 밀어서 보여준다. (background-attachment: fixed 는 iOS 가 무시해서 직접 계산)
	let painting = false;
	function paintSoon() {
		if (painting) return;
		painting = true;
		requestAnimationFrame(() => {
			painting = false;
			if (!listEl) return;
			const top = listEl.getBoundingClientRect().top;
			const els = listEl.querySelectorAll<HTMLElement>('.mine .bubble');
			// 읽기를 먼저 모두 끝내고 쓴다 (레이아웃 재계산 반복 방지)
			const ys = Array.from(els, (el) => el.getBoundingClientRect().top - top);
			listEl.style.setProperty('--lh', listEl.clientHeight + 'px');
			els.forEach((el, i) => el.style.setProperty('--by', -ys[i] + 'px'));
		});
	}
	$effect(() => {
		void room?.msgs.length;
		void tick().then(paintSoon);
	});
	$effect(() => {
		if (!listEl) return;
		const ro = new ResizeObserver(onListResize); // 키보드가 올라오거나 화면이 돌아갈 때
		ro.observe(listEl);
		return () => ro.disconnect();
	});

	// 새 메시지·"읽음"·입력 중 표시·안내 문구가 생기면, 맨 아래를 보고 있을 때만 따라 내려간다
	$effect(() => {
		void room?.msgs.length;
		void partnerTyping;
		void seenMine;
		void reactSig;
		void pending;
		void closed;
		void timeUp;
		if (!atBottom) return;
		void tick().then(() => {
			scrollToBottom();
			room?.markRead();
		});
	});

	// ── 전송 ─────────────────────────────────────────────────────
	async function submit() {
		const text = draft;
		if (!text.trim() || !room || locked) return;
		if (text.length > (S.settings?.msg_max_len ?? 500)) {
			toast('500자까지 보낼 수 있어요');
			return;
		}
		const to = replyTo?.id ?? null;
		const quoting = replyTo;
		draft = '';
		replyTo = null;
		atBottom = true;
		inputEl?.focus();
		const res = await room.send(text, to);
		if (res?.blocked) {
			// 검열 1단에 막힘 — 쓴 글을 입력창에 돌려놓고 이유를 알려 준다 (고쳐서 다시 보내면 된다)
			if (!draft) draft = text;
			if (!replyTo) replyTo = quoting;
			toast(errMsg(res.blocked));
		}
	}
	function onKey(e: KeyboardEvent) {
		// 한글 조합 중 Enter 는 무시 (IME)
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			void submit();
		}
	}
	$effect(() => {
		// 입력창 자동 높이
		void draft;
		if (!inputEl) return;
		inputEl.style.height = 'auto';
		inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
	});

	// ── 버블 그룹핑 (인스타식) ───────────────────────────────────
	// 같은 사람이 연달아 보낸 메시지는 인접 모서리를 4px 로 줄여 하나의 묶음으로 보인다.
	function pos(list: Msg[], i: number) {
		const s = list[i].sender_seat;
		const prev = list[i - 1]?.sender_seat === s && s !== 0;
		const next = list[i + 1]?.sender_seat === s && s !== 0;
		return { first: !prev, last: !next };
	}

	// 마지막으로 보낸 내 메시지 — 그 아래에만 "읽음" 표시
	const lastMineId = $derived.by(() => {
		if (!room) return null;
		for (let i = room.msgs.length - 1; i >= 0; i--) {
			const m = room.msgs[i];
			if (m.sender_seat === room.seat) return m.id;
		}
		return null;
	});
	const seenMine = $derived(
		!!room?.snap?.their_read_id && lastMineId != null && room.snap.their_read_id >= lastMineId
	);

	// ── 화면 낭독기 ──────────────────────────────────────────────
	// 상대의 새 메시지만 소리 내어 읽는다. 목록 전체를 live 로 두면 들어올 때 지난 대화를 다 읽어 버려서,
	// 처음 불러온 대화까지는 기준선으로만 잡고, 그 뒤에 온 상대 메시지 하나씩만 따로 된 안내 칸에 넣는다.
	let spoken: number | null = null;
	let announce = $state('');
	$effect(() => {
		if (!room?.snap || !room.msgs.length) return;
		let last: Msg | undefined;
		for (let i = room.msgs.length - 1; i >= 0 && !last; i--) {
			const m = room.msgs[i];
			if (m.id != null && m.sender_seat !== 0 && m.sender_seat !== room.seat) last = m;
		}
		const id = last?.id ?? 0;
		if (spoken != null && last && id > spoken) announce = `${room.snap.partner_alias}: ${last.body}`;
		spoken = Math.max(spoken ?? 0, id);
	});

	// ── 공감 ─────────────────────────────────────────────────────
	// 두 번 톡 = ❤️ (다시 두 번 톡이면 취소), 길게 누르기(데스크톱은 오른쪽 클릭) = 공감 고르기 + 복사.
	// 말풍선은 글자 선택을 막는다 — 길게 누르면 iOS 가 글자를 잡아 버려서. 대신 고르기 줄에 "복사".
	const canReact = (m: Msg) => !locked && m.id != null && m.sender_seat !== 0 && m.state === 'sent';
	type Picker = { id: number; body: string; react: boolean; top: number; left: number | null; right: number | null };
	let picker = $state<Picker | null>(null);
	const PICK_H = 48;

	/** 고르기 줄이 붙어 있는 말풍선 — 목록이 저절로 움직이면(입력 중 표시가 사라짐 등) 따라간다 */
	let pickerAnchor: { m: Msg; el: Element } | null = null;
	function placePicker(m: Msg, bubble: Element) {
		if (m.id == null) return;
		const r = bubble.getBoundingClientRect();
		const header = listEl?.getBoundingClientRect().top ?? 0;
		// 말풍선 위에, 자리가 없으면 아래에
		const top = r.top - PICK_H - 8 >= header ? r.top - PICK_H - 8 : r.bottom + 8;
		const mineSide = m.sender_seat === room?.seat;
		picker = {
			id: m.id,
			body: m.body,
			react: canReact(m),
			top,
			left: mineSide ? null : Math.max(8, r.left),
			right: mineSide ? Math.max(8, window.innerWidth - r.right) : null
		};
	}
	function openPicker(m: Msg, bubble: Element | null) {
		if (m.id == null || !bubble) return;
		pickerAnchor = { m, el: bubble };
		placePicker(m, bubble);
		navigator.vibrate?.(10);
	}
	/** 목록이 움직였다 — 말풍선이 아직 보이면 고르기 줄을 옮기고, 화면 밖으로 나갔으면 닫는다 */
	function followPicker() {
		if (!picker || !pickerAnchor || !listEl) return;
		const { m, el } = pickerAnchor;
		const r = el.getBoundingClientRect(), box = listEl.getBoundingClientRect();
		if (!el.isConnected || r.bottom < box.top || r.top > box.bottom) picker = null;
		else placePicker(m, el);
	}

	async function doReact(id: number, k: ReactionKey) {
		picker = null;
		const res = await room?.toggleReaction(id, k);
		if (res === 'closed') toast('대화가 끝나서 공감할 수 없어요');
		else if (res && res !== 'ok') toast('연결을 확인해 주세요');
	}

	// ── 답장 ─────────────────────────────────────────────────────
	// 공감 고르기 줄의 "답장", 또는 말풍선을 옆으로 밀기 → 입력창 위에 "○○에게 답장" 막대. 보내면 그 메시지를 짚은 답장이 된다.
	let replyTo = $state<Msg | null>(null);
	const byId = $derived(new Map((room?.msgs ?? []).filter((m) => m.id != null).map((m) => [m.id!, m])));
	const whose = (m: Msg) => (m.sender_seat === room?.seat ? '내' : `${room?.snap?.partner_alias ?? '상대'}의`);

	function startReply(m = picker ? byId.get(picker.id) : undefined) {
		picker = null;
		if (!m || m.id == null || locked) return;
		replyTo = m;
		inputEl?.focus();
	}

	// 밀어서 답장 — 끄는 동안 그 말풍선만 손가락을 따라 옆으로 (놓으면 제자리로 미끄러져 돌아간다)
	let swiped = $state<{ key: string; dx: number } | null>(null);
	const swipe = swipeReply<Msg>({
		onMove: (m, dx) => (swiped = m && dx ? { key: m.client_msg_id, dx } : null),
		onReply: (m) => startReply(m)
	});
	$effect(() => {
		if (locked) replyTo = null; // 대화가 끝나면 답장 준비도 접는다
	});

	// ── 연결 화면 · 시간 구분선 ──────────────────────────────────
	let showMatch = $state(untrack(() => matched));
	function matchDone() {
		showMatch = false;
		// 뒤로 왔다가 다시 이 방으로 와도(기록에 matched 가 남아 있어도) 또 뜨지 않게 지운다
		if (page.state.matched) replaceState('', { ...page.state, matched: false });
	}

	/** 대화 시작과, 5분 넘게 쉬었다 이어질 때만 가운데에 시각 ("오후 3:12") */
	const GAP_MS = 5 * 60_000;
	function timeSep(i: number) {
		const list = room?.msgs ?? [];
		const cur = Date.parse(list[i].created_at);
		if (i > 0 && cur - Date.parse(list[i - 1].created_at) < GAP_MS) return null;
		return new Date(cur).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
	}

	// ── 첫마디 도우미 ─────────────────────────────────────────────
	// 내가 아직 한 마디도 안 했고 입력창이 비어 있을 때만. 한 번 보내면 사라진다.
	const showStarters = $derived(
		!!room?.snap && !locked && !draft && !replyTo && !room.msgs.some((m) => m.sender_seat === room.seat)
	);
	function useStarter(text: string) {
		draft = text;
		inputEl?.focus();
	}

	/** 인용을 누르면 원래 메시지로 — 가운데로 스크롤하고 잠깐 반짝 */
	let flashId = $state<number | null>(null);
	function jumpTo(id: number) {
		const el = listEl?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
		if (!el) return toast('원래 메시지를 찾을 수 없어요');
		el.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
		flashId = id;
		setTimeout(() => flashId === id && (flashId = null), 1200);
	}

	async function copy() {
		const text = picker?.body ?? '';
		picker = null;
		try {
			await navigator.clipboard.writeText(text);
			toast('복사됨');
		} catch {
			toast('복사하지 못했어요');
		}
	}

	const press = pressGestures<Msg>({
		onLong: (m, el) => openPicker(m, el),
		onDouble: (m) => {
			if (canReact(m)) void doReact(m.id!, 'heart');
		}
	});

	const myReaction = $derived(picker && room ? room.reactions[picker.id]?.[room.seat] : undefined);
	// 공감이 달리면 말풍선 아래가 늘어난다 — 맨 아래를 보고 있으면 따라 내려가게 (아래 스크롤 effect 가 읽는다)
	const reactSig = $derived(room ? JSON.stringify(room.reactions) : '');

	// ★ 상대가 신고/차단해서 끝났을 때 사유를 알려주지 않는다 — "상대가 대화를 종료함"으로 통일.
	//   신고당한 걸 알면 보복하거나 신고를 피하는 법을 배운다.
	const ENDED_BY_PARTNER: Record<string, string> = {
		expired: '시간이 다 되어 대화 종료',
		declined: '연장하지 않기로 해서 대화 종료',
		skipped: '상대가 다음 대화로 이동',
		left: '상대가 대화방을 나감',
		reported: '상대가 대화를 종료함',
		blocked: '상대가 대화를 종료함',
		no_show: '상대가 들어오지 않음',
		admin: '운영진이 대화를 종료함'
	};
	const ENDED_BY_ME: Record<string, string> = {
		left: '대화를 나감',
		skipped: '대화를 나감',
		declined: '연장하지 않기로 해서 대화 종료',
		reported: '신고 접수 · 운영진이 대화 내용을 확인할게요',
		blocked: '차단 완료 · 이 사람과는 다시 만나지 않아요'
	};
	const endedText = $derived.by(() => {
		const r = room?.snap?.close_reason ?? '';
		return (room?.endedByMe ? ENDED_BY_ME[r] : undefined) ?? ENDED_BY_PARTNER[r] ?? '대화 종료';
	});
</script>

<div
	class="chat"
	class:keyboard
	style:height={vvH ? `${vvH}px` : null}
	style:--vv-top={`${vvTop}px`}
>
	<header class="topbar">
		<BackButton href="/" history />

		{#if room?.snap}
			{@const alias = room.snap.partner_alias}
			<button class="who" onclick={() => openSheet('profile')} aria-label="상대 프로필 보기">
				<Avatar name={alias} size={32} online={partnerOnline && !closed} />
				<span class="names">
					<span class="alias">{alias}</span>
					<span class="sub">
						{#if closed}대화 종료{:else if pending}{room.snap.partner_joined ? '곧 시작해요' : '상대를 기다리는 중'}{:else if room.partnerHere}지금 보고 있음{:else if room.snap.partner_online}접속 중{:else}오프라인{/if}
					</span>
				</span>
			</button>
			{#if !closed}
				<span class="timer num" class:urgent class:dim={pending}>{mmss}</span>
				<button class="more" onclick={() => openSheet('menu')} aria-label="메뉴">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="5" cy="12" r="1.6" fill="currentColor" />
						<circle cx="12" cy="12" r="1.6" fill="currentColor" />
						<circle cx="19" cy="12" r="1.6" fill="currentColor" />
					</svg>
				</button>
			{/if}
		{/if}
	</header>

	{#if partnerGone && !voteOpen}
		<div class="extend">
			<div class="q">
				<strong>상대가 자리를 비운 것 같아요</strong>
				<span>기다리거나 다른 사람과 대화할 수 있어요</span>
			</div>
			<div class="acts">
				<button class="yes" onclick={skip}>다른 사람 찾기</button>
			</div>
		</div>
	{/if}

	{#if voteOpen && snap}
		<!-- 인스타 "메시지 요청" 배너 패턴 -->
		<div class="extend">
			<div class="q">
				{#if snap.my_vote === true}
					<strong>상대의 대답을 기다리는 중</strong>
					<span>둘 다 원해야 {snap.extend_minutes}분 이어져요</span>
				{:else}
					<strong>{snap.extend_minutes}분 더 얘기할까요?</strong>
					{#if snap.partner_vote === true}
						<span class="want">상대가 연장을 원해요</span>
					{:else}
						<span>둘 다 원해야 이어져요</span>
					{/if}
				{/if}
			</div>
			{#if snap.my_vote !== true}
				<div class="acts">
					<button class="no" onclick={() => vote(false)} disabled={room?.voting}>그만하기</button>
					<button class="yes" onclick={() => vote(true)} disabled={room?.voting}>더 얘기하기</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if !room?.connected && !loading && !closed}
		<div class="conn">연결 중…</div>
	{/if}

	<div class="sr-only" aria-live="polite">{announce}</div>
	<div class="list" bind:this={listEl} onscroll={onScroll} role="region" aria-label="대화 내용">
		{#if loading}
			<div class="empty muted">불러오는 중…</div>
		{:else if room}
			{#if room.snap}
				<ChatIntro alias={room.snap.partner_alias} online={partnerOnline} {profile} onprofile={() => openSheet('profile')} />
			{/if}
			{#each room.msgs as m, i (m.client_msg_id)}
				{@const p = pos(room.msgs, i)}
				{@const sep = timeSep(i)}
				{#if sep}<div class="time-sep num">{sep}</div>{/if}
				{#if m.sender_seat === 0}
					<div class="sys">{m.body}</div>
				{:else}
					{@const mine = m.sender_seat === room.seat}
					{@const rx = m.id != null ? summarize(room.reactions[m.id]) : null}
					{@const dx = swiped?.key === m.client_msg_id ? swiped.dx : 0}
					<!-- 밀어서 답장은 줄 전체에서 — 말풍선 옆 빈자리를 밀어도 된다 -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="row"
						class:mine
						class:gap={p.first || m.reply_to != null}
						data-mid={m.id}
						onpointerdown={(e) => {
							if (m.id != null && !locked) swipe.down(e, m);
						}}
						onpointermove={swipe.move}
						onpointerup={() => swipe.up()}
						onpointercancel={swipe.cancel}
					>
						<div
							class="bwrap"
							class:reacted={!!rx}
							class:flash={m.id != null && m.id === flashId}
							class:swiping={dx !== 0}
							style:transform={dx ? `translateX(${dx}px)` : null}
						>
							{#if dx}
								<!-- 민 쪽 반대편(드러난 자리)에 답장 화살표 — 끝까지 밀면 진해진다 -->
								<span
									class="swipe-ic"
									class:left={dx > 0}
									class:hit={Math.abs(dx) >= 64}
									style:opacity={Math.min(1, Math.abs(dx) / 64)}
									aria-hidden="true"
								>
									<svg viewBox="0 0 24 24" fill="none">
										<path d="M10 8L5 12l5 4M5.5 12H14a5 5 0 0 1 5 5v1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
								</span>
							{/if}
							{#if m.reply_to != null}
								{@const orig = byId.get(m.reply_to)}
								<ReplyQuote
									label={orig ? `${whose(orig)} 메시지에 답장` : '답장'}
									text={orig?.body ?? null}
									{mine}
									onclick={() => jumpTo(m.reply_to!)}
								/>
							{/if}
							<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
							<div
								class="bubble"
								class:first={p.first}
								class:last={p.last}
								class:sending={m.state === 'sending'}
								class:failed={m.state === 'failed' || m.state === 'rate_limited'}
								onclick={() => (m.state === 'failed' || m.state === 'rate_limited') && room?.retry(m)}
								onpointerdown={(e) => press.down(e, m)}
								onpointermove={press.move}
								onpointerup={() => {
									if (!swipe.active) press.up(m); // 밀기였으면 톡으로 세지 않는다 (줄의 손 떼기보다 먼저 온다)
								}}
								onpointercancel={press.cancel}
								onpointerleave={press.cancel}
								oncontextmenu={(e) => press.menu(e, m)}
							>
								<span class="sr-only">{mine ? '나' : room.snap?.partner_alias}: </span>{m.body}
							</div>
							{#if rx}
								<ReactionBadge
									summary={rx}
									{mine}
									onclick={(e) => openPicker(m, (e.currentTarget as Element).previousElementSibling)}
								/>
							{/if}
						</div>
						{#if m.state === 'failed' || m.state === 'rate_limited'}
							<button class="fail" onclick={() => room?.retry(m)} aria-label="다시 보내기">!</button>
						{/if}
					</div>
					{#if mine && m.id != null && m.id === lastMineId && seenMine}
						<div class="seen">읽음</div>
					{/if}
				{/if}
			{/each}

			{#if partnerTyping && !locked}
				<div class="row gap">
					<div class="bubble first last typing"><i></i><i></i><i></i></div>
				</div>
			{/if}

			{#if pending && !closed}
				<div class="sys">
					{room.snap?.partner_joined
						? '상대가 들어와 있어요. 곧 시작해요'
						: '상대가 들어오기를 기다리고 있어요. 둘 다 들어오면 시간이 흐르기 시작해요'}
				</div>
			{/if}

			{#if closed}
				<div class="ended">
					<p>{endedText}</p>
					<p class="muted small">이 대화는 이 화면을 떠나면 다시 볼 수 없어요.</p>
					<button class="btn" onclick={backToSeek}>새 대화 찾기</button>
					<button class="btn-ghost" onclick={() => goBack('/')}>대화 목록</button>
					{#if !room.reported}
						<!-- 대화가 끝난 뒤에야 신고를 결심하는 경우가 많다 — 서버는 닫힌 방도 받는다 -->
						<button class="btn-text report-after" onclick={() => openSheet('report')}>이 대화 신고하기</button>
					{/if}
				</div>
			{:else if timeUp}
				<div class="sys">시간 종료</div>
			{/if}
		{/if}
	</div>

	{#if !closed}
		<div class="composer">
			{#if showStarters && room}
				<Starters roomId={room.roomId} mine={S.profile?.interests ?? []} theirs={profile?.interests ?? []} onpick={useStarter} />
			{/if}
			{#if replyTo}
				<div class="replying">
					<div class="replying-text">
						<b>{replyTo.sender_seat === room?.seat ? '내 메시지에 답장' : `${room?.snap?.partner_alias ?? '상대'}에게 답장`}</b>
						<span>{replyTo.body}</span>
					</div>
					<button class="replying-x" onclick={() => (replyTo = null)} aria-label="답장 취소">✕</button>
				</div>
			{/if}
			<div class="pill" class:disabled={locked}>
				<textarea
					bind:this={inputEl}
					bind:value={draft}
					rows="1"
					placeholder={pending ? '둘 다 들어오면 시작돼요' : locked ? '대화할 수 없어요' : '메시지 보내기…'}
					disabled={locked || loading}
					oninput={() => room?.onInput()}
					onkeydown={onKey}
				></textarea>
				<button class="send" onclick={submit} disabled={!draft.trim() || locked}>보내기</button>
			</div>
		</div>
	{/if}
</div>

{#if showMatch && room?.snap}
	<MatchScreen alias={room.snap.partner_alias} minutes={S.settings?.room_minutes ?? 10} ondone={matchDone} />
{/if}

{#if picker}
	<ReactionPicker
		at={picker}
		react={picker.react}
		current={myReaction}
		onpick={(k) => doReact(picker!.id, k)}
		onreply={() => startReply()}
		oncopy={copy}
		onclose={() => (picker = null)}
	/>
{/if}

{#if sheet}
	<Sheet onclose={() => (sheet = null)}>
		{#if sheet === 'profile'}
			<PartnerCard alias={room?.snap?.partner_alias ?? null} {profile} loading={profileLoading} />
			<button class="item" onclick={() => (sheet = null)}>닫기</button>
		{:else if sheet === 'menu'}
			<button class="item" onclick={() => openSheet('profile')}>프로필 보기</button>
			<button class="item danger" onclick={() => openSheet('report')}>신고하기</button>
			<button class="item danger" onclick={() => openSheet('block')}>차단하기</button>
			<button class="item" onclick={() => openSheet('leave')}>대화 나가기</button>
			<button class="item" onclick={() => (sheet = null)}>취소</button>
		{:else if sheet === 'leave'}
			<p class="warn">나가면 이 대화는 두 사람 모두에게서 끝나고<br />다시 볼 수 없어요.</p>
			<button class="item danger" onclick={leave}>나가기</button>
			<button class="item" onclick={() => (sheet = null)}>취소</button>
		{:else if sheet === 'block'}
			<p class="warn">
				차단하면 대화가 바로 끝나고 <strong>다시는 이 사람과 연결되지 않아요.</strong><br />
				상대에게는 차단했다는 사실이 알려지지 않아요.
			</p>
			<button class="item danger" onclick={block} disabled={acting}>차단하기</button>
			<button class="item" onclick={() => (sheet = null)}>취소</button>
		{:else if sheet === 'report'}
			<ReportPicker
				bind:reason={reportReason}
				bind:note={reportNote}
				title="무엇이 문제였나요?"
				intro="신고하면 대화가 끝나고 자동으로 차단돼요. 대화 내용은 운영진만 확인하고, 상대는 누가 신고했는지 알 수 없어요."
			/>
			<button class="item danger" onclick={report} disabled={!reportReason || acting}>
				{acting ? '신고하는 중…' : '신고하기'}
			</button>
			<button class="item" onclick={() => (sheet = null)}>취소</button>
		{/if}
	</Sheet>
{/if}

<style>
	.chat {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		/* 보이는 영역에 고정 — 키보드가 올라와도 페이지째 밀려 올라가지 않는다 */
		position: fixed;
		top: 0;
		left: 50%;
		width: 100%;
		max-width: 520px;
		transform: translate(-50%, var(--vv-top, 0px));
		background: var(--bg);
		overflow: hidden;
	}
	@media (min-width: 560px) {
		.chat {
			border-inline: 1px solid var(--line);
		}
	}
	/* 키보드가 떠 있을 때는 홈 인디케이터 여백이 필요 없다 */
	.chat.keyboard .composer {
		padding-bottom: 8px;
	}

	/* ── 헤더 ── */
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		text-align: left;
	}
	.names {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.2;
	}
	.alias {
		font-weight: 600;
		font-size: 15px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 12px;
		color: var(--text-2);
	}
	.timer {
		margin-left: auto;
		font-size: 15px;
		font-weight: 600;
	}
	.timer.urgent {
		color: var(--danger);
	}
	.timer.dim {
		color: var(--text-2);
	}
	.more {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		margin-right: -4px;
	}
	.more svg {
		width: 22px;
		height: 22px;
	}

	/* ── 연장 배너 ── */
	.extend {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px var(--pad);
		background: var(--surface);
		border-bottom: 1px solid var(--line);
	}
	.q {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.3;
	}
	.q strong {
		font-size: 15px;
		font-weight: 600;
	}
	.q span {
		font-size: 12px;
		color: var(--text-2);
	}
	.q .want {
		color: var(--accent);
		font-weight: 600;
	}
	.acts {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: none;
	}
	.acts .no {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}
	.acts .yes {
		height: 32px;
		padding: 0 12px;
		border-radius: var(--r-sm);
		background: var(--accent-fill);
		color: var(--on-accent);
		font-size: 14px;
		font-weight: 600;
	}
	.acts button:disabled {
		opacity: 0.5;
	}

	/* ── 하단 시트 (모양은 Sheet · ReportPicker) ── */
	.report-after {
		margin-top: 6px;
		color: var(--text-2);
		font-weight: 500;
		font-size: 13px;
	}

	.conn {
		padding: 6px var(--pad);
		font-size: 12px;
		text-align: center;
		color: var(--text-2);
		background: var(--surface);
		border-bottom: 1px solid var(--line);
	}

	/* ── 메시지 목록 ── */
	.list {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden; /* 밀어서 답장 중인 말풍선이 옆으로 삐져나가도 가로 스크롤이 생기지 않게 */
		overscroll-behavior: contain;
		padding: 12px var(--pad) 8px;
		display: flex;
		flex-direction: column;
	}
	.empty {
		margin: auto;
		font-size: 14px;
	}
	.sys {
		align-self: center;
		max-width: 85%;
		margin: 14px 0 10px;
		text-align: center;
		font-size: 12px;
		color: var(--text-2);
		line-height: 1.5;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 2px;
		touch-action: pan-y; /* 줄 어디서든 옆으로 밀면 답장, 위아래는 스크롤 */
	}
	.row.gap {
		margin-top: 8px;
	}
	.row.mine {
		justify-content: flex-end;
	}

	.bubble {
		max-width: 75%;
		padding: 8px 13px;
		border-radius: var(--r-bubble);
		background: var(--field);
		color: var(--text);
		font-size: 15px;
		line-height: 1.38;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		transition: opacity 0.15s;
	}
	/* 상대(왼쪽) 묶음: 왼쪽 인접 모서리를 줄인다 */
	.row:not(.mine) .bubble:not(.first) {
		border-top-left-radius: 4px;
	}
	.row:not(.mine) .bubble:not(.last) {
		border-bottom-left-radius: 4px;
	}
	/* 나(오른쪽) 묶음: 오른쪽 인접 모서리를 줄인다 */
	.mine .bubble {
		/* 목록 높이만큼의 그라디언트를 말풍선 위치(--by)만큼 올려서 보여준다 — 위 paintSoon() */
		background-color: #9a36e4;
		background-image: var(--bubble-fill);
		background-size: 100% var(--lh, 100%);
		background-position: 0 var(--by, 0);
		background-repeat: no-repeat;
		color: var(--on-accent);
	}
	.mine .bubble:not(.first) {
		border-top-right-radius: 4px;
	}
	.mine .bubble:not(.last) {
		border-bottom-right-radius: 4px;
	}
	.time-sep {
		align-self: center;
		margin: 14px 0 4px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-2);
	}

	/* ── 답장 ── */
	.bwrap.flash .bubble {
		animation: flash 1.2s ease-out;
	}
	@keyframes flash {
		0%,
		40% {
			filter: brightness(0.82);
			transform: scale(1.03);
		}
	}
	/* 동작 줄이기: 커지지 않고 어두워지기만 — 어디로 왔는지는 알려야 하니 끄지는 않는다 */
	@media (prefers-reduced-motion: reduce) {
		.bwrap.flash .bubble {
			animation: flash-still 1.2s ease-out !important;
		}
	}
	@keyframes flash-still {
		0%,
		40% {
			filter: brightness(0.82);
		}
	}
	.replying {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 4px 8px 12px;
	}
	.replying-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
		position: relative;
		padding-left: 13px;
		font-size: 13px;
	}
	/* 왼쪽 세로줄 — 설정의 테마 색상(내 말풍선 색)을 따른다 */
	.replying-text::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		border-radius: 2px;
		background: var(--bubble-fill);
	}
	.replying-text b {
		font-weight: 600;
	}
	.replying-text span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--text-2);
	}
	.replying-x {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		color: var(--text-2);
		font-size: 14px;
	}

	/* ── 공감 ── */
	.bwrap {
		position: relative;
		max-width: 75%;
		min-width: 0;
		transition: transform 0.2s ease-out; /* 놓으면 제자리로 */
	}
	.bwrap.swiping {
		transition: none; /* 끄는 동안은 손가락을 바로 따라간다 */
	}
	.swipe-ic {
		position: absolute;
		top: 50%;
		left: calc(100% + 10px);
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		margin-top: -15px;
		border-radius: 50%;
		background: var(--field);
		color: var(--text-2);
		transition: transform 0.12s ease-out;
	}
	.swipe-ic.left {
		left: auto;
		right: calc(100% + 10px);
	}
	.swipe-ic.hit {
		color: var(--text);
		transform: scale(1.12);
	}
	.swipe-ic svg {
		width: 18px;
		height: 18px;
	}
	.bwrap.reacted {
		margin-bottom: 14px;
	}
	.bwrap .bubble {
		max-width: none;
		/* 폰: 길게 누르면 글자 선택 대신 공감 고르기 (복사는 고르기 줄에) */
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
		touch-action: pan-y; /* 위아래는 스크롤, 옆으로 밀기는 답장 (두 번 톡 확대도 막힌다) */
	}
	/* 마우스가 있는 기기: 길게 누르기 대신 오른쪽 클릭이 고르기라, 드래그로 글자를 골라 복사할 수 있다 */
	@media (hover: hover) and (pointer: fine) {
		.bwrap .bubble {
			-webkit-user-select: text;
			user-select: text;
		}
	}
	.bubble.sending {
		opacity: 0.5;
	}
	.bubble.failed {
		opacity: 0.5;
		cursor: pointer;
	}
	.fail {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--danger);
		color: #fff;
		font-size: 13px;
		font-weight: 700;
		order: -1;
	}
	.seen {
		align-self: flex-end;
		margin-top: 3px;
		font-size: 11px;
		color: var(--text-2);
	}

	.typing {
		display: flex;
		gap: 4px;
		padding: 13px 14px;
	}
	.typing i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-2);
		animation: blink 1.2s infinite;
	}
	.typing i:nth-child(2) {
		animation-delay: 0.2s;
	}
	.typing i:nth-child(3) {
		animation-delay: 0.4s;
	}
	@keyframes blink {
		0%,
		60%,
		100% {
			opacity: 0.25;
		}
		30% {
			opacity: 1;
		}
	}

	.ended {
		margin: 24px 0 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		text-align: center;
	}
	.ended p {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}
	.ended .small {
		font-size: 12px;
		font-weight: 400;
		margin-bottom: 8px;
	}

	/* ── 입력창 ── */
	.composer {
		padding: 8px var(--pad) calc(8px + env(safe-area-inset-bottom));
		background: var(--bg);
	}
	.pill {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		min-height: 44px;
		padding: 6px 8px 6px 16px;
		border: 1px solid var(--line);
		border-radius: var(--r-bubble);
	}
	.pill.disabled {
		background: var(--surface);
	}
	textarea {
		flex: 1;
		min-width: 0;
		padding: 6px 0;
		border: 0;
		outline: none;
		resize: none;
		background: none;
		font-size: 15px;
		line-height: 1.38;
		max-height: 120px;
	}
	textarea::placeholder {
		color: var(--text-2);
	}
	.send {
		flex: none;
		padding: 6px 6px 7px;
		color: var(--accent);
		font-weight: 600;
		font-size: 15px;
	}
	.send:disabled {
		color: var(--text-2);
		opacity: 0.6;
		cursor: default;
	}
</style>
