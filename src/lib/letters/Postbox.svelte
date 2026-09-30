<script lang="ts">
	/**
	 * 우체통 (Phase 71 · 72 · 73 · 74 · 75) — 벽에 걸린 우편함을 정면에서 본 2D 네모. 앱의 얼굴 그대로 (docs · app.css 토큰):
	 * 앱 아이콘과 같은 브랜드 그라디언트(주황 → 코랄 → 핑크, 대각선) · 큰 둥근 모서리 · 흰 봉투 문양(로고처럼 흰 모양) ·
	 * 반투명 흰 테 안의 투입구 · 브랜드색 빛 그림자(--glow 처럼). 알림 숫자 · "+✉" 는 앱의 흰 알약.
	 *   count — 안 읽은 편지 수: 오른쪽 위 숫자 + 투입구에 봉투 끝이 삐죽 나온다(3장까지).
	 *   drop — 바뀔 때마다 봉투 한 통이 위에서 떨어져 투입구로 쏙 → 통이 출렁 → 위에 "+✉" (편지가 왔다). dropN 은 몇 통인지.
	 *   added — 바뀔 때마다 출렁 + 위에 "+✉" 만 (편지를 보내고 편지함으로 돌아왔을 때). bump — 출렁만.
	 *   slot — 투입구 자리 (보낼 때 봉투를 맞춰 넣으려고 부르는 쪽이 잰다).
	 * 폭은 부르는 쪽이 정한다 (높이는 그림 비율대로). 동작 줄이기면 움직이지 않는다 (CSS 는 app.css 가 끄고, 여기서 쓰는 WAAPI 는 직접 거른다).
	 */
	import { reducedMotion } from '../motion';

	let {
		count = 0,
		drop = 0,
		dropN = 1,
		added = 0,
		bump = 0,
		slot = $bindable()
	}: {
		count?: number;
		drop?: number;
		dropN?: number;
		added?: number;
		bump?: number;
		slot?: Element;
	} = $props();
	const uid = $props.id();

	let box = $state<HTMLElement>();
	let falling = $state<SVGGElement>();
	let plus = $state<HTMLElement>();
	let plusN = $state(1);

	// 출렁 — 벽에 걸린 통이 살짝 흔들린다 (위 걸이를 축으로)
	const wobble = () =>
		box?.animate(
			[
				{ transform: 'rotate(0deg) translateY(0)' },
				{ transform: 'rotate(-1.2deg) translateY(2px)', offset: 0.25 },
				{ transform: 'rotate(0.8deg) translateY(0)', offset: 0.55 },
				{ transform: 'rotate(-0.3deg)', offset: 0.8 },
				{ transform: 'rotate(0deg)' }
			],
			{ duration: 620, easing: 'ease-out' }
		);
	// "+✉" — 위 가장자리에서 톡 튀어나와 잠깐 머물다 떠오르며 사라진다
	const pop = (n: number) => {
		plusN = n;
		plus?.animate(
			[
				{ opacity: 0, transform: 'translate(-50%, -10%) scale(0.5) rotate(-4deg)' },
				{ opacity: 1, transform: 'translate(-50%, -80%) scale(1.08) rotate(2deg)', offset: 0.18 },
				{ opacity: 1, transform: 'translate(-50%, -74%) scale(1) rotate(0)', offset: 0.3 },
				{ opacity: 1, transform: 'translate(-50%, -82%) scale(1)', offset: 0.75 },
				{ opacity: 0, transform: 'translate(-50%, -160%) scale(0.96)' }
			],
			{ duration: 1700, easing: 'ease-out' }
		);
	};

	// 처음 값은 장면 없이 — 바뀔 때만
	// svelte-ignore state_referenced_locally
	const last = { bump, added, drop };
	$effect(() => {
		if (bump === last.bump) return;
		last.bump = bump;
		if (!reducedMotion()) wobble();
	});
	$effect(() => {
		if (added === last.added) return;
		last.added = added;
		if (reducedMotion()) return;
		wobble();
		pop(1);
	});
	// 편지가 떨어져 투입구로 — 위에서 비스듬히 내려와 투입구 선에서 아래부터 사라진다(들어간다)
	$effect(() => {
		if (drop === last.drop) return;
		last.drop = drop;
		if (reducedMotion() || !falling) return;
		const n = dropN;
		falling
			.animate(
				[
					{ transform: 'translateY(-150px) rotate(-14deg)', opacity: 0 },
					{ transform: 'translateY(-16px) rotate(3deg)', opacity: 1, offset: 0.55 },
					{ transform: 'translateY(0) rotate(0) scaleY(1)', opacity: 1, offset: 0.72 },
					{ transform: 'translateY(0) rotate(0) scaleY(0)', opacity: 1 }
				],
				{ duration: 800, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' }
			)
			.finished.then(
				() => {
					wobble();
					pop(n);
				},
				() => {}
			);
	});

	const peek = $derived(Math.min(3, count));
</script>

<span class="postbox" bind:this={box}>
	<svg viewBox="0 0 300 210" aria-hidden="true">
		<defs>
			<!-- 앱 아이콘과 같은 브랜드 그라디언트 (왼쪽 위 주황 → 오른쪽 아래 핑크) -->
			<linearGradient id="{uid}-brand" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#ff7a50" />
				<stop offset="0.5" stop-color="#fb5c68" />
				<stop offset="1" stop-color="#f0396e" />
			</linearGradient>
			<linearGradient id="{uid}-sheen" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#fff" stop-opacity="0.28" />
				<stop offset="0.45" stop-color="#fff" stop-opacity="0" />
			</linearGradient>
			<clipPath id="{uid}-above-slot"><rect x="0" y="-240" width="300" height="381" /></clipPath>
		</defs>

		<!-- 몸통 — 둥근 네모, 위쪽에 은은한 빛 · 가는 흰 테 -->
		<rect x="14" y="10" width="272" height="190" rx="34" fill="url(#{uid}-brand)" />
		<rect x="14" y="10" width="272" height="190" rx="34" fill="url(#{uid}-sheen)" />
		<rect x="15.5" y="11.5" width="269" height="187" rx="32.5" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="1.5" />

		<!-- 흰 봉투 문양 -->
		<g fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
			<rect x="120" y="46" width="60" height="42" rx="7" />
			<path d="M123 50l27 20 27-20" />
		</g>

		<!-- 투입구 — 반투명 흰 테 · 짙은 구멍 -->
		<rect x="58" y="126" width="184" height="30" rx="15" fill="#fff" fill-opacity="0.28" />
		<rect class="slot" x="70" y="135" width="160" height="12" rx="6" fill="#7a1330" fill-opacity="0.78" bind:this={slot} />
		<rect x="70" y="135" width="160" height="4" rx="2" fill="#4a0a1e" fill-opacity="0.45" />

		<!-- 안 읽은 편지 — 투입구에 봉투 끝이 삐죽 -->
		{#if peek}
			<g clip-path="url(#{uid}-above-slot)">
				{#each [[-28, -7], [2, 4], [30, -3]].slice(0, peek) as [dx, r] (dx)}
					<g transform="translate({150 + dx} 145) rotate({r})">
						<rect x="-18" y="-27" width="36" height="30" rx="2.5" fill="#fffaf0" stroke="#ecdcc2" stroke-width="1" />
						<path d="M-17 -26L0 -14L17 -26" fill="none" stroke="#e3cfae" stroke-width="1.1" />
					</g>
				{/each}
			</g>
		{/if}

		<!-- 편지가 떨어져 들어간다 (drop) — 평소엔 안 보인다 -->
		<g class="falling" bind:this={falling}>
			<rect x="130" y="113" width="40" height="28" rx="2.5" fill="#fffaf0" stroke="#ecdcc2" stroke-width="1" />
			<path d="M131 114L150 127L169 114" fill="none" stroke="#e3cfae" stroke-width="1.1" />
			<circle cx="150" cy="127" r="3.4" fill="#e0405f" />
		</g>
	</svg>
	<!-- "+✉" — 편지가 들어왔다 (종이 꼬리표처럼) -->
	<span class="plus" bind:this={plus} aria-hidden="true">
		<b>+{plusN > 1 ? plusN : ''}</b>
		<svg viewBox="0 0 24 18"><rect x="1.5" y="1.5" width="21" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2.2" /><path d="M2.5 3l9.5 7 9.5-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" /></svg>
	</span>
	{#if count > 0}<span class="count num" aria-hidden="true">{count > 99 ? '99+' : count}</span>{/if}
</span>

<style>
	.postbox {
		position: relative;
		display: block;
		width: 100%;
		transform-origin: 50% 0;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
		/* 브랜드색 빛 그림자 — 버튼의 --glow 와 같은 결 */
		filter: drop-shadow(0 14px 18px rgb(240 57 110 / 0.28)) drop-shadow(0 3px 5px rgb(150 30 60 / 0.18));
	}
	.falling {
		opacity: 0;
		transform-box: fill-box;
		transform-origin: 50% 100%;
	}
	.plus {
		position: absolute;
		left: 50%;
		top: 2%;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 6px 13px 6px 12px;
		border-radius: 999px;
		background: var(--surface);
		color: var(--accent);
		box-shadow: var(--shadow-2);
		opacity: 0;
		transform: translate(-50%, -74%);
		pointer-events: none;
	}
	.plus b {
		font-size: 17px;
		font-weight: 900;
		line-height: 1;
	}
	.plus svg {
		width: 22px;
		height: 17px;
		filter: none;
	}
	.count {
		position: absolute;
		top: -2px;
		right: -6px;
		min-width: 28px;
		height: 28px;
		padding: 0 8px;
		border-radius: 14px;
		/* 앱의 숫자 배지 그대로 — 짙은 브랜드 면 · 흰 숫자, 바탕색 고리로 우체통과 떼어 놓는다 */
		background: var(--accent-fill-deep);
		color: var(--on-accent);
		font-size: 14px;
		font-weight: 900;
		line-height: 28px;
		text-align: center;
		box-shadow:
			0 0 0 3px var(--bg),
			var(--shadow-1);
	}
</style>
