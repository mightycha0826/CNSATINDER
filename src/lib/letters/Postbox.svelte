<script lang="ts">
	/**
	 * 빨간 우체통 (Phase 71 · 72 · 73) — 벽에 걸린 칠한 쇠 우편함을 정면에서 본 2D 네모. 아래 책상 · 봉투와 한 장면이 되게
	 * 책상 위 물건(놋쇠 도장 · 크림색 봉투)과 같은 재료로 그린다: 붉은 칠 · 위 차양 · 도드라진 테 · 크림색 봉투 문양 ·
	 * 놋쇠 투입구 판(덮개 + 검은 구멍) · 놋쇠 이름표 "우편" · 네 귀퉁이 놋쇠 못. 벽에 그림자가 진다.
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
	const RIVETS = [
		[28, 44],
		[292, 44],
		[28, 188],
		[292, 188]
	];
</script>

<span class="postbox" bind:this={box}>
	<svg viewBox="0 0 320 214" aria-hidden="true">
		<defs>
			<linearGradient id="{uid}-paint" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#d23a2f" />
				<stop offset="0.6" stop-color="#bf2d25" />
				<stop offset="1" stop-color="#a3231d" />
			</linearGradient>
			<linearGradient id="{uid}-hood" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#b52a22" />
				<stop offset="1" stop-color="#86190f" />
			</linearGradient>
			<radialGradient id="{uid}-brass" cx="30%" cy="20%" r="95%">
				<stop offset="0" stop-color="#fff3c4" />
				<stop offset="0.3" stop-color="#e6bb5c" />
				<stop offset="0.75" stop-color="#b07d2e" />
				<stop offset="1" stop-color="#6f4a14" />
			</radialGradient>
			<linearGradient id="{uid}-flap" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#f3d68a" />
				<stop offset="1" stop-color="#b8842f" />
			</linearGradient>
			<clipPath id="{uid}-body"><rect x="12" y="20" width="296" height="186" rx="10" /></clipPath>
			<clipPath id="{uid}-above-slot"><rect x="0" y="-240" width="320" height="366" /></clipPath>
		</defs>

		<!-- 몸통 — 붉은 칠, 아래는 조금 어둡게(두께) -->
		<rect x="12" y="20" width="296" height="186" rx="10" fill="url(#{uid}-paint)" />
		<g clip-path="url(#{uid}-body)">
			<rect x="12" y="196" width="296" height="12" fill="#7f1a13" opacity="0.55" />
			<rect x="22" y="30" width="8" height="160" rx="4" fill="#fff" opacity="0.1" />
		</g>
		<!-- 도드라진 테 (밝은 윗선 · 어두운 아랫선) -->
		<rect x="26" y="38" width="268" height="152" rx="7" fill="none" stroke="#7f1a13" stroke-opacity="0.45" stroke-width="2.4" transform="translate(0 1.4)" />
		<rect x="26" y="38" width="268" height="152" rx="7" fill="none" stroke="#ea6a58" stroke-opacity="0.75" stroke-width="1.6" />

		<!-- 위 차양 -->
		<rect x="4" y="6" width="312" height="24" rx="7" fill="url(#{uid}-hood)" />
		<rect x="8" y="7.5" width="304" height="3" rx="1.5" fill="#f08070" opacity="0.7" />
		<rect x="4" y="27" width="312" height="3" fill="#5e120c" opacity="0.35" />

		<!-- 봉투 문양 (크림색 — 책상 위 봉투와 같은 종이색) -->
		<g fill="none" stroke="#fbeedd" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round">
			<rect x="133" y="52" width="54" height="36" rx="4" />
			<path d="M135 55l25 18 25-18" />
		</g>

		<!-- 놋쇠 투입구 판 — 덮개 · 검은 구멍 · 양끝 못 -->
		<rect x="62" y="104" width="196" height="40" rx="9" fill="#5e3a0e" opacity="0.45" transform="translate(0 2.5)" />
		<rect x="62" y="104" width="196" height="40" rx="9" fill="url(#{uid}-brass)" />
		<rect class="slot" x="80" y="124" width="160" height="10" rx="5" fill="#241006" bind:this={slot} />
		<rect x="80" y="112" width="160" height="11" rx="3" fill="url(#{uid}-flap)" />
		<rect x="80" y="121.5" width="160" height="2" fill="#5e3a0e" opacity="0.5" />
		<circle cx="71" cy="124" r="3" fill="#6f4a14" /><circle cx="249" cy="124" r="3" fill="#6f4a14" />

		<!-- 안 읽은 편지 — 투입구에 봉투 끝이 삐죽 -->
		{#if peek}
			<g clip-path="url(#{uid}-above-slot)">
				{#each [[-30, -7], [2, 4], [30, -3]].slice(0, peek) as [dx, r] (dx)}
					<g transform="translate({160 + dx} 130) rotate({r})">
						<rect x="-19" y="-26" width="38" height="30" rx="2" fill="#fffaf0" stroke="#d9c7a8" stroke-width="1" />
						<path d="M-18 -25L0 -12L18 -25" fill="none" stroke="#d9c7a8" stroke-width="1.1" />
					</g>
				{/each}
			</g>
		{/if}

		<!-- 놋쇠 이름표 -->
		<rect x="128" y="158" width="64" height="22" rx="4" fill="url(#{uid}-brass)" />
		<text x="160" y="174" text-anchor="middle" font-size="13" font-weight="800" letter-spacing="4" fill="#5b3a10">우편</text>

		<!-- 네 귀퉁이 못 -->
		{#each RIVETS as [x, y] (x * 1000 + y)}
			<circle cx={x} cy={y + 1} r="4" fill="#5e120c" opacity="0.4" />
			<circle cx={x} cy={y} r="3.6" fill="url(#{uid}-brass)" />
		{/each}

		<!-- 편지가 떨어져 들어간다 (drop) — 평소엔 안 보인다 -->
		<g class="falling" bind:this={falling}>
			<rect x="140" y="102" width="40" height="28" rx="2" fill="#fffaf0" stroke="#d9c7a8" stroke-width="1" />
			<path d="M141 103L160 116L179 103" fill="none" stroke="#d9c7a8" stroke-width="1.1" />
			<circle cx="160" cy="116" r="3.4" fill="#b3263a" />
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
