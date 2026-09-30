<script lang="ts">
	/**
	 * 빨간 우체통 (Phase 71) — 편지함 맨 위에 서 있고, 편지를 보낼 때(EnvelopeCompose) 봉투가 이 투입구로 들어간다.
	 *   둥근 지붕 · 투입구(위쪽 앞면) · "우편" 글씨 · 아래쪽 꺼내는 문(열쇠 구멍 · 수거 시간 표) · 짧은 받침.
	 *   count — 안 읽은 편지 수: 오른쪽 위 숫자 + 투입구에 봉투 끝이 삐죽 나온다(3장까지).
	 *   drop — 바뀔 때마다 봉투 한 통이 위에서 떨어져 투입구로 쏙 들어간다 (편지가 왔다).
	 *   bump — 바뀔 때마다 통이 한 번 출렁인다 (들어갔다 · 나왔다).
	 *   open — 아래 문이 옆으로 열려 안쪽(쌓인 봉투)이 보인다 — 받은 편지가 이 문으로 나온다.
	 *   slot — 투입구 자리 (보낼 때 봉투를 맞춰 넣으려고 부르는 쪽이 잰다).
	 * 동작 줄이기면 움직이지 않는다 (CSS 는 app.css 가 끄고, 여기서 쓰는 WAAPI 는 직접 거른다).
	 */
	import { reducedMotion } from '../motion';

	let {
		count = 0,
		open = false,
		drop = 0,
		bump = 0,
		slot = $bindable()
	}: {
		count?: number;
		open?: boolean;
		drop?: number;
		bump?: number;
		slot?: SVGElement;
	} = $props();
	const uid = $props.id();

	let box = $state<HTMLElement>();
	let falling = $state<SVGGElement>();

	// 출렁 — 눌렸다 튀어 오르는 젤리처럼 (아래를 축으로)
	const wobble = () =>
		box?.animate(
			[
				{ transform: 'scale(1, 1)' },
				{ transform: 'scale(1.05, 0.94)', offset: 0.25 },
				{ transform: 'scale(0.97, 1.04)', offset: 0.55 },
				{ transform: 'scale(1.01, 0.99)', offset: 0.8 },
				{ transform: 'scale(1, 1)' }
			],
			{ duration: 520, easing: 'ease-out' }
		);

	// svelte-ignore state_referenced_locally
	let lastBump = bump; // 처음 값은 장면 없이 — 바뀔 때만
	$effect(() => {
		if (bump === lastBump) return;
		lastBump = bump;
		if (!reducedMotion()) wobble();
	});

	// 편지가 떨어져 투입구로 — 위에서 비스듬히 내려와 투입구 선에서 아래부터 사라진다(들어간다)
	// svelte-ignore state_referenced_locally
	let lastDrop = drop;
	$effect(() => {
		if (drop === lastDrop) return;
		lastDrop = drop;
		if (reducedMotion() || !falling) return;
		falling.animate(
			[
				{ transform: 'translateY(-120px) rotate(-14deg)', opacity: 0 },
				{ transform: 'translateY(-14px) rotate(2deg)', opacity: 1, offset: 0.55 },
				{ transform: 'translateY(0) rotate(0) scaleY(1)', opacity: 1, offset: 0.72 },
				{ transform: 'translateY(0) rotate(0) scaleY(0)', opacity: 1 }
			],
			{ duration: 820, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' }
		).finished.then(() => wobble(), () => {});
	});

	const peek = $derived(Math.min(3, count));
</script>

<span class="postbox" class:open bind:this={box}>
	<svg viewBox="0 0 160 252" aria-hidden="true">
		<defs>
			<!-- 둥근 통 — 가운데가 밝고 양옆이 어두워 원통처럼 -->
			<linearGradient id="{uid}-body" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="#a90f18" />
				<stop offset="0.28" stop-color="#e7262f" />
				<stop offset="0.55" stop-color="#d91c25" />
				<stop offset="1" stop-color="#8f0b13" />
			</linearGradient>
			<radialGradient id="{uid}-dome" cx="0.38" cy="0.3" r="0.8">
				<stop offset="0" stop-color="#ff5a60" />
				<stop offset="0.5" stop-color="#dc1f28" />
				<stop offset="1" stop-color="#980c14" />
			</radialGradient>
			<linearGradient id="{uid}-door" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="#c3141d" />
				<stop offset="0.4" stop-color="#dd2029" />
				<stop offset="1" stop-color="#a50f17" />
			</linearGradient>
			<linearGradient id="{uid}-base" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="#4a4d55" />
				<stop offset="0.35" stop-color="#6d717a" />
				<stop offset="1" stop-color="#34363c" />
			</linearGradient>
			<clipPath id="{uid}-above-slot"><rect x="0" y="-200" width="160" height="294" /></clipPath>
		</defs>

		<!-- 바닥 그림자 · 받침 -->
		<ellipse cx="80" cy="246" rx="62" ry="5" fill="rgb(40 10 0 / 0.25)" />
		<rect x="46" y="222" width="68" height="18" fill="url(#{uid}-base)" />
		<rect x="36" y="236" width="88" height="10" rx="3" fill="url(#{uid}-base)" />

		<!-- 몸통 · 둥근 지붕 · 지붕 띠 -->
		<rect x="22" y="66" width="116" height="160" rx="7" fill="url(#{uid}-body)" />
		<path d="M24 70C24 34 50 14 80 14C110 14 136 34 136 70Z" fill="url(#{uid}-dome)" />
		<rect x="18" y="62" width="124" height="13" rx="4" fill="#a20e17" />
		<rect x="20" y="62.5" width="120" height="3" rx="1.5" fill="#ff7a7f" opacity="0.55" />
		<ellipse cx="58" cy="36" rx="18" ry="8" fill="#fff" opacity="0.22" transform="rotate(-24 58 36)" />

		<!-- 투입구 — 튀어나온 차양 · 움푹한 틀 · 검은 구멍 -->
		<rect x="44" y="86" width="72" height="18" rx="5" fill="#7d0910" />
		<rect class="slot" x="51" y="92" width="58" height="6" rx="3" fill="#1c0204" bind:this={slot} />
		<rect x="40" y="81" width="80" height="6" rx="3" fill="#f0434b" />
		<rect x="42" y="81.5" width="76" height="1.6" rx="0.8" fill="#fff" opacity="0.5" />

		<!-- 안 읽은 편지 — 투입구에 봉투 끝이 삐죽 -->
		{#if peek}
			<g clip-path="url(#{uid}-above-slot)">
				{#each [[-15, -7], [3, 5], [16, -3]].slice(0, peek) as [dx, r] (dx)}
					<g transform="translate({80 + dx} 95) rotate({r})">
						<rect x="-13" y="-19" width="26" height="22" rx="1.5" fill="#fffaf0" stroke="#d9c7a8" stroke-width="0.8" />
						<path d="M-12.5 -18.5L0 -9L12.5 -18.5" fill="none" stroke="#d9c7a8" stroke-width="0.9" />
					</g>
				{/each}
			</g>
		{/if}

		<!-- "우편" · 봉투 그림 -->
		<g fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round">
			<rect x="68" y="112" width="24" height="16" rx="2" />
			<path d="M68.5 113L80 121.5L91.5 113" />
		</g>
		<text x="80" y="150" text-anchor="middle" font-size="17" font-weight="800" fill="#fff" letter-spacing="3">우편</text>

		<!-- 꺼내는 문 — 안쪽(쌓인 봉투)이 뒤에 있다 -->
		<rect x="38" y="160" width="84" height="56" rx="4" fill="#3a0508" />
		<g opacity="0.9">
			<rect x="46" y="190" width="30" height="20" rx="1.5" fill="#f3e6cf" transform="rotate(-6 61 200)" />
			<rect x="70" y="194" width="34" height="18" rx="1.5" fill="#fffaf0" transform="rotate(5 87 203)" />
		</g>
		<g class="door">
			<rect x="38" y="160" width="84" height="56" rx="4" fill="url(#{uid}-door)" stroke="#8f0b13" stroke-width="1.6" />
			<!-- 수거 시간 표 -->
			<rect x="50" y="170" width="40" height="14" rx="2" fill="#fbf6ee" />
			<path d="M54 175h24M54 179.5h17" stroke="#a7a39b" stroke-width="1.4" stroke-linecap="round" />
			<!-- 손잡이 · 열쇠 구멍 -->
			<rect x="104" y="181" width="8" height="14" rx="4" fill="#8f0b13" />
			<circle cx="108" cy="186" r="1.8" fill="#2a0306" />
			<rect x="107.2" y="186" width="1.6" height="4.5" fill="#2a0306" />
		</g>

		<!-- 몸통 빛 -->
		<rect x="31" y="78" width="6" height="140" rx="3" fill="#fff" opacity="0.16" />

		<!-- 편지가 떨어져 들어간다 (drop) — 평소엔 안 보인다 -->
		<g class="falling" bind:this={falling}>
			<rect x="66" y="75" width="28" height="20" rx="1.5" fill="#fffaf0" stroke="#d9c7a8" stroke-width="0.8" />
			<path d="M66.5 75.5L80 85L93.5 75.5" fill="none" stroke="#d9c7a8" stroke-width="0.9" />
			<circle cx="80" cy="85" r="2.6" fill="#c0392b" />
		</g>
	</svg>
	{#if count > 0}<span class="count num" aria-hidden="true">{count > 99 ? '99+' : count}</span>{/if}
</span>

<style>
	.postbox {
		position: relative;
		display: block;
		width: 100%;
		transform-origin: 50% 96%;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
		filter: drop-shadow(0 6px 10px rgb(90 10 10 / 0.22));
	}
	.door {
		transform-box: fill-box;
		transform-origin: 0 50%;
		transition: transform 0.38s cubic-bezier(0.3, 0.7, 0.3, 1);
	}
	/* 문이 옆으로 열린다 — 경첩(왼쪽)을 축으로 접히듯 */
	.open .door {
		transform: scaleX(0.12) skewY(-6deg);
	}
	.falling {
		opacity: 0;
		transform-box: fill-box;
		transform-origin: 50% 100%;
	}
	.count {
		position: absolute;
		top: 2%;
		right: 8%;
		min-width: 26px;
		height: 26px;
		padding: 0 7px;
		border-radius: 13px;
		background: #fff;
		color: #d11c25;
		font-size: 14px;
		font-weight: 900;
		line-height: 26px;
		text-align: center;
		box-shadow:
			0 0 0 2px #d11c25,
			0 3px 8px rgb(90 10 10 / 0.3);
	}
</style>
