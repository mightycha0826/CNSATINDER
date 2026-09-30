<script lang="ts">
	/**
	 * 업적 메달 (Phase 31 · 35 다시 그림) — 동 · 은 · 금 금속 테두리(톱니 결) + 가운데 면에 새긴 선 그림(badgeIcons, 이모지 대신).
	 * 잠긴 업적(tier 0)은 흑백. shine 이면 빛이 한 번 부드럽게 스친다. enter 면 동전이 돌며 튀어나온다 (축하 화면).
	 * 동작 줄이기면 app.css 가 애니메이션을 끈다.
	 * CNSA 뱃지 (Phase 70, pins/) — 동그란 메달 대신 실제 에나멜 핀 모양 그대로. 잠겼으면 흑백 · 흐리게.
	 */
	import { TIER_NAME, type Tier } from '$lib/achievements';
	import { BADGE_ICONS, FALLBACK_ICON, SPECIAL_BADGES } from './badgeIcons';
	import { PIN_BADGES } from './pins';

	let {
		code = '',
		icon = '',
		tier,
		title = '',
		size = 56,
		shine = false,
		label = false,
		enter = false,
		delay = 0
	}: {
		code?: string;
		/** 예전 이모지 — 그림이 없는 코드일 때만 */
		icon?: string;
		tier: Tier;
		title?: string;
		size?: number;
		shine?: boolean;
		label?: boolean;
		/** 축하 화면 — 돌며 튀어나온다 */
		enter?: boolean;
		/** enter · shine 시작을 늦춘다 (ms) */
		delay?: number;
	} = $props();

	const path = $derived(BADGE_ICONS[code] ?? (icon ? null : FALLBACK_ICON));
	// 운영진이 주는 특별 업적 (Phase 44) — 동 · 은 · 금이 아니라 "특별" (가진 사람만 무지갯빛)
	const special = $derived(SPECIAL_BADGES.has(code));
	const Pin = $derived(PIN_BADGES[code] as (typeof PIN_BADGES)[string] | undefined);
	const tierName = $derived(Pin && tier > 0 ? 'CNSA' : special && tier > 0 ? '특별' : TIER_NAME[tier]);
</script>

