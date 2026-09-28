<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { navigateFromOverlay } from '$lib/overlay.svelte';
	import { page } from '$app/state';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { INBOX, type InboxRoom } from '$lib/inbox.svelte';
	import { S, UI, toast } from '$lib/state.svelte';
	import { Seeker } from '$lib/seeker.svelte';
	import { isRestricted } from '$lib/restriction';
	import { mmss } from '$lib/time';
	import { scrollBehavior } from '$lib/motion';
	import TopbarMe from '$lib/ui/TopbarMe.svelte';
	import PushAsk from '$lib/ui/PushAsk.svelte';
	import AiChat from '$lib/ai/AiChat.svelte';
	import PinnedStories from '$lib/chat/PinnedStories.svelte';
	import RoomList from '$lib/chat/RoomList.svelte';
	import RoomMenu from '$lib/chat/RoomMenu.svelte';
	import RateQueue from '$lib/chat/RateQueue.svelte';

	/**
	 * 홈 = 대화 목록 (인스타 DM 받은편지함).
	 * 위에는 고정한 대화(PinnedStories), 그 아래 지금 열려 있는 대화들(RoomList) — 여러 대화를 동시에 이어갈 수 있다.
	 * 목록이 비었으면 찾는 중 레이더 · 소개 카드, 맨 아래(엄지 자리)에 새 상대 찾기.
	 * 대화 줄을 길게 누르면(마우스는 오른쪽 클릭) 신고 · 차단 · 나가기 (RoomMenu).
	 * 떠 있는 창: AI 대화(찾는 동안) · 매너 평가(RateQueue) · 처음 한 번 알림 안내(PushAsk).
	 */
	let askPush = $state(false);

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

	const seeker = new Seeker(
		// AI 대화 · 시트가 열려 있었으면 그 기록 자리를 대화방으로 바꿔 끼운다 (대화방에서 뒤로 → 홈, lib/overlay.svelte.ts)
		(roomId) => void navigateFromOverlay(`/chat/${roomId}`, { state: { matched: true } }),
		(msg) => toast(msg)
	);

	// ── AI 대화 상대 — 찾는 동안만. 홈 위에 덮어 띄운다(홈이 살아 있어야 찾기가 계속된다) ──
	// 얕은 기록 하나를 쌓아서 열고, 뒤로가기(또는 닫기)로 걷어서 닫는다
	// 뒤로가기로 닫기는 AiChat 이 스스로 (backClose)
	let aiOpen = $state(false);
	function openAi() {
		aiOpen = true;
	}
	function closeAi() {
		aiOpen = false;
	}
	// 찾기가 끝나면(매칭 · 상한 · 서비스 닫힘) AI 창도 접는다 — 다음에 찾기를 시작할 때 저절로 튀어나오지 않게
	$effect(() => {
		if (!seeker.seeking) untrack(() => (aiOpen = false));
	});
	/** 찾기를 새로 시작 */
	function startSeek() {
		aiOpen = false;
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

	<PinnedStories rooms={pinnedRooms} onmenu={(r) => (menuFor = r)} />

	<!-- 대화 목록 -->
	{#if liveRooms.length}
		<RoomList rooms={liveRooms} count={openCount} max={maxRooms} onmenu={(r) => (menuFor = r)} />
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
				<p>서로 이어져요</p>
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
		pinned={!!menuFor.pinned}
		onclose={() => (menuFor = null)}
		ondone={() => {
			menuFor = null;
			void inbox.load();
		}}
	/>
{/if}

<!-- 방금 대화한 사람 평가 — 알림 안내 · AI 대화 · 업적 축하가 떠 있지 않을 때 (RateQueue) -->
<RateQueue paused={askPush || aiOpen || UI.celebrating} />

<!-- 처음 한 번 — 알림 권한 안내 (PushAsk) -->
<PushAsk bind:open={askPush} />

<style>
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

	/* 누름 반응 (UX G2) */
	.nudge:active,
	.ai-btn:active {
		transform: scale(0.96);
	}
	.nudge,
	.ai-btn {
		transition: transform 0.15s;
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
