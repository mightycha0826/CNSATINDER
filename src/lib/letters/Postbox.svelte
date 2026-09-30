<script lang="ts">
	/**
	 * 빨간 우체통 (Phase 71 · 72 · 73 · 74) — 벽에 걸린 우편함을 정면에서 본 2D 네모. 아래 책상 · 봉투와 한 장면이 되게
	 * 군더더기 없이 둥근 빨간 네모 하나: 위에 크림색 봉투 배지(책상 위 봉투와 같은 종이색) · 아래 놋쇠 투입구(책상 위 놋쇠 도장과 같은 재료) ·
	 * 짙은 테두리 · 위쪽 은은한 빛 · 아래 어두운 두께. 벽에 그림자가 진다.
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
			<linearGradient id="{uid}-paint" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#e5503d" />
				<stop offset="0.55" stop-color="#d13f2e" />
				<stop offset="1" stop-color="#bb3324" />
			</linearGradient>
			<radialGradient id="{uid}-badge" cx="0.4" cy="0.35" r="0.8">
				<stop offset="0" stop-color="#fffaf0" />
				<stop offset="1" stop-color="#efe0c6" />
			</radialGradient>
			<linearGradient id="{uid}-brass" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#fbe6a6" />
				<stop offset="0.5" stop-color="#dcae55" />
				<stop offset="1" stop-color="#a97a2c" />
			</linearGradient>
			<clipPath id="{uid}-body"><rect x="16" y="14" width="268" height="186" rx="28" /></clipPath>
			<clipPath id="{uid}-above-slot"><rect x="0" y="-240" width="300" height="382" /></clipPath>
		</defs>

		<!-- 몸통 — 둥근 네모, 아래는 조금 어둡게(두께) · 위에 은은한 빛 -->
		<rect x="16" y="14" width="268" height="186" rx="28" fill="url(#{uid}-paint)" />
		<g clip-path="url(#{uid}-body)">
			<rect x="16" y="178" width="268" height="30" fill="#a32a1c" opacity="0.55" />
			<ellipse cx="80" cy="28" rx="90" ry="26" fill="#fff" opacity="0.08" />
		</g>
		<rect x="16" y="14" width="268" height="186" rx="28" fill="none" stroke="#9c2517" stroke-width="3" />
		<path d="M48 30H252" stroke="#fff" stroke-opacity="0.35" stroke-width="4" stroke-linecap="round" />

		<!-- 크림색 봉투 배지 -->
		<circle cx="150" cy="80" r="32" fill="#a82a1b" opacity="0.5" />
		<circle cx="150" cy="78" r="32" fill="url(#{uid}-badge)" />
		<g fill="none" stroke="#cf3d2c" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
			<rect x="132" y="66" width="36" height="25" rx="3" />
			<path d="M134 69l16 11 16-11" />
		</g>

		<!-- 놋쇠 투입구 (책상 위 놋쇠 도장과 같은 재료) -->
		<rect x="60" y="130" width="180" height="28" rx="14" fill="#8a5a14" opacity="0.45" />
		<rect x="60" y="128" width="180" height="28" rx="14" fill="url(#{uid}-brass)" />
		<rect class="slot" x="72" y="137" width="156" height="11" rx="5.5" fill="#2a0f07" bind:this={slot} />
		<rect x="72" y="137" width="156" height="4" rx="2" fill="#000" opacity="0.35" />

		<!-- 안 읽은 편지 — 투입구에 봉투 끝이 삐죽 -->
		{#if peek}
			<g clip-path="url(#{uid}-above-slot)">
				{#each [[-28, -7], [2, 4], [30, -3]].slice(0, peek) as [dx, r] (dx)}
					<g transform="translate({150 + dx} 147) rotate({r})">
						<rect x="-18" y="-27" width="36" height="30" rx="2" fill="#fffaf0" stroke="#d9c7a8" stroke-width="1" />
						<path d="M-17 -26L0 -14L17 -26" fill="none" stroke="#d9c7a8" stroke-width="1.1" />
					</g>
				{/each}
			</g>
		{/if}

		<!-- 편지가 떨어져 들어간다 (drop) — 평소엔 안 보인다 -->
		<g class="falling" bind:this={falling}>
			<rect x="130" y="114" width="40" height="28" rx="2" fill="#fffaf0" stroke="#d9c7a8" stroke-width="1" />
			<path d="M131 115L150 128L169 115" fill="none" stroke="#d9c7a8" stroke-width="1.1" />
			<circle cx="150" cy="128" r="3.4" fill="#b3263a" />
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
		/* 벽에 지는 그림자 */
		filter: drop-shadow(0 10px 10px rgb(70 30 10 / 0.3)) drop-shadow(0 2px 2px rgb(70 30 10 / 0.25));
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
		padding: 5px 12px 5px 11px;
		border-radius: 6px;
		background: #fffaf0;
		color: #b3263a;
		box-shadow:
			0 0 0 1px #d9c7a8,
			0 5px 12px rgb(70 30 10 / 0.3);
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
		top: 0;
		right: -4px;
		min-width: 28px;
		height: 28px;
		padding: 0 8px;
		border-radius: 14px;
		background: #fffaf0;
		color: #b3263a;
		font-size: 14px;
		font-weight: 900;
		line-height: 28px;
		text-align: center;
		box-shadow:
			0 0 0 2px #b3263a,
			0 3px 8px rgb(70 30 10 / 0.3);
	}
</style>
