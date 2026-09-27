<script lang="ts">
	/**
	 * 새 업적 축하 (Phase 31) — 탭 첫 화면(홈 · 편지 · 프로필)에서만 띄운다 (대화 중에는 방해하지 않는다).
	 * 앱을 열 때와, 화면이 보이는 동안 2분마다 새로 딴 업적이 있는지 묻는다. 닫으면 "봤음"으로 서버에 남긴다.
	 * 색종이는 CSS 로만 — 동작 줄이기면 app.css 가 애니메이션을 끄고 그대로 멈춰 보인다.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Badge from './Badge.svelte';
	import Sheet from './Sheet.svelte';
	import { fetchNewAchievements, markAchievementsSeen, TIER_NAME, type BadgeLite } from '$lib/achievements';
	import { whileVisible } from '$lib/visible';

	let { preview = null }: { preview?: BadgeLite[] | null } = $props();

	let fresh = $state<BadgeLite[]>([]);
	const onRoot = $derived(['/', '/letters', '/me'].includes(page.url.pathname));

	$effect(() => {
		if (preview) {
			fresh = preview;
			return;
		}
		const check = async () => {
			if (!fresh.length) fresh = await fetchNewAchievements();
		};
		void check();
		return whileVisible(() => void check(), 120_000);
	});

	async function close(view = false) {
		fresh = [];
		if (!preview) await markAchievementsSeen().catch(() => {});
		if (view) void goto('/me/achievements');
	}
	const top = $derived(fresh.slice(0, 6));
</script>

{#if fresh.length && (onRoot || preview)}
	<Sheet onclose={() => close()} label="새 업적">
		<div class="party">
			<div class="confetti" aria-hidden="true">
				{#each Array(18) as _, i (i)}<i></i>{/each}
			</div>
			<p class="kicker">새 업적</p>
			<h2>{fresh.length === 1 ? `${fresh[0].title} ${TIER_NAME[fresh[0].tier]} 등급!` : `업적 ${fresh.length}개를 모았어요!`}</h2>
			<div class="medals">
				{#each top as b (b.code)}
					<div class="m">
						<Badge icon={b.icon} tier={b.tier} title={b.title} size={fresh.length === 1 ? 104 : 64} label shine />
						{#if fresh.length > 1}<span>{b.title}</span>{/if}
					</div>
				{/each}
			</div>
			{#if fresh.length > top.length}<p class="more muted">외 {fresh.length - top.length}개</p>{/if}
			<button class="btn" onclick={() => close(true)}>업적 보러 가기</button>
			<button class="later" onclick={() => close()}>닫기</button>
		</div>
	</Sheet>
{/if}

<style>
	.party {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 22px var(--pad) 6px;
		text-align: center;
		overflow: hidden;
	}
	.kicker {
		margin: 0;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.08em;
		background: var(--brand);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	h2 {
		margin: 0 0 6px;
		font-size: 20px;
		letter-spacing: -0.02em;
	}
	.medals {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 14px 10px;
		margin: 6px 0 4px;
	}
	.m {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		width: 84px;
		font-size: 12px;
		font-weight: 600;
		animation: pop 0.45s cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}
	.m:nth-child(2) {
		animation-delay: 0.08s;
	}
	.m:nth-child(3) {
		animation-delay: 0.16s;
	}
	.m:nth-child(n + 4) {
		animation-delay: 0.24s;
	}
	@keyframes pop {
		from {
			transform: scale(0.4);
			opacity: 0;
		}
	}
	.more {
		margin: 0;
		font-size: 12px;
	}
	.btn {
		width: 100%;
		margin-top: 6px;
	}
	.later {
		height: 40px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}
	/* 색종이 18장 — 위에서 흩날리며 떨어진다 */
	.confetti {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.confetti i {
		position: absolute;
		top: -12px;
		width: 7px;
		height: 12px;
		border-radius: 2px;
		opacity: 0;
		animation: fall 1.8s ease-in forwards;
	}
	@keyframes fall {
		0% {
			opacity: 1;
			transform: translateY(0) rotate(0);
		}
		100% {
			opacity: 0;
			transform: translateY(260px) rotate(540deg);
		}
	}
	.confetti i:nth-child(6n + 1) {
		background: #ff7a50;
	}
	.confetti i:nth-child(6n + 2) {
		background: #f0396e;
	}
	.confetti i:nth-child(6n + 3) {
		background: #f2c14e;
	}
	.confetti i:nth-child(6n + 4) {
		background: #7059f5;
	}
	.confetti i:nth-child(6n + 5) {
		background: #14a37f;
	}
	.confetti i:nth-child(6n) {
		background: #3b8af6;
	}
	.confetti i:nth-child(1) { left: 4%; animation-delay: 0s; }
	.confetti i:nth-child(2) { left: 10%; animation-delay: 0.2s; }
	.confetti i:nth-child(3) { left: 16%; animation-delay: 0.1s; }
	.confetti i:nth-child(4) { left: 22%; animation-delay: 0.35s; }
	.confetti i:nth-child(5) { left: 28%; animation-delay: 0.05s; }
	.confetti i:nth-child(6) { left: 34%; animation-delay: 0.25s; }
	.confetti i:nth-child(7) { left: 40%; animation-delay: 0.15s; }
	.confetti i:nth-child(8) { left: 46%; animation-delay: 0.4s; }
	.confetti i:nth-child(9) { left: 52%; animation-delay: 0.08s; }
	.confetti i:nth-child(10) { left: 58%; animation-delay: 0.3s; }
	.confetti i:nth-child(11) { left: 64%; animation-delay: 0.12s; }
	.confetti i:nth-child(12) { left: 70%; animation-delay: 0.45s; }
	.confetti i:nth-child(13) { left: 76%; animation-delay: 0.02s; }
	.confetti i:nth-child(14) { left: 82%; animation-delay: 0.22s; }
	.confetti i:nth-child(15) { left: 88%; animation-delay: 0.18s; }
	.confetti i:nth-child(16) { left: 93%; animation-delay: 0.38s; }
	.confetti i:nth-child(17) { left: 97%; animation-delay: 0.1s; }
	.confetti i:nth-child(18) { left: 50%; animation-delay: 0.5s; }
</style>
