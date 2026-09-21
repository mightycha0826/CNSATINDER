<script lang="ts">
	/**
	 * 대화방 화면 — ChatRoom 상태만 읽어서 그린다.
	 * 실제 방(/chat)과 개발용 미리보기(/dev/chat)가 같은 컴포넌트를 쓴다.
	 */
	import { goto } from '$app/navigation';
	import { tick, untrack } from 'svelte';
	import { S, toast } from '$lib/state.svelte';
	import type { ChatRoom } from './room.svelte';
	import type { Msg, ReportReason } from './types';
	import { avatarColor, avatarInitial } from '$lib/avatar';

	let {
		room,
		loading,
		initialSheet = null
	}: {
		room: ChatRoom | null;
		loading: boolean;
		/** 개발용 미리보기에서만 사용 */
		initialSheet?: null | 'menu' | 'report' | 'block' | 'leave';
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
	const mmss = $derived.by(() => {
		const s = Math.ceil(remainMs / 1000);
		return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
	});
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
		if (r === 'too_early') toast('아직 연장할 수 있는 시간이 아니에요');
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
		void goto('/?seek', { replaceState: true });
	}

	// ── 메뉴 · 신고 · 차단 ───────────────────────────────────────
	// 시트는 한 번에 한 화면: menu → (leave | block | report) 확인
	let sheet = $state<null | 'menu' | 'leave' | 'block' | 'report'>(untrack(() => initialSheet));
	let reportReason = $state<ReportReason | null>(null);
	let reportNote = $state('');
	let acting = $state(false);

	const REASONS: { v: ReportReason; label: string }[] = [
		{ v: 'personal_info', label: '이름·학번·SNS를 캐물어요' },
		{ v: 'sexual', label: '성적인 말을 해요' },
		{ v: 'harassment', label: '욕설·괴롭힘' },
		{ v: 'hate', label: '혐오 표현' },
		{ v: 'impersonation', label: '다른 사람인 척해요' },
		{ v: 'spam', label: '도배·광고' },
		{ v: 'other', label: '기타' }
	];

	function openSheet(s: typeof sheet) {
		sheet = s;
		reportReason = null;
		reportNote = '';
	}

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
		toast(ok ? '차단했어요. 다시는 만나지 않아요' : '연결을 확인해 주세요');
	}

	async function report() {
		if (!room || !reportReason || acting) return;
		acting = true;
		const ok = await room.report(reportReason, reportNote.trim());
		acting = false;
		sheet = null;
		toast(ok ? '신고했어요. 운영진이 확인할게요' : '연결을 확인해 주세요');
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

	// ── 스크롤 ───────────────────────────────────────────────────
	function scrollToBottom(smooth = true) {
		listEl?.scrollTo({ top: listEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
	}
	function onScroll() {
		if (!listEl) return;
		atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 48;
		if (atBottom) room?.markRead();
	}
	// 새 메시지가 오면, 맨 아래를 보고 있을 때만 따라 내려간다
	$effect(() => {
		void room?.msgs.length;
		void partnerTyping;
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
		draft = '';
		atBottom = true;
		inputEl?.focus();
		await room.send(text);
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

	// ★ 상대가 신고/차단해서 끝났을 때 사유를 알려주지 않는다 — "상대가 대화를 종료했어요"로 통일.
	//   신고당한 걸 알면 보복하거나 신고를 피하는 법을 배운다.
	const ENDED_BY_PARTNER: Record<string, string> = {
		expired: '시간이 다 되어 대화가 끝났어요',
		declined: '연장하지 않기로 해서 대화가 끝났어요',
		skipped: '상대가 다음 대화로 넘어갔어요',
		left: '상대가 대화를 종료했어요',
		reported: '상대가 대화를 종료했어요',
		blocked: '상대가 대화를 종료했어요',
		no_show: '상대가 들어오지 않았어요',
		admin: '운영진이 대화를 종료했어요'
	};
	const ENDED_BY_ME: Record<string, string> = {
		left: '대화를 나갔어요',
		skipped: '대화를 나갔어요',
		declined: '연장하지 않기로 해서 대화가 끝났어요',
		reported: '신고했어요. 운영진이 대화 내용을 확인할게요',
		blocked: '차단했어요. 이 사람과는 다시 만나지 않아요'
	};
	const endedText = $derived.by(() => {
		const r = room?.snap?.close_reason ?? '';
		return (room?.endedByMe ? ENDED_BY_ME[r] : undefined) ?? ENDED_BY_PARTNER[r] ?? '대화가 끝났어요';
	});
</script>

<div class="chat">
	<header class="topbar">
		<button class="back" onclick={() => goto('/')} aria-label="뒤로">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>

		{#if room?.snap}
			{@const alias = room.snap.partner_alias}
			<div class="who">
				<div class="av" style:background={avatarColor(alias)}>
					{avatarInitial(alias)}
					{#if room.partnerHere && !closed}<span class="dot"></span>{/if}
				</div>
				<div class="names">
					<span class="alias">{alias}</span>
					<span class="sub">
						{#if closed}대화 종료{:else if pending}{room.snap.partner_joined ? '곧 시작해요' : '상대를 기다리는 중'}{:else if room.partnerHere}지금 보고 있음{:else}익명{/if}
					</span>
				</div>
			</div>
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

	<div class="list" bind:this={listEl} onscroll={onScroll}>
		{#if loading}
			<div class="empty muted">불러오는 중…</div>
		{:else if room}
			{#each room.msgs as m, i (m.client_msg_id)}
				{@const p = pos(room.msgs, i)}
				{#if m.sender_seat === 0}
					<div class="sys">{m.body}</div>
				{:else}
					{@const mine = m.sender_seat === room.seat}
					<div class="row" class:mine class:gap={p.first}>
						<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
						<div
							class="bubble"
							class:first={p.first}
							class:last={p.last}
							class:sending={m.state === 'sending'}
							class:failed={m.state === 'failed' || m.state === 'rate_limited'}
							onclick={() => (m.state === 'failed' || m.state === 'rate_limited') && room?.retry(m)}
						>
							{m.body}
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
						? '상대가 들어왔어요. 곧 시작해요'
						: '상대가 들어오기를 기다리고 있어요. 둘 다 들어오면 시간이 흐르기 시작해요'}
				</div>
			{/if}

			{#if closed}
				<div class="ended">
					<p>{endedText}</p>
					<p class="muted small">이 대화는 이 화면을 떠나면 다시 볼 수 없어요.</p>
					<button class="btn" onclick={() => goto('/?seek', { replaceState: true })}>새 대화 찾기</button>
					{#if !room.reported}
						<!-- 대화가 끝난 뒤에야 신고를 결심하는 경우가 많다 — 서버는 닫힌 방도 받는다 -->
						<button class="btn-text report-after" onclick={() => openSheet('report')}>이 대화 신고하기</button>
					{/if}
				</div>
			{:else if timeUp}
				<div class="sys">시간이 다 됐어요</div>
			{/if}
		{/if}
	</div>

	{#if !closed}
		<div class="composer">
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

{#if sheet}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="scrim" onclick={() => (sheet = null)}>
		<div class="sheet" onclick={(e) => e.stopPropagation()}>
			{#if sheet === 'menu'}
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
				<div class="report">
					<h3>무엇이 문제였나요?</h3>
					<p class="warn left">
						신고하면 대화가 끝나고 자동으로 차단돼요. 대화 내용은 운영진만 확인하고,
						상대는 누가 신고했는지 알 수 없어요.
					</p>
					<div class="reasons">
						{#each REASONS as r (r.v)}
							<button class="reason" class:on={reportReason === r.v} onclick={() => (reportReason = r.v)}>
								{r.label}
							</button>
						{/each}
					</div>
					<textarea
						class="note"
						bind:value={reportNote}
						rows="2"
						maxlength="1000"
						placeholder="운영진에게 더 알려줄 내용 (선택)"
					></textarea>
				</div>
				<button class="item danger" onclick={report} disabled={!reportReason || acting}>
					{acting ? '신고하는 중…' : '신고하기'}
				</button>
				<button class="item" onclick={() => (sheet = null)}>취소</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.chat {
		display: flex;
		flex-direction: column;
		height: 100dvh;
	}

	/* ── 헤더 ── */
	.back {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		margin-left: -4px;
	}
	.back svg {
		width: 24px;
		height: 24px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.av {
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		color: #fff;
		font-weight: 600;
		font-size: 14px;
	}
	.dot {
		position: absolute;
		right: -1px;
		bottom: -1px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #3ec70b;
		border: 2px solid var(--bg);
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

	/* ── 하단 시트 ── */
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		background: rgb(0 0 0 / 0.45);
	}
	.sheet {
		width: 100%;
		max-width: 520px;
		padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
		border-radius: 12px 12px 0 0;
		background: var(--bg);
	}
	.item {
		display: block;
		width: 100%;
		height: 50px;
		font-size: 15px;
		border-top: 1px solid var(--line);
	}
	.item:first-child {
		border-top: 0;
	}
	.item.danger {
		color: var(--danger);
		font-weight: 600;
	}
	.warn {
		margin: 8px var(--pad) 12px;
		text-align: center;
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-2);
	}
	.warn + .item {
		border-top: 1px solid var(--line);
	}
	.warn strong {
		color: var(--text);
		font-weight: 600;
	}
	.warn.left {
		text-align: left;
		margin: 0 0 12px;
	}
	.item:disabled {
		opacity: 0.4;
	}

	/* 신고 */
	.report {
		padding: 8px var(--pad) 12px;
	}
	.report h3 {
		margin: 4px 0 8px;
		font-size: 16px;
		font-weight: 700;
	}
	.reasons {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 10px;
	}
	.reason {
		height: 34px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 17px;
		font-size: 14px;
	}
	.reason.on {
		border-color: var(--text);
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
	}
	.note {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		background: var(--surface);
		resize: none;
		outline: none;
		font-size: 14px;
	}
	.report + .item {
		border-top: 1px solid var(--line);
	}
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
		/* fixed: 그라디언트를 화면에 고정 → 위쪽 말풍선은 보라, 아래쪽은 분홍.
		   iOS Safari 는 fixed 를 무시하고 말풍선마다 그라디언트를 그린다 (그래도 자연스럽다) */
		background: var(--bubble-fill) fixed;
		color: var(--on-accent);
	}
	.mine .bubble:not(.first) {
		border-top-right-radius: 4px;
	}
	.mine .bubble:not(.last) {
		border-bottom-right-radius: 4px;
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
