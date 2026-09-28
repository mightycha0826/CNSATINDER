<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, pushState as pushHistory, replaceState as replaceHistory } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { INBOX, type InboxRoom } from '$lib/inbox.svelte';
	import { S, UI, toast } from '$lib/state.svelte';
	import { Seeker } from '$lib/seeker.svelte';
	import { enablePush, pushState } from '$lib/push';
	import { isRestricted } from '$lib/restriction';
	import { mmss } from '$lib/time';
	import { scrollBehavior } from '$lib/motion';
	import Sheet from '$lib/ui/Sheet.svelte';
	import TopbarMe from '$lib/ui/TopbarMe.svelte';
	import AiChat from '$lib/ai/AiChat.svelte';
	import RoomMenu from '$lib/chat/RoomMenu.svelte';
	import { longpress } from '$lib/longpress';
	import RateModal from '$lib/chat/RateModal.svelte';
	import { fetchPendingRatings, ratePartner, skipRating, skippedRatings, type PendingRating, type Reason, type Score } from '$lib/manner';

	/**
	 * 홈 = 대화 목록 (인스타 DM 받은편지함).
	 * 위에는 새 상대 찾기, 아래에는 지금 열려 있는 대화들. 여러 대화를 동시에 이어갈 수 있다.
	 * 대화 줄을 길게 누르면(마우스는 오른쪽 클릭) 신고 · 차단 · 나가기 (RoomMenu).
	 */

	const closed = $derived(S.settings ? !S.settings.is_open : false);
	// 영구/무기한 정지(status) 또는 기간 정지(suspended_until)
	// ★ 프로필을 아직(또는 못) 불러왔을 때를 정지로 착각하지 않는다 — 예전엔 profile 이 null 이면
	//   status !== 'active' 가 참이 되어 멀쩡한 계정에 "이용이 제한된 계정"이 떴다.
	const suspended = $derived(!!S.profile && isRestricted(S.profile, S.now));
	const profileMissing = $derived(S.booted && !!S.session && !S.profile && !S.profileLoading);
	const suspendedUntil = $derived(
		S.profile?.status === 'active' && S.profile?.suspended_until
			? new Date(S.profile.suspended_until).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
			: null
	);
	const minutes = $derived(S.settings?.room_minutes ?? 10);
	const maxRooms = $derived(S.settings?.max_open_rooms ?? 5);

	// 앱 틀이 켜 둔 대화 목록 — 다른 탭에 다녀와도 기억해 둔 목록을 바로 그리고 뒤에서 새로 읽는다
	const inbox = INBOX;

	// ── 매너 평가 대기 (Phase 30 · 35) — 방금 끝난 대화 · 고정한 대화 중 아직 평가 안 한 것 하나를 화면 가운데 큰 카드로 (RateModal) ──
	let pending = $state<PendingRating[]>([]);
	let skipped = $state(new Set<string>());
	const toRate = $derived(pending.find((p) => !skipped.has(p.room_id)) ?? null);
	// 평가할 대화가 생기는 때 = 대화가 끝나거나 고정될 때뿐 — 그때(대화 목록에서 끝난 · 고정된 방이 바뀔 때)만 다시 묻는다.
	// 예전엔 1분마다 물었다 (요청 하나하나가 Supabase 로그 사용량이 된다, Phase 36)
	const doneKey = $derived(
		inbox.rooms
			.filter((r) => r.status === 'closed' || r.pinned)
			.map((r) => r.room_id)
			.sort()
			.join(',')
	);
	$effect(() => {
		skipped = skippedRatings();
	});
	$effect(() => {
		if (!inbox.loaded) return;
		void doneKey;
		void fetchPendingRatings().then((r) => (pending = r));
	});
	function skip(p: PendingRating) {
		skipRating(p.room_id);
		skipped = new Set([...skipped, p.room_id]);
	}
	async function sendRate(p: PendingRating, score: Score, reasons: Reason[]) {
		try {
			const r = await ratePartner(p.room_id, score, reasons);
			if (r === 'ok' || r === 'already') return true;
			toast('이 대화는 평가할 수 없어요');
		} catch {
			toast('연결을 확인해 주세요');
			return false;
		}
		pending = pending.filter((x) => x.room_id !== p.room_id);
		return false;
	}
	function rateClosed(p: PendingRating, how: 'sent' | 'skip') {
		if (how === 'skip') skip(p);
		else pending = pending.filter((x) => x.room_id !== p.room_id);
	}
	const seeker = new Seeker(
		// AI 대화가 열려 있었으면 그 기록 자리를 대화방으로 바꿔 끼운다 (대화방에서 뒤로 → AI 가 아니라 홈)
		(roomId) => void goto(`/chat/${roomId}`, { state: { matched: true }, replaceState: !!page.state.ai }),
		(msg) => toast(msg)
	);

	// ── AI 대화 상대 — 찾는 동안만. 홈 위에 덮어 띄운다(홈이 살아 있어야 찾기가 계속된다) ──
	// 얕은 기록 하나를 쌓아서 열고, 뒤로가기(또는 닫기)로 걷어서 닫는다
	const aiOpen = $derived(!!page.state.ai);
	function openAi() {
		pushHistory('', { ...page.state, ai: true });
	}
	function closeAi() {
		if (page.state.ai) history.back();
	}
	/** 찾기를 새로 시작 — 전에 열어 둔 AI 기록 표시가 남아 있으면 지운다 (찾기 시작과 동시에 AI 가 튀어나오지 않게) */
	function startSeek() {
		if (page.state.ai) replaceHistory('', { ...page.state, ai: false });
		seeker.start();
	}
	// 고정한 대화(Phase 29)는 동시 대화 개수에 세지 않는다 — 서버(private.open_rooms)와 같은 규칙
	const openCount = $derived(inbox.rooms.filter((r) => !r.pinned).length);
	// 고정한 대화는 위쪽 "스토리" 줄에 (인스타처럼 그라디언트 테두리), 아래 목록은 시간이 흐르는 대화만
	const pinnedRooms = $derived(inbox.rooms.filter((r) => r.pinned));
	const liveRooms = $derived(inbox.rooms.filter((r) => !r.pinned));
	const full = $derived(openCount >= maxRooms);
	let menuFor = $state<InboxRoom | null>(null);

	// ★ 본문 전체를 untrack — 화면에 들어올 때 한 번만 돈다. 예전엔 page.url(AI 대화를 뒤로 닫으면 새 객체가 된다)과
	//   seeker.seeking(start 가 읽고 쓴다)을 추적해서 다시 돌았고, 그때 cleanup 이 찾기를 말없이 멈췄다 (Phase 39)
	$effect(() => {
		untrack(() => {
			inbox.start();
			void inbox.load();
			// 대화가 끝나고 "새 대화 찾기"로 왔으면 바로 찾기 시작
			if (UI.seekOnHome) {
				UI.seekOnHome = false;
				seeker.start();
			} else if (page.url.searchParams.has('seek')) {
				// 옛 주소(/?seek) 호환 — 주소만 정리
				void goto('/', { replaceState: true, keepFocus: true, noScroll: true, state: page.state });
				seeker.start();
			}
		});
		return () => {
			inbox.stop();
			seeker.cancel(); // 화면을 떠나면 찾기 목록에서 빠진다
		};
	});

	const elapsed = $derived(seeker.seeking ? mmss(Math.floor((S.now - seeker.since) / 1000)) : '');

	function remain(r: InboxRoom) {
		// 멈춘 방은 불러온 때의 남은 시간 그대로 (둘 다 대화 화면을 볼 때만 흐른다)
		const ms = Math.max(0, Date.parse(r.expires_at) - (r.paused ? inbox.serverAt : S.now + inbox.skew));
		return { text: mmss(Math.ceil(ms / 1000)), urgent: !r.paused && ms <= 60_000 };
	}

	// ── 알림 권한 — 처음 한 번 묻는다 ──
	// 브라우저 권한 창은 사용자가 버튼을 눌렀을 때만 띄울 수 있다(iOS 는 그 외엔 아예 불가).
	// 그래서 먼저 우리 화면으로 이유를 설명하고, "알림 받기"를 누르면 그때 권한을 묻는다.
	const ASKED = 'push-asked-v1';
	let askPush = $state(false);
	$effect(() => {
		let asked = false;
		try {
			asked = localStorage.getItem(ASKED) === '1';
		} catch {
			/* 저장소를 못 쓰는 환경 — 매번 묻지 않도록 그냥 넘어간다 */
			asked = true;
		}
		if (!asked && pushState() === 'default') askPush = true;
	});
	function doneAsking() {
		askPush = false;
		try {
			localStorage.setItem(ASKED, '1');
		} catch {
			/* 무시 */
		}
	}
	async function allowPush() {
		const r = await enablePush();
		doneAsking();
		if (r === 'granted') toast('알림 켜짐');
		else if (r === 'denied') toast('알림이 꺼져 있어요. 설정에서 다시 켤 수 있어요');
	}

	function preview(r: InboxRoom) {
		if (r.status === 'pending') return r.joined ? '상대가 들어오기를 기다리는 중' : '새 대화 · 눌러서 시작하기';
		if (!r.last_body || r.last_seat === 0) return '대화를 시작해 보세요';
		return r.last_seat === r.my_seat ? `나: ${r.last_body}` : r.last_body;
	}