<span class="medal t{tier}" class:sp={special && tier > 0} class:pin={!!Pin} class:shine class:enter style:--s="{size}px" style:--d="{delay}ms" role="img" aria-label="{title} {tierName}">
	{#if Pin}
		<span class="coin art" aria-hidden="true"><Pin shine={shine && tier > 0} {delay} /></span>
	{:else}
		<span class="coin" aria-hidden="true">
			<span class="rim">
				<span class="disk">
					{#if path}
						<svg viewBox="0 0 24 24" class="ico">
							<!-- 새긴 자국: 아래쪽 밝은 테 + 위쪽 어두운 홈 -->
							<path d={path} class="lit" />
							<path d={path} class="ink" />
						</svg>
					{:else}
						<span class="emo">{icon}</span>
					{/if}
				</span>
			</span>
		</span>
	{/if}
	{#if label && tier > 0}<span class="tier" aria-hidden="true">{tierName}</span>{/if}
</span>

<style>
	.medal {
		--s: 56px;
		position: relative;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		flex: none;
		perspective: calc(var(--s) * 6);
	}
	.coin {
		position: relative;
		display: block;
		width: var(--s);
		height: var(--s);
		border-radius: 50%;
		transform-style: preserve-3d;
		filter: drop-shadow(0 calc(var(--s) * 0.06) calc(var(--s) * 0.09) rgb(0 0 0 / 0.22));
	}
	/* 테두리 — 금속 + 가는 톱니 결 */
	.rim {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		border-radius: 50%;
		padding: calc(var(--s) * 0.085);
		background:
			repeating-conic-gradient(from 0deg, rgb(255 255 255 / 0.16) 0 3deg, rgb(0 0 0 / 0.08) 3deg 6deg),
			var(--metal);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.7),
			inset 0 -1px 1px rgb(0 0 0 / 0.25);
		overflow: hidden;
	}
	.disk {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		background: var(--face);
		box-shadow:
			inset 0 calc(var(--s) * 0.035) calc(var(--s) * 0.05) rgb(0 0 0 / 0.22),
			inset 0 calc(var(--s) * -0.02) calc(var(--s) * 0.04) rgb(255 255 255 / 0.5),
			0 0 0 1px rgb(0 0 0 / 0.06);
	}
	.ico {
		width: 58%;
		height: 58%;
		overflow: visible;
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ico .ink {
		stroke: var(--ink);
		stroke-width: 1.9;
	}
	.ico .lit {
		stroke: rgb(255 255 255 / 0.55);
		stroke-width: 1.9;
		transform: translate(0.35px, 0.6px);
	}
	.emo {
		font-size: calc(var(--s) * 0.42);
		line-height: 1;
	}
	/* 금속 — 위에서 비치는 빛 방향으로 */
	.t1 {
		--metal: conic-gradient(from 200deg, #8a5329, #e6a877, #a4652f, #f3c89c, #8a5329);
		--face: radial-gradient(circle at 35% 28%, #f9dcbd, #d69863 55%, #9a5f30);
		--ink: #6b3a14;
		--tier: #9a5a2b; /* 등급 글씨 바탕 — 흰 글씨 4.5:1 넘게 (금속색보다 진하게) */
	}
	.t2 {
		--metal: conic-gradient(from 200deg, #7f8994, #eef2f6, #98a3ae, #ffffff, #7f8994);
		--face: radial-gradient(circle at 35% 28%, #ffffff, #d7dde4 55%, #9aa4ae);
		--ink: #4a5561;
		--tier: #66707b;
	}
	.t3 {
		--metal: conic-gradient(from 200deg, #a8740a, #ffe38a, #c8900f, #fff4c2, #a8740a);
		--face: radial-gradient(circle at 35% 28%, #fff6d0, #f5c95a 55%, #c48a0c);
		--ink: #7a5200;
		--tier: #9b6c05;
	}
	/* 특별 업적 — 무지갯빛 테두리 · 진주빛 면 (운영진이 주는 것, Phase 44). 등급과 상관없이 이 모양 */
	.medal.sp {
		--metal: conic-gradient(from 200deg, #7b5cff, #3ec7ff, #7af0c4, #ffd36e, #ff7ab8, #7b5cff);
		--face: radial-gradient(circle at 35% 28%, #ffffff, #eef0ff 50%, #c9c6f5);
		--ink: #4b3aa8;
		--tier: linear-gradient(90deg, #6a4df0, #d04fa8);
	}
	.t0 {
		--metal: linear-gradient(var(--field), var(--field));
		--face: var(--surface);
		--ink: var(--text-2);
	}
	.t0 .coin {
		filter: none;
	}
	.t0 .rim {
		background: var(--field);
		box-shadow: none;
	}
	.t0 .ico {
		opacity: 0.4;
	}
	.t0 .ico .lit {
		display: none;
	}
	.t0 .emo {
		filter: grayscale(1);
		opacity: 0.35;
	}

	/* CNSA 뱃지 — 핀 그림이 칸을 채운다. 잠긴 것은 흑백 · 흐리게 */
	.pin .art {
		border-radius: 0;
		filter: drop-shadow(0 calc(var(--s) * 0.05) calc(var(--s) * 0.06) rgb(0 0 0 / 0.3));
	}
	.pin {
		--tier: #b3121a;
	}
	.pin.t0 .art {
		filter: grayscale(1);
		opacity: 0.35;
	}
	/* 빛이 한 번 부드럽게 스친다 (비스듬한 넓은 빛 띠) */
	.shine .rim::after {
		content: '';
		position: absolute;
		inset: -30%;
		background: linear-gradient(115deg, transparent 35%, rgb(255 255 255 / 0.18) 44%, rgb(255 255 255 / 0.8) 50%, rgb(255 255 255 / 0.18) 56%, transparent 65%);
		transform: translateX(-130%);
		animation: sweep 1.9s calc(var(--d) + 0.45s) cubic-bezier(0.45, 0, 0.25, 1) forwards;
		pointer-events: none;
	}
	@keyframes sweep {
		to {
			transform: translateX(130%);
		}
	}

	/* 축하 — 동전이 돌면서 튀어나와 살짝 흔들리다 멈춘다 (용수철처럼) */
	.enter .coin {
		animation:
			coin-spin 1.25s var(--d) cubic-bezier(0.16, 0.84, 0.3, 1) both,
			coin-pop 0.9s var(--d) both;
		animation-timing-function: cubic-bezier(0.16, 0.84, 0.3, 1), cubic-bezier(0.34, 1.56, 0.64, 1);
		animation-timing-function: cubic-bezier(0.16, 0.84, 0.3, 1),
			linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1.004 83.8%, 1);
	}
	@keyframes coin-spin {
		from {
			transform: rotateY(-720deg);
		}
	}
	@keyframes coin-pop {
		from {
			scale: 0.2;
			opacity: 0;
		}
		12% {
			opacity: 1;
		}
	}
	.enter .tier {
		animation: tier-in 0.5s calc(var(--d) + 0.7s) cubic-bezier(0.3, 1.4, 0.5, 1) both;
	}
	@keyframes tier-in {
		from {
			transform: translateY(-6px) scale(0.6);
			opacity: 0;
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
