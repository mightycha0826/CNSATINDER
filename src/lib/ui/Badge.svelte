<script lang="ts">
	/**
	 * 업적 메달 (Phase 31) — 동 · 은 · 금 금속 테두리 + 가운데 아이콘. 잠긴 업적(tier 0)은 흑백.
	 * shine 이면 빛이 한 번 스쳐 지나간다 (새로 딴 업적 · 대표 업적). 동작 줄이기면 app.css 가 애니메이션을 끈다.
	 */
	import { TIER_NAME, type Tier } from '$lib/achievements';

	let {
		icon,
		tier,
		title = '',
		size = 56,
		shine = false,
		label = false
	}: { icon: string; tier: Tier; title?: string; size?: number; shine?: boolean; label?: boolean } = $props();
</script>

<span class="medal t{tier}" class:shine style:--s="{size}px" role="img" aria-label="{title} {TIER_NAME[tier]}">
	<span class="ring" aria-hidden="true">
		<span class="disk"><span class="ico">{icon}</span></span>
	</span>
	{#if label && tier > 0}<span class="tier" aria-hidden="true">{TIER_NAME[tier]}</span>{/if}
</span>

<style>
	.medal {
		--s: 56px;
		position: relative;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		flex: none;
	}
	.ring {
		position: relative;
		display: grid;
		place-items: center;
		width: var(--s);
		height: var(--s);
		border-radius: 50%;
		padding: calc(var(--s) * 0.08);
		background: var(--metal);
		box-shadow:
			0 calc(var(--s) * 0.06) calc(var(--s) * 0.18) rgb(0 0 0 / 0.18),
			inset 0 1px 0 rgb(255 255 255 / 0.6);
		overflow: hidden;
	}
	.disk {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		background: var(--face);
		box-shadow: inset 0 calc(var(--s) * -0.04) calc(var(--s) * 0.1) rgb(0 0 0 / 0.18);
	}
	.ico {
		font-size: calc(var(--s) * 0.42);
		line-height: 1;
		filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.2));
	}
	/* 금속 — 위에서 비치는 빛 방향으로 */
	.t1 {
		--metal: conic-gradient(from 200deg, #8a5329, #e6a877, #a4652f, #f3c89c, #8a5329);
		--face: radial-gradient(circle at 35% 30%, #f7d2ad, #c98a55 60%, #9a5f30);
		--tier: #9a5a2b; /* 등급 글씨 바탕 — 흰 글씨 4.5:1 넘게 (금속색보다 진하게) */
	}
	.t2 {
		--metal: conic-gradient(from 200deg, #7f8994, #eef2f6, #98a3ae, #ffffff, #7f8994);
		--face: radial-gradient(circle at 35% 30%, #ffffff, #cfd6de 60%, #9aa4ae);
		--tier: #66707b;
	}
	.t3 {
		--metal: conic-gradient(from 200deg, #a8740a, #ffe38a, #c8900f, #fff4c2, #a8740a);
		--face: radial-gradient(circle at 35% 30%, #fff3c4, #f2c14e 60%, #c48a0c);
		--tier: #9b6c05;
	}
	.t0 {
		--metal: linear-gradient(var(--field), var(--field));
		--face: var(--surface);
	}
	.t0 .ring {
		box-shadow: none;
	}
	.t0 .ico {
		filter: grayscale(1);
		opacity: 0.35;
	}
	/* 빛이 한 번 스친다 */
	.shine .ring::after {
		content: '';
		position: absolute;
		inset: -20%;
		background: linear-gradient(115deg, transparent 38%, rgb(255 255 255 / 0.75) 50%, transparent 62%);
		transform: translateX(-120%);
		animation: sweep 1.6s 0.3s ease-out forwards;
	}
	@keyframes sweep {
		to {
			transform: translateX(120%);
		}
	}
	.tier {
		margin-top: -8px;
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--tier);
		color: #fff;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.02em;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
		z-index: 1;
	}
</style>
