<script lang="ts" module>
	export type Side = 'front' | 'back';
	/** 편지지 위치 — 봉투 안 / 반쯤 나옴 / 거의 다 나옴 */
	export type PaperPos = 'in' | 'peek' | 'out';
</script>

<script lang="ts">
	/**
	 * 우편 봉투 한 장 (Phase 32) — 편지함 목록 · 봉투 열기 · 편지 쓰기 연출이 같이 쓴다.
	 *   앞면(front): 항공우편 줄무늬 테두리 · From. · 우표 · 소인 · To. (손글씨)
	 *   뒷면(back) : 안쪽 벽(안감) · 편지지 · 앞주머니 · 덮개 · 밀랍 봉인 · From.
	 * 크기는 w 하나로 — 안쪽은 전부 em (1em = w / 20) 이라 목록의 작은 봉투와 연출의 큰 봉투가 같은 모양이다.
	 * 움직임은 부모가 상태(side · sealed · broken · open · paper)를 바꾸면 CSS 전환으로. 동작 줄이기면 app.css 가 전환을 끈다.
	 */
	import '@fontsource/nanum-pen-script/index.css';

	let {
		to,
		toSub = '',
		from,
		date,
		side = 'front',
		sealed = true,
		broken = false,
		open = false,
		paper = 'in',
		postmark = '',
		glow = false,
		sticker = '',
		stamping = false,
		w = 320
	}: {
		to: string;
		toSub?: string;
		from: string;
		date: string;
		side?: Side;
		sealed?: boolean;
		broken?: boolean;
		open?: boolean;
		paper?: PaperPos;
		postmark?: string;
		glow?: boolean;
		sticker?: string;
		/** 봉인이 막 찍히는 중 — 위에서 눌러 찍는 움직임 */
		stamping?: boolean;
		w?: number;
	} = $props();

	// 봉투마다 다른 id — 편지함에 봉투가 여러 장이어도 SVG id 가 겹치지 않게
	const uid = $props.id();
	const WAX = 'M20 1.5c3 0 4.2 2.6 7 3.2s5.6-.6 7.3 1.9.2 5.1 1.4 7.8 4 3.7 3.8 6.8-3.2 3.9-4 6.6.6 5.6-1.5 7.7-5 .5-7.6 1.7-3.6 3.9-6.4 3.9-4-2.8-6.6-3.9-5.6.4-7.6-1.7-.7-5-1.5-7.6S1.4 23.5 1.5 20.3s2.9-4.2 3.9-6.8-.6-5.4 1.4-7.8 4.6-1.3 7.3-1.9S17 1.5 20 1.5z';
	const HEART = 'M20 26.5s-6-3.7-6-8.4a3.4 3.4 0 0 1 6-2.2 3.4 3.4 0 0 1 6 2.2c0 4.7-6 8.4-6 8.4z';
</script>