</script>

<div class="topbar">
	<!-- 로고 = 홈(채팅). 이미 홈이면 맨 위로 -->
	<a
		class="title wordmark logo"
		href="/"
		draggable="false"
		onclick={(e) => {
			if (page.url.pathname !== '/') return;
			e.preventDefault();
			window.scrollTo({ top: 0, behavior: scrollBehavior() });
		}}>CNSATINDER</a
	>
	<TopbarMe />
</div>

<div class="page home">
	{#if S.hasPassword === false}
		<button class="nudge" onclick={() => goto('/settings#password')}>
			<strong>비밀번호를 만들어 두세요</strong>
			<span>다음부터 인증 코드 없이 바로 로그인할 수 있어요 ›</span>
		</button>
	{/if}

	{#if S.settings?.notice}
		<div class="notice selectable">{S.settings.notice}</div>
	{/if}

	{#if pinnedRooms.length}
		<!-- 고정한 대화 — 스토리처럼 동그란 얼굴 줄 -->
		<section class="stories" aria-label="고정한 대화">
			{#each pinnedRooms as r (r.room_id)}
				<button class="story" onclick={() => goto(`/chat/${r.room_id}`)} use:longpress={() => (menuFor = r)} aria-label="{r.partner_alias} (고정한 대화){r.unread ? `, 새 메시지 ${r.unread}개` : ''}">
					<span class="story-ring" class:fresh={r.unread > 0}><Avatar name={r.partner_alias} size={58} online={r.partner_online} /></span>
					<span class="story-name">{r.partner_alias}</span>
					{#if r.unread > 0}<span class="story-badge num">{r.unread > 99 ? '99+' : r.unread}</span>{/if}
				</button>
			{/each}
		</section>
	{/if}

	<!-- 대화 목록 -->
	{#if liveRooms.length}
		<div class="head">
			<h2>대화</h2>
			<span class="muted num">{openCount}/{maxRooms}</span>
		</div>
		<ul class="rooms">
			{#each liveRooms as r (r.room_id)}
				{@const t = remain(r)}
				<li>
					<!-- 아직 안 열어 본 새 대화(상대가 나를 잡아감)면 연결 화면부터 -->
					<button
						class="room"
						onclick={() => goto(`/chat/${r.room_id}`, { state: { matched: !r.joined } })}
						use:longpress={() => (menuFor = r)}
					>
						<Avatar name={r.partner_alias} size={52} online={r.partner_online} />
						<span class="mid">
							<span class="name" class:bold={r.unread > 0 || !r.joined}>{r.partner_alias}</span>
							<span class="last" class:bold={r.unread > 0 || !r.joined}>{preview(r)}</span>
						</span>
						<span class="right">
							{#if r.pinned}
								<!-- 둘 다 고정한 대화 — 시간 제한이 없고 목록 맨 위 (서버가 먼저 정렬해 준다) -->
								<span class="pin" aria-label="고정한 대화">
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5h6l-1 5.5 3.5 3.5v1.5h-11V12.5L10 9 9 3.5zM12 14v6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" /></svg>
								</span>
							{:else if r.status === 'active'}
								<span class="time num" class:urgent={t.urgent} class:paused={r.paused}>{t.text}</span>
							{/if}
							{#if r.unread > 0}
								<span class="badge num">{r.unread > 99 ? '99+' : r.unread}</span>
							{:else if !r.joined}
								<span class="new"></span>
							{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else if inbox.loaded && seeker.seeking}
		<!-- 찾는 중 — 내 얼굴을 가운데 두고 퍼져 나가는 물결 (틴더식 레이더) -->
		<div class="radar" aria-hidden="true">
			<i></i><i></i><i></i>
			<span class="me-ring"><Avatar name={S.profile?.nickname ?? '나'} size={96} /></span>
		</div>
	{:else if inbox.loaded}
		<div class="hero">
			<div class="orb" aria-hidden="true"></div>
			<div class="hero-card">
				<div class="big num">{minutes}:00</div>
				<h1>모르는 사람과 {minutes}분</h1>
				<p>둘 다 원할 때만 이어져요</p>
			</div>
		</div>
	{/if}

	<!-- 새 상대 찾기 — 엄지가 닿는 아래쪽에 고정 (탭바 바로 위) -->
	<div class="cta">
		{#if seeker.seeking}
			<div class="seek">
				<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>
				<div class="seek-text">
					<strong>상대를 찾는 중 <span class="num muted">{elapsed}</span></strong>
					<span class="muted">
						{#if seeker.reason === 'cooldown'}
							너무 빨리 넘기고 있어요. 잠깐 쉬었다가 다시 찾을게요
						{:else if seeker.reason === 'filtered'}
							지금 찾는 사람들과는 조건이 맞지 않아요
						{:else if seeker.reason === 'empty'}
							지금은 찾는 사람이 없어요. 화면을 켜 두면 계속 찾아요
						{:else}
							잠시만요…
						{/if}
					</span>
				</div>
				<button class="stop" onclick={() => seeker.cancel()}>그만</button>
			</div>
			{#if S.settings?.ai_chat}
				<button class="ai-btn" onclick={openAi}>
					<span class="ai-badge" aria-hidden="true">AI</span> 기다리는 동안 AI 와 얘기하기
				</button>
			{/if}
		{:else if profileMissing}
			<button class="btn" disabled>계정 정보를 불러오지 못함 · 잠시 후 다시 열어 주세요</button>
		{:else if closed}
			<button class="btn" disabled>지금은 열려 있지 않아요</button>
		{:else if suspended}
			<button class="btn" disabled>
				{suspendedUntil ? `${suspendedUntil}까지 이용 제한` : '이용 제한된 계정'}
			</button>
		{:else if full}
			<button class="btn" disabled>대화는 동시에 {maxRooms}개까지 할 수 있어요</button>
		{:else}
			<button class="btn" onclick={startSeek}>새 대화 찾기</button>
		{/if}
	</div>
</div>

{#if aiOpen && seeker.seeking}
	<AiChat onclose={closeAi} seeking={elapsed} />
{/if}

{#if menuFor}
	<RoomMenu
		roomId={menuFor.room_id}
		alias={menuFor.partner_alias}
		onclose={() => (menuFor = null)}
		ondone={() => {
			menuFor = null;
			void inbox.load();
		}}
	/>
{/if}

{#if toRate && !askPush && !aiOpen}
	<!-- 방금 대화한 사람 평가 — 화면 가운데 큰 카드 안에서 끝낸다 (Phase 35) -->
	{#key toRate.room_id}
		{@const p = toRate}
		<RateModal {p} onsubmit={(s, r) => sendRate(p, s, r)} onclose={(how) => rateClosed(p, how)} />
	{/key}
{/if}

{#if askPush}
	<!-- 처음 한 번 — 알림 권한 안내. 바깥을 눌러 닫지 않는다 (둘 중 하나를 골라야 다시 묻지 않는다) -->
	<Sheet label="알림 받기">
		<div class="ask">
			<div class="bell" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none">
					<path
						d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>
			<h2 id="push-title">새 메시지 알림을 받을까요?</h2>
			<button class="btn" onclick={allowPush}>알림 받기</button>
			<button class="later" onclick={doneAsking}>나중에</button>
		</div>
	</Sheet>
{/if}

<style>
	/* 알림 권한 안내 (Sheet 안) */
	.ask {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 16px var(--pad) 8px;
		text-align: center;
	}
	.ask h2 {
		font-size: 18px;
	}
	.bell {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--accent-fill);
		color: #fff;
	}
	.bell svg {
		width: 28px;
		height: 28px;
	}
	.later:active {
		opacity: 0.55;
	}
	.later {
		height: 44px;
		padding: 0 16px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}

	.cta {
		position: sticky;
		bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
		margin-top: auto;
		padding: 18px 0 8px;
		/* 아래 목록이 버튼 뒤로 스며들게 — 바탕색으로 서서히 */
		background: linear-gradient(to bottom, transparent, var(--bg) 40%);
		z-index: 5;
		/* 위쪽 흐린 띠는 뒤의 목록 줄을 가로채지 않는다 — 버튼만 눌린다 (UX G1) */
		pointer-events: none;
	}
	.cta > :global(*) {
		pointer-events: auto;
	}

	.home {
		gap: 14px;
		padding-top: 12px;
		padding-bottom: 0; /* 아래 안전영역은 탭바가 맡는다 · 버튼 여백은 .cta 가 */
		background: var(--ambient) no-repeat;
	}

	/* 고정한 대화 — 스토리 줄 */
	.stories {
		display: flex;
		gap: 14px;
		margin: 0 calc(-1 * var(--pad));
		padding: 4px var(--pad) 6px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.stories::-webkit-scrollbar {
		display: none;
	}
	/* 누름 반응 (UX G2) */
	.story:active,
	.nudge:active,
	.ai-btn:active {
		transform: scale(0.96);
	}
	.story,
	.nudge,
	.ai-btn {
		transition: transform 0.15s;
	}
	.story {
		position: relative;
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		width: 72px;
	}
	.story-ring {
		padding: 3px;
		border-radius: 50%;
		background: var(--line);
	}
	.story-ring.fresh {
		background: conic-gradient(from 210deg, var(--g-orange), var(--g-pink), #ffb347, var(--g-orange));
	}
	.story-ring :global(.av) {
		border: 3px solid var(--bg);
	}
	.story-name {
		max-width: 100%;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 12px;
		font-weight: 600;
	}
	.story-badge {
		position: absolute;
		top: 0;
		right: 2px;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 10px;
		background: var(--accent-fill-deep);
		color: #fff;
		font-size: 11px;
		font-weight: 800;
		line-height: 20px;
		border: 2px solid var(--bg);
		box-sizing: content-box;
	}

	/* 찾는 중 — 레이더 */
	.radar {
		position: relative;
		flex: 1;
		display: grid;
		place-items: center;
		min-height: 300px;
	}
	.radar i {
		position: absolute;
		width: 110px;
		height: 110px;
		border-radius: 50%;
		background: radial-gradient(circle, color-mix(in srgb, var(--g-coral) 30%, transparent), transparent 70%);
		border: 1.5px solid color-mix(in srgb, var(--g-pink) 45%, transparent);
		animation: ripple 2.7s cubic-bezier(0.2, 0.6, 0.3, 1) infinite;
	}
	.radar i:nth-child(2) {
		animation-delay: 0.9s;
	}
	.radar i:nth-child(3) {
		animation-delay: 1.8s;
	}
	@keyframes ripple {
		from {
			transform: scale(0.8);
			opacity: 0.9;
		}
		to {
			transform: scale(3);
			opacity: 0;
		}
	}
	.me-ring {
		position: relative;
		padding: 4px;
		border-radius: 50%;
		background: var(--brand);
		box-shadow: var(--glow);
		animation: breathe 2.7s ease-in-out infinite;
	}
	.me-ring :global(.av) {
		border: 4px solid var(--bg);
	}
	@keyframes breathe {
		50% {
			transform: scale(1.05);
		}
	}

	.nudge {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 16px;
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-1);
		text-align: left;
		font-size: 13px;
	}
	.nudge span {
		color: var(--text-2);
		font-size: 12px;
	}

	.notice {
		padding: 12px 16px;
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-1);
		font-size: 13px;
	}

	/* 찾는 중 — 버튼 자리에 그대로 들어간다 (유리 알약) */
	.seek {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 54px;
		padding: 10px 12px 10px 18px;
		border-radius: 999px;
		background: var(--surface);
		box-shadow: var(--shadow-2);
	}
	.seek-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		font-size: 12px;
		line-height: 1.4;
	}
	.seek-text strong {
		font-size: 14px;
	}
	/* 로고(맨 위로) — 글자는 그대로, 누름 높이 44 */
	.logo {
		position: relative;
	}
	.logo::after {
		content: '';
		position: absolute;
		inset: -6px 0;
	}
	.stop:active {
		transform: scale(0.94);
	}
	.stop {
		flex: none;
		height: 44px;
		transition: transform 0.15s;
		padding: 0 14px;
		border-radius: 999px;
		background: var(--field);
		font-size: 14px;
		font-weight: 700;
	}
	.ai-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		min-height: 48px;
		margin-top: 8px;
		border-radius: 999px;
		background: var(--field);
		font-size: 14px;
		font-weight: 600;
	}
	.ai-badge {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--brand);
		color: #fff;
		font-size: 10px;
		font-weight: 800;
	}
	.dots {
		display: flex;
		gap: 5px;
		flex: none;
	}
	.dots i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--g-orange);
		animation: pulse 1.2s infinite;
	}
	/* 아이콘 그라디언트를 점 셋에 나눠 싣는다 */
	.dots i:nth-child(2) {
		background: var(--g-coral);
		animation-delay: 0.2s;
	}
	.dots i:nth-child(3) {
		background: var(--g-pink);
		animation-delay: 0.4s;
	}
	@keyframes pulse {
		0%,
		60%,
		100% {
			opacity: 0.2;
			transform: scale(0.85);
		}
		30% {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* 목록 */
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-top: 6px;
	}
	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}
	.head span {
		font-size: 13px;
	}
	/* 대화 목록 — 흰 카드 한 장 안에 줄들 */
	.rooms {
		list-style: none;
		margin: 0;
		padding: 6px 0;
		border-radius: var(--r-card);
		background: var(--surface);
		box-shadow: var(--shadow-1);
	}
	.room {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 9px 14px;
		text-align: left;
		transition: background 0.15s;
	}
	.room:active {
		background: var(--field);
	}
	.mid {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
	}
	.last {
		font-size: 13px;
		color: var(--text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.bold {
		font-weight: 700;
		color: var(--text);
	}
	.right {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.time {
		font-size: 12px;
		color: var(--text-2);
	}
	.pin {
		display: grid;
		place-items: center;
		color: var(--accent);
	}
	.pin svg {
		width: 16px;
		height: 16px;
	}
	.time.paused {
		opacity: 0.5;
	}
	.time.urgent {
		color: var(--danger);
	}
	.badge {
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 10px;
		background: var(--accent-fill-deep);
		color: var(--on-accent);
		font-size: 11px;
		font-weight: 700;
		display: grid;
		place-items: center;
	}
	/* 아직 열어 보지 않은 새 대화 — 인스타의 파란 점 자리 */
	.new {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--accent-fill-deep);
	}

	/* 빈 상태 — 천천히 도는 브랜드색 빛 덩어리 위에 유리 카드 */
	.hero {
		position: relative;
		flex: 1;
		display: grid;
		place-items: center;
		min-height: 320px;
		padding-bottom: 20px;
	}
	.orb {
		position: absolute;
		width: 260px;
		height: 260px;
		border-radius: 50%;
		background: conic-gradient(from 0deg, var(--g-orange), var(--g-pink), #ffb347, var(--g-coral), var(--g-orange));
		filter: blur(42px);
		opacity: 0.55;
		animation:
			spin 14s linear infinite,
			breathe 6s ease-in-out infinite;
	}
	@keyframes spin {
		to {
			rotate: 360deg;
		}
	}
	.hero-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 30px 34px 26px;
		border-radius: 32px;
		background: color-mix(in srgb, var(--surface) 62%, transparent);
		-webkit-backdrop-filter: blur(24px) saturate(160%);
		backdrop-filter: blur(24px) saturate(160%);
		border: 1px solid color-mix(in srgb, var(--surface) 60%, transparent);
		box-shadow: var(--shadow-2);
		text-align: center;
	}
	.hero-card p {
		margin: 0;
		font-size: 13px;
		color: var(--text-2);
	}
	.big {
		font-family: var(--display);
		font-size: 64px;
		font-weight: 400;
		letter-spacing: -0.01em;
		line-height: 1;
		/* 이 앱의 정체성인 숫자에 그라디언트 */
		background: var(--brand);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding: 0 2px;
	}
	h1 {
		margin: 6px 0 0;
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}
</style>
