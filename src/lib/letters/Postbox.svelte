<script lang="ts">
	/**
	 * 빨간 우체통 (Phase 71 · 72) — 정면에서 본 납작한 2D 네모. 편지함 맨 위에 화면 폭 가득, 편지를 쓸 때(EnvelopeCompose)는 화면 위쪽에.
	 *   위 띠 · 가운데 흰 봉투 문양 · 그 아래 가로로 긴 투입구. 아래 가장자리는 조금 어두운 두께.
	 *   count — 안 읽은 편지 수: 오른쪽 위 숫자 + 투입구에 봉투 끝이 삐죽 나온다(3장까지).
	 *   drop — 바뀔 때마다 봉투 한 통이 위에서 떨어져 투입구로 쏙 → 통이 출렁 → 위에 "+✉" (편지가 왔다). dropN 은 몇 통인지.
	 *   added — 바뀔 때마다 출렁 + 위에 "+✉" 만 (편지를 보내고 편지함으로 돌아왔을 때). bump — 출렁만.
	 *   slot — 투입구 자리 (보낼 때 봉투를 맞춰 넣으려고 부르는 쪽이 잰다).
	 * 크기는 부르는 쪽이 정한다 (폭 100% · 높이 --h). 동작 줄이기면 움직이지 않는다 (CSS 는 app.css 가 끄고, 여기서 쓰는 WAAPI 는 직접 거른다).
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
		slot?: HTMLElement;
	} = $props();

	let box = $state<HTMLElement>();
	let falling = $state<HTMLElement>();
	let plus = $state<HTMLElement>();
	let plusN = $state(1);

	// 출렁 — 납작한 판이 살짝 눌렸다 돌아온다 (아래를 축으로)
	const wobble = () =>
		box?.animate(
			[
				{ transform: 'scale(1, 1)' },
				{ transform: 'scale(1.015, 0.96)', offset: 0.3 },
				{ transform: 'scale(0.995, 1.015)', offset: 0.65 },
				{ transform: 'scale(1, 1)' }
			],
			{ duration: 480, easing: 'ease-out' }
		);
	// "+✉" — 위 가장자리에서 톡 튀어나와 잠깐 머물다 떠오르며 사라진다
	const pop = (n: number) => {
		plusN = n;
		plus?.animate(
			[
				{ opacity: 0, transform: 'translate(-50%, -20%) scale(0.5)' },
				{ opacity: 1, transform: 'translate(-50%, -70%) scale(1.08)', offset: 0.18 },
				{ opacity: 1, transform: 'translate(-50%, -66%) scale(1)', offset: 0.3 },
				{ opacity: 1, transform: 'translate(-50%, -74%) scale(1)', offset: 0.75 },
				{ opacity: 0, transform: 'translate(-50%, -150%) scale(0.96)' }
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
					{ transform: 'translateY(-110px) rotate(-12deg)', opacity: 0 },
					{ transform: 'translateY(-12px) rotate(2deg)', opacity: 1, offset: 0.55 },
					{ transform: 'translateY(0) rotate(0) scaleY(1)', opacity: 1, offset: 0.72 },
					{ transform: 'translateY(0) rotate(0) scaleY(0)', opacity: 1 }
				],
				{ duration: 780, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' }
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
	<span class="face">
		<span class="cap"></span>
		<svg class="emblem" viewBox="0 0 64 44" aria-hidden="true">
			<rect x="3" y="3" width="58" height="38" rx="4" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" />
			<path d="M5 6l27 20 27-20" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" />
		</svg>
		<span class="slot-frame">
			<span class="slot" bind:this={slot}>
				<!-- 안 읽은 편지 — 투입구에 봉투 끝이 삐죽 -->
				{#if peek}
					<span class="peeks" aria-hidden="true">
						{#each [[-22, -6], [4, 4], [26, -2]].slice(0, peek) as [dx, r] (dx)}
							<i class="peek" style:--dx="{dx}px" style:--r="{r}deg"></i>
						{/each}
					</span>
				{/if}
				<!-- 편지가 떨어져 들어간다 (drop) — 평소엔 안 보인다 -->
				<i class="falling" bind:this={falling} aria-hidden="true"></i>
			</span>
		</span>
	</span>
	<!-- "+✉" — 편지가 들어왔다 -->
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
		height: var(--h, 200px);
		transform-origin: 50% 100%;
	}
	/* 납작한 빨간 판 — 아래 가장자리만 어두운 두께 */
	.face {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: calc(var(--h, 200px) * 0.1);
		padding-top: calc(var(--h, 200px) * 0.1);
		border-radius: 18px;
		background: #de262e;
		box-shadow:
			inset 0 -7px 0 #a8141b,
			inset 0 2px 0 rgb(255 255 255 / 0.22),
			0 8px 18px -8px rgb(120 10 10 / 0.45);
	}
	/* 위 띠 */
	.cap {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 14%;
		border-radius: 18px 18px 0 0;
		background: #c41d25;
		box-shadow: inset 0 2px 0 rgb(255 255 255 / 0.22);
	}
	.emblem {
		position: relative;
		width: calc(var(--h, 200px) * 0.3);
		height: auto;
		color: #fff;
	}
	/* 투입구 — 움푹한 틀 안의 검은 구멍 */
	.slot-frame {
		position: relative;
		display: flex;
		align-items: center;
		width: 72%;
		height: calc(var(--h, 200px) * 0.15);
		padding: 0 calc(var(--h, 200px) * 0.06);
		border-radius: 999px;
		background: #99111a;
		box-shadow:
			inset 0 3px 0 rgb(0 0 0 / 0.25),
			0 -3px 0 rgb(255 120 120 / 0.55);
	}
	.slot {
		position: relative;
		flex: 1;
		height: 34%;
		border-radius: 999px;
		background: #26030a;
	}
	/* 봉투 끝 — 투입구 선(가운데) 위로만 보인다 */
	.peeks {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 50%;
		height: 60px;
		overflow: hidden;
		pointer-events: none;
	}
	.peek {
		position: absolute;
		left: calc(50% + var(--dx) - 17px);
		bottom: -12px;
		width: 34px;
		height: 30px;
		border-radius: 2px;
		background:
			linear-gradient(to bottom right, transparent calc(50% - 0.7px), #d9c7a8 50%, transparent calc(50% + 0.7px)) left top / 50% 55% no-repeat,
			linear-gradient(to bottom left, transparent calc(50% - 0.7px), #d9c7a8 50%, transparent calc(50% + 0.7px)) right top / 50% 55% no-repeat,
			#fffaf0;
		box-shadow: 0 0 0 1px #d9c7a8;
		rotate: var(--r);
	}
	.falling {
		position: absolute;
		left: 50%;
		bottom: 50%;
		width: 40px;
		height: 28px;
		margin-left: -20px;
		border-radius: 2px;
		background:
			radial-gradient(circle at 50% 58%, #c0392b 3px, transparent 3.5px),
			linear-gradient(to bottom right, transparent calc(50% - 0.7px), #d9c7a8 50%, transparent calc(50% + 0.7px)) left top / 50% 60% no-repeat,
			linear-gradient(to bottom left, transparent calc(50% - 0.7px), #d9c7a8 50%, transparent calc(50% + 0.7px)) right top / 50% 60% no-repeat,
			#fffaf0;
		box-shadow: 0 0 0 1px #d9c7a8;
		opacity: 0;
		transform-origin: 50% 100%;
		pointer-events: none;
	}
	/* "+✉" — 위 가장자리 가운데 */
	.plus {
		position: absolute;
		left: 50%;
		top: 0;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 12px;
		border-radius: 999px;
		background: #fff;
		color: #d11c25;
		box-shadow:
			0 0 0 2px #d11c25,
			0 4px 10px rgb(90 10 10 / 0.25);
		opacity: 0;
		transform: translate(-50%, -66%);
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
	}
	.count {
		position: absolute;
		top: -8px;
		right: -6px;
		min-width: 28px;
		height: 28px;
		padding: 0 8px;
		border-radius: 14px;
		background: #fff;
		color: #d11c25;
		font-size: 14px;
		font-weight: 900;
		line-height: 28px;
		text-align: center;
		box-shadow:
			0 0 0 2px #d11c25,
			0 3px 8px rgb(90 10 10 / 0.3);
	}
</style>