<div class="env" class:show-back={side === 'back'} class:glow style:--w="{w}px" aria-hidden="true">
	<!-- 앞면 (주소 쪽) -->
	<div class="face front">
		<div class="inner grain">
			<div class="from-line">
				<span class="lbl">From.</span>
				<span class="hand">{from}</span>
			</div>
			<div class="stamp">
				<div class="stamp-art">
					<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="#fff" /></svg>
					<span>CNSA</span>
				</div>
			</div>
			<div class="postmark">
				<svg class="waves" viewBox="0 0 60 20"><path d="M0 4q5-4 10 0t10 0 10 0 10 0 10 0 10 0M0 10q5-4 10 0t10 0 10 0 10 0 10 0 10 0M0 16q5-4 10 0t10 0 10 0 10 0 10 0 10 0" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
				<div class="ring">
					<small>CNSA POST</small>
					<b>{postmark || date}</b>
				</div>
			</div>
			<div class="to-block">
				<span class="lbl">To.</span>
				<span class="hand big">{to}</span>
				{#if toSub}<span class="sub">{toSub}</span>{/if}
				<i class="rule"></i>
				<i class="rule short"></i>
			</div>
			{#if sticker}<span class="sticker">{sticker}</span>{/if}
		</div>
	</div>

	<!-- 뒷면 (덮개 쪽) -->
	<div class="face back" class:open data-paper={paper}>
		<div class="wall"></div>
		<div class="paper-in">
			<i></i><i></i><i></i><i></i><i></i>
		</div>
		<div class="pocket grain">
			<span class="back-date num">{date}</span>
			<span class="back-from"><span class="lbl">From.</span> <span class="hand">{from}</span></span>
		</div>
		<div class="flap"></div>
		{#if sealed}
			<div class="seal" class:broken class:stamping>
				{#each ['l', 'r'] as side (side)}
					<span class="half {side}">
						<svg viewBox="0 0 40 40">
							<defs>
								<radialGradient id="wax-{uid}-{side}" cx="38%" cy="32%" r="70%">
									<stop offset="0" stop-color="#ff7a8a" />
									<stop offset=".55" stop-color="#d92c55" />
									<stop offset="1" stop-color="#8f1233" />
								</radialGradient>
							</defs>
							<path d={WAX} fill="url(#wax-{uid}-{side})" />
							<circle cx="20" cy="20" r="11.5" fill="none" stroke="rgb(255 255 255 / .35)" stroke-width="1.4" />
							<path d={HEART} fill="rgb(120 10 40 / .55)" stroke="rgb(255 255 255 / .4)" stroke-width=".8" />
						</svg>
					</span>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.env {
		--w: 320px;
		position: relative;
		width: var(--w);
		height: calc(var(--w) * 0.62);
		font-size: calc(var(--w) / 20);
		transform-style: preserve-3d;
		transform: rotateY(0deg);
		transition: transform 0.7s cubic-bezier(0.3, 0.7, 0.2, 1);
		color: var(--env-ink);
	}
	.env.show-back {
		transform: rotateY(180deg);
	}
	.face {
		position: absolute;
		inset: 0;
		border-radius: 0.35em;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}
	.back {
		transform: rotateY(180deg);
	}
	.env.glow .face {
		box-shadow:
			0 0.3em 1.2em rgb(240 57 110 / 0.28),
			0 0.1em 0.4em rgb(0 0 0 / 0.12);
	}
	.front {
		/* 항공우편 줄무늬 테두리 — 브랜드 주황 · 핑크 */
		background: repeating-linear-gradient(
			-45deg,
			var(--g-orange) 0 0.9em,
			var(--env-paper) 0.9em 1.35em,
			var(--g-pink) 1.35em 2.25em,
			var(--env-paper) 2.25em 2.7em
		);
		box-shadow:
			0 0.25em 0.9em rgb(0 0 0 / 0.14),
			0 0.05em 0.15em rgb(0 0 0 / 0.1);
	}
	.inner {
		position: absolute;
		inset: 0.42em;
		border-radius: 0.15em;
		background: var(--env-paper);
	}
	/* 종이 결 — 아주 옅은 잡음 */
	.grain {
		background-image:
			url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .25 0 0 0 0 .2 0 0 0 0 .15 0 0 0 .09 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"),
			linear-gradient(var(--env-paper), var(--env-paper));
	}
	.lbl {
		font-size: 0.62em;
		font-weight: 700;
		letter-spacing: 0.06em;
		opacity: 0.55;
	}
	.hand {
		font-family: var(--hand);
		font-size: 1.25em;
		line-height: 1;
	}
	.hand.big {
		font-size: 1.85em;
	}
	.from-line {
		position: absolute;
		top: 0.75em;
		left: 0.9em;
		display: flex;
		align-items: baseline;
		gap: 0.35em;
		max-width: 55%;
		white-space: nowrap;
		overflow: hidden;
	}
	/* 우표 — 톱니 가장자리 */
	.stamp {
		position: absolute;
		top: 0.6em;
		right: 0.7em;
		width: 2.9em;
		height: 3.4em;
		padding: 0.22em;
		background: #fff;
		transform: rotate(3deg);
		/* 가운데는 꽉 채우고, 가장자리(여백)에만 둥근 구멍이 줄지어 — 우표 톱니 */
		-webkit-mask:
			linear-gradient(#000 0 0) content-box,
			radial-gradient(circle, transparent 0.11em, #000 0.12em) 0 0 / 0.44em 0.44em round;
		mask:
			linear-gradient(#000 0 0) content-box,
			radial-gradient(circle, transparent 0.11em, #000 0.12em) 0 0 / 0.44em 0.44em round;
		filter: drop-shadow(0 0.05em 0.1em rgb(0 0 0 / 0.2));
	}
	.stamp-art {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.1em;
		width: 100%;
		height: 100%;
		background: var(--brand);
		color: #fff;
	}
	.stamp-art svg {
		width: 1.4em;
		height: 1.4em;
	}
	.stamp-art span {
		font-size: 0.42em;
		font-weight: 900;
		letter-spacing: 0.08em;
	}
	/* 소인 — 우표 위에 비스듬히 찍힌 브랜드색 잉크 */
	.postmark {
		position: absolute;
		top: 0.95em;
		right: 2.3em;
		display: flex;
		align-items: center;
		color: rgb(217 40 104 / 0.72);
		transform: rotate(-12deg);
		mix-blend-mode: multiply;
		pointer-events: none;
	}
	.waves {
		width: 3.2em;
		height: 1.1em;
		margin-right: -0.2em;
	}
	.ring {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 2.9em;
		height: 2.9em;
		border-radius: 50%;
		border: 0.12em solid currentColor;
		box-shadow: inset 0 0 0 0.16em var(--env-paper), inset 0 0 0 0.24em currentColor;
		line-height: 1;
	}
	.ring small {
		font-size: 0.34em;
		font-weight: 800;
		letter-spacing: 0.05em;
	}
	.ring b {
		margin-top: 0.12em;
		font-size: 0.72em;
		font-weight: 900;
	}
	.to-block {
		position: absolute;
		left: 34%;
		right: 0.9em;
		bottom: 1em;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 0.4em;
	}
	.to-block .big {
		max-width: 100%;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 0.62em;
		font-weight: 600;
		opacity: 0.6;
	}
	.rule {
		flex-basis: 100%;
		height: 0;
		margin-top: 0.25em;
		border-bottom: 0.06em dashed var(--env-line);
	}
	.rule.short {
		width: 70%;
		flex-basis: 70%;
		margin-top: 0.7em;
	}
	.sticker {
		position: absolute;
		left: 0.8em;
		bottom: 0.85em;
		padding: 0.2em 0.55em;
		border-radius: 0.3em;
		background: var(--accent-fill-deep);
		color: #fff;
		font-size: 0.6em;
		font-weight: 800;
		transform: rotate(-6deg);
		box-shadow: 0 0.1em 0.3em rgb(0 0 0 / 0.2);
	}

	/* ── 뒷면 ── */
	.wall {
		position: absolute;
		inset: 0;
		border-radius: 0.35em;
		/* 안감 — 브랜드색 가는 사선 (덮개를 열면 보인다) */
		background:
			repeating-linear-gradient(45deg, rgb(240 57 110 / 0.16) 0 0.18em, transparent 0.18em 0.7em),
			linear-gradient(160deg, #fbe3e0, #f6d9e6);
		box-shadow:
			0 0.25em 0.9em rgb(0 0 0 / 0.14),
			0 0.05em 0.15em rgb(0 0 0 / 0.1);
		z-index: 0;
	}
	/* 봉투 안의 편지지 — 줄 친 미색 종이 */
	.paper-in {
		position: absolute;
		left: 0.9em;
		right: 0.9em;
		top: 0.5em;
		height: 88%;
		display: flex;
		flex-direction: column;
		gap: 0.62em;
		padding: 1.1em 1.2em;
		border-radius: 0.2em;
		background: #fffdf8;
		box-shadow: 0 0.1em 0.4em rgb(0 0 0 / 0.15);
		transform: translateY(0);
		transition: transform 0.65s cubic-bezier(0.25, 0.8, 0.25, 1);
		z-index: 2;
	}
	.paper-in i {
		height: 0.08em;
		background: rgb(59 47 36 / 0.14);
	}
	.paper-in i:first-child {
		width: 45%;
		height: 0.14em;
		background: var(--accent-fill-deep);
		opacity: 0.6;
	}
	.back[data-paper='peek'] .paper-in {
		transform: translateY(-42%);
	}
	.back[data-paper='out'] .paper-in {
		transform: translateY(-78%);
	}
	/* 앞주머니 — 양옆 · 아래 세 장이 가운데로 모인 모양 */
	.pocket {
		position: absolute;
		inset: 0;
		border-radius: 0.35em;
		clip-path: polygon(0 0, 50% 58%, 100% 0, 100% 100%, 0 100%);
		background-color: var(--env-paper);
		z-index: 3;
	}
	.pocket::before {
		content: '';
		position: absolute;
		inset: 0;
		/* 주머니 접힌 선 */
		background:
			linear-gradient(to top right, transparent calc(50% - 0.04em), var(--env-line) 50%, transparent calc(50% + 0.04em)) left bottom / 50% 100% no-repeat,
			linear-gradient(to top left, transparent calc(50% - 0.04em), var(--env-line) 50%, transparent calc(50% + 0.04em)) right bottom / 50% 100% no-repeat;
		opacity: 0.8;
	}
	.back-date {
		position: absolute;
		left: 1em;
		bottom: 0.95em;
		font-size: 0.6em;
		font-weight: 700;
		opacity: 0.5;
	}
	.back-from {
		position: absolute;
		right: 1em;
		bottom: 0.8em;
		display: flex;
		align-items: baseline;
		gap: 0.3em;
		white-space: nowrap;
	}
	/* 덮개 — 위에서 접혀 내려와 봉인된다. 열면 위로 180° 넘어가고, 반쯤 넘어간 때부터 편지지 뒤로 */
	.flap {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 62%;
		clip-path: polygon(0 0, 100% 0, 52% 96%, 50% 100%, 48% 96%);
		background: linear-gradient(180deg, var(--env-shade), var(--env-paper) 70%);
		transform-origin: 50% 0;
		transform: perspective(40em) rotateX(0deg);
		transition:
			transform 0.55s cubic-bezier(0.4, 0, 0.2, 1),
			z-index 0s 0.27s,
			background 0s 0.27s;
		z-index: 4;
	}
	.back.open .flap {
		transform: perspective(40em) rotateX(180deg);
		z-index: 1;
		background:
			repeating-linear-gradient(45deg, rgb(240 57 110 / 0.2) 0 0.18em, transparent 0.18em 0.7em),
			linear-gradient(0deg, #fbe3e0, #f6d9e6);
	}
	/* 밀랍 봉인 — 깨지면 두 반쪽이 떨어져 나간다 */
	.seal {
		position: absolute;
		left: 50%;
		top: 62%;
		width: 3em;
		height: 3em;
		margin: -1.9em 0 0 -1.5em;
		z-index: 5;
		filter: drop-shadow(0 0.1em 0.15em rgb(80 0 20 / 0.35));
	}
	.half {
		position: absolute;
		inset: 0;
		transition:
			transform 0.45s cubic-bezier(0.4, 0, 0.6, 1),
			opacity 0.45s;
	}
	.half svg {
		width: 100%;
		height: 100%;
	}
	.half.l {
		clip-path: polygon(0 0, 54% 0, 44% 35%, 56% 58%, 46% 100%, 0 100%);
	}
	.half.r {
		clip-path: polygon(54% 0, 100% 0, 100% 100%, 46% 100%, 56% 58%, 44% 35%);
	}
	.seal.stamping {
		animation: stamp 0.45s cubic-bezier(0.3, 1.5, 0.5, 1) both;
	}
	@keyframes stamp {
		0% {
			transform: scale(2.4) rotate(-20deg);
			opacity: 0;
		}
		60% {
			transform: scale(0.92) rotate(3deg);
			opacity: 1;
		}
		100% {
			transform: scale(1) rotate(0);
		}
	}
	.seal.broken .half.l {
		transform: translate(-1.4em, 1.6em) rotate(-35deg);
		opacity: 0;
	}
	.seal.broken .half.r {
		transform: translate(1.4em, 1.8em) rotate(30deg);
		opacity: 0;
	}
</style>
