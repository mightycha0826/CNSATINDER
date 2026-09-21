<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { supabase } from '$lib/supabase';
	import { S, toast } from '$lib/state.svelte';
	import { Seeker } from '$lib/seeker.svelte';

	const closed = $derived(S.settings ? !S.settings.is_open : false);
	// 영구/무기한 정지(status) 또는 기간 정지(suspended_until)
	const suspended = $derived(
		S.profile?.status !== 'active' ||
			(!!S.profile?.suspended_until && Date.parse(S.profile.suspended_until) > S.now)
	);
	const suspendedUntil = $derived(
		S.profile?.status === 'active' && S.profile?.suspended_until
			? new Date(S.profile.suspended_until).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
			: null
	);
	const minutes = $derived(S.settings?.room_minutes ?? 10);

	const seeker = new Seeker(
		() => void goto('/chat'),
		(msg) => toast(msg)
	);

	// 이미 들어가 있는 방이 있으면 "이어가기"
	let activeAlias = $state<string | null>(null);
	$effect(() => {
		void supabase.rpc('my_room').then(({ data }) => {
			const r = data?.room;
			activeAlias = r && r.status !== 'closed' ? r.partner_alias : null;
			// 대화가 끝나고 "새 대화 찾기"로 왔으면 바로 찾기 시작
			if (!activeAlias && page.url.searchParams.has('seek')) {
				void goto('/', { replaceState: true, keepFocus: true, noScroll: true });
				seeker.start();
			}
		});
		return () => seeker.cancel(); // 화면을 떠나면 풀에서 빠진다
	});

	const elapsed = $derived.by(() => {
		if (!seeker.seeking) return '';
		const s = Math.max(0, Math.floor((S.now - seeker.since) / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	});
</script>

<div class="topbar">
	<span class="title wordmark">CNSATINDER</span>
	<button class="gear" onclick={() => goto('/me')} aria-label="설정" disabled={seeker.seeking}>
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" />
			<path
				d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.35.4.65.73.85"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
			/>
		</svg>
	</button>
</div>

<div class="page home">
	{#if S.settings?.notice}
		<div class="notice">{S.settings.notice}</div>
	{/if}

	{#if seeker.seeking}
		<div class="hero">
			<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>
			<h1>상대를 찾는 중</h1>
			<p class="muted">
				{#if seeker.reason === 'cooldown'}
					너무 빨리 넘기고 있어요.<br />잠깐 쉬었다가 다시 찾을게요.
				{:else if seeker.reason === 'filtered'}
					지금 찾는 사람들과는 조건이 맞지 않아요.<br />맞는 사람이 올 때까지 계속 찾을게요.
				{:else if seeker.reason === 'empty'}
					지금은 대화를 찾는 사람이 없어요.<br />이 화면을 켜두면 계속 찾을게요.
				{:else}
					잠시만요…
				{/if}
			</p>
			<span class="elapsed num muted">{elapsed}</span>
		</div>
		<p class="tip muted">화면을 끄거나 다른 앱으로 가면 찾기가 멈춰요.</p>
		<div class="foot">
			<button class="btn-ghost" onclick={() => seeker.cancel()}>그만 찾기</button>
		</div>
	{:else}
		<div class="hero">
			<div class="big num">{minutes}:00</div>
			<h1>모르는 사람과 {minutes}분</h1>
			<p class="muted">
				이름도, 학번도 묻지 않아요.<br />
				{minutes}분이 지나면 둘 다 원할 때만 이어집니다.
			</p>
		</div>

		<div class="foot">
			{#if activeAlias}
				<button class="btn" onclick={() => goto('/chat')}>{activeAlias}님과 대화 이어가기</button>
			{:else if closed}
				<button class="btn" disabled>지금은 열려 있지 않아요</button>
			{:else if suspended}
				<button class="btn" disabled>
					{suspendedUntil ? `${suspendedUntil}까지 이용이 제한됐어요` : '이용이 제한된 계정이에요'}
				</button>
			{:else}
				<button class="btn" onclick={() => seeker.start()}>새 대화 시작</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.gear {
		margin-left: auto;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
	}
	.gear:disabled {
		opacity: 0.3;
	}
	.gear svg {
		width: 22px;
		height: 22px;
	}

	.home {
		padding-top: 12px;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	.notice {
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		background: var(--surface);
		font-size: 13px;
	}
	.hero {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		text-align: center;
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
	.elapsed {
		font-size: 13px;
		margin-top: 4px;
	}

	/* 찾는 중 — 인스타 타이핑 점과 같은 언어 */
	.dots {
		display: flex;
		gap: 8px;
		margin-bottom: 8px;
	}
	.dots i {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--g-violet);
		animation: pulse 1.2s infinite;
	}
	/* 아이콘 그라디언트를 점 셋에 나눠 싣는다 */
	.dots i:nth-child(2) {
		background: var(--g-magenta);
		animation-delay: 0.2s;
	}
	.dots i:nth-child(3) {
		background: var(--g-orange);
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

	.tip {
		margin: 0 0 12px;
		text-align: center;
		font-size: 12px;
	}
	.foot {
		margin-top: auto;
	}
</style>
