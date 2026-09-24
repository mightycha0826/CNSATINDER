<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, pushState as pushHistory, replaceState as replaceHistory } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { Inbox, type InboxRoom } from '$lib/inbox.svelte';
	import { S, UI, toast } from '$lib/state.svelte';
	import { Seeker } from '$lib/seeker.svelte';
	import { enablePush, pushState } from '$lib/push';
	import { isRestricted } from '$lib/restriction';
	import { mmss } from '$lib/time';
	import { scrollBehavior } from '$lib/motion';
	import Sheet from '$lib/ui/Sheet.svelte';
	import TopbarMe from '$lib/ui/TopbarMe.svelte';
	import AiChat from '$lib/ai/AiChat.svelte';

	/**
	 * 홈 = 대화 목록 (인스타 DM 받은편지함).
	 * 위에는 새 상대 찾기, 아래에는 지금 열려 있는 대화들. 여러 대화를 동시에 이어갈 수 있다.
	 */

	const closed = $derived(S.settings ? !S.settings.is_open : false);
	// 영구/무기한 정지(status) 또는 기간 정지(suspended_until)
	// ★ 프로필을 아직(또는 못) 불러왔을 때를 정지로 착각하지 않는다 — 예전엔 profile 이 null 이면
	//   status !== 'active' 가 참이 되어 멀쩡한 계정에 "이용이 제한된 계정"이 떴다.
	const suspended = $derived(!!S.profile && isRestricted(S.profile, S.now));
	const profileMissing = $derived(S.booted && !!S.session && !S.profile);
	const suspendedUntil = $derived(
		S.profile?.status === 'active' && S.profile?.suspended_until
			? new Date(S.profile.suspended_until).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
			: null
	);
	const minutes = $derived(S.settings?.room_minutes ?? 10);
	const maxRooms = $derived(S.settings?.max_open_rooms ?? 5);

	const inbox = new Inbox();
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
	const full = $derived(inbox.rooms.length >= maxRooms);

	$effect(() => {
		inbox.start();
		// 대화가 끝나고 "새 대화 찾기"로 왔으면 바로 찾기 시작
		if (untrack(() => UI.seekOnHome)) {
			UI.seekOnHome = false;
			seeker.start();
		} else if (page.url.searchParams.has('seek')) {
			// 옛 주소(/?seek) 호환 — 주소만 정리
			void goto('/', { replaceState: true, keepFocus: true, noScroll: true, state: page.state });
			seeker.start();
		}
		return () => {
			inbox.stop();
			seeker.cancel(); // 화면을 떠나면 찾기 목록에서 빠진다
		};
	});

	const elapsed = $derived(seeker.seeking ? mmss(Math.floor((S.now - seeker.since) / 1000)) : '');

	function remain(r: InboxRoom) {
		const ms = Math.max(0, Date.parse(r.expires_at) - (S.now + inbox.skew));
		return { text: mmss(Math.ceil(ms / 1000)), urgent: ms <= 60_000 };
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
		else if (r === 'denied') toast('알림이 꺼져 있어요. 내 프로필에서 다시 켤 수 있어요');
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
		<button class="nudge" onclick={() => goto('/me#password')}>
			<strong>비밀번호를 만들어 두세요</strong>
			<span>다음부터 인증 코드 없이 바로 로그인할 수 있어요 ›</span>
		</button>
	{/if}

	{#if S.settings?.notice}
		<div class="notice selectable">{S.settings.notice}</div>
	{/if}

	<!-- 대화 목록 -->
	{#if inbox.rooms.length}
		<div class="head">
			<h2>대화</h2>
			<span class="muted num">{inbox.rooms.length}/{maxRooms}</span>
		</div>
		<ul class="rooms">
			{#each inbox.rooms as r (r.room_id)}
				{@const t = remain(r)}
				<li>
					<!-- 아직 안 열어 본 새 대화(상대가 나를 잡아감)면 연결 화면부터 -->
					<button class="room" onclick={() => goto(`/chat/${r.room_id}`, { state: { matched: !r.joined } })}>
						<Avatar name={r.partner_alias} size={52} online={r.partner_online} />
						<span class="mid">
							<span class="name" class:bold={r.unread > 0 || !r.joined}>{r.partner_alias}</span>
							<span class="last" class:bold={r.unread > 0 || !r.joined}>{preview(r)}</span>
						</span>
						<span class="right">
							{#if r.status === 'active'}
								<span class="time num" class:urgent={t.urgent}>{t.text}</span>
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
	{:else if inbox.loaded && !seeker.seeking}
		<div class="hero">
			<div class="big num">{minutes}:00</div>
			<h1>모르는 사람과 {minutes}분</h1>
			<p class="muted">
				이름도, 학번도 묻지 않아요.<br />
				{minutes}분이 지나면 둘 다 원할 때만 이어집니다.<br />
				대화는 동시에 {maxRooms}개까지 할 수 있어요.
			</p>
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
			<h2 id="push-title">새 메시지가 오면 알려 드릴까요?</h2>
			<p class="muted">
				앱을 닫아 두어도 상대가 보낸 메시지를 놓치지 않아요.<br />
				알림에는 상대의 익명 이름과 메시지만 보여요.
			</p>
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
	.ask p {
		margin: 0 0 8px;
		font-size: 13px;
		line-height: 1.6;
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
	.later {
		height: 40px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}

	.cta {
		position: sticky;
		bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
		margin-top: auto;
		padding: 12px 0;
		background: var(--bg);
		z-index: 5;
	}

	.home {
		gap: 14px;
		padding-top: 12px;
		padding-bottom: 0; /* 아래 안전영역은 탭바가 맡는다 · 버튼 여백은 .cta 가 */
	}

	.nudge {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		border-radius: var(--r-sm);
		background: var(--surface);
		border: 1px solid var(--line);
		text-align: left;
		font-size: 13px;
	}
	.nudge span {
		color: var(--text-2);
		font-size: 12px;
	}

	.notice {
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		background: var(--surface);
		font-size: 13px;
	}

	/* 찾는 중 — 버튼 자리에 그대로 들어간다 */
	.seek {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 10px 12px;
		border-radius: var(--r-sm);
		border: 1px solid var(--line);
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
	.stop {
		flex: none;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}
	.ai-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		margin-top: 8px;
		border-radius: var(--r-sm);
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
		font-size: 16px;
		font-weight: 700;
	}
	.head span {
		font-size: 13px;
	}
	.rooms {
		list-style: none;
		margin: 0 calc(-1 * var(--pad));
		padding: 0;
	}
	.room {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 8px var(--pad);
		text-align: left;
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
		font-size: 14px;
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
	.time.urgent {
		color: var(--danger);
	}
	.badge {
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 10px;
		background: var(--accent-fill);
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
		background: var(--accent-fill);
	}

	/* 빈 상태 */
	.hero {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		text-align: center;
		padding-bottom: 40px;
	}
	.big {
		font-size: 52px;
		font-weight: 800;
		letter-spacing: -0.05em;
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
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.hero p {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
	}
</style>
