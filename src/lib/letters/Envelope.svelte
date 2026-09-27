<script lang="ts" module>
	export type Side = 'front' | 'back';
	/** 편지지 위치 — 봉투 안 / 반쯤 나옴 / 거의 다 나옴 */
	export type PaperPos = 'in' | 'peek' | 'out';
	/** 항공우편 테두리 색 — brand: 테마 색(보낸 편지) · f: 붉은색(여학생이 보낸 편지) · m: 푸른색(남학생) · x: 성별 없음 */
	export type Border = 'brand' | 'f' | 'm' | 'x';
</script>

<script lang="ts">
	/**
	 * 우편 봉투 한 장 (Phase 32 · 35 다시 그림) — 편지함 · 봉투 열기 · 편지 쓰기 연출이 같이 쓴다.
	 *   앞면(front): 항공우편 줄무늬 테두리 · 보내는 사람(From.) · 항공 표시 · 학교 로고 우표 · 소인 · 받는 사람(To.) · 우편번호 칸
	 *   뒷면(back) : 안감 · 편지지 · 양옆/아래 주머니(접힌 선 · 그늘) · 덮개(그림자) · 밀랍 봉인(학교 로고 양각) · 가장자리 줄무늬
	 * 받은 편지는 보낸 사람의 성별로 테두리 색이 다르다 (border — 여학생 붉은색, 남학생 푸른색).
	 * 크기는 w 하나로 — 안쪽은 전부 em (1em = w / 20) 이라 목록의 작은 봉투와 연출의 큰 봉투가 같은 모양이다.
	 * 움직임은 부모가 상태(side · sealed · broken · open · paper)를 바꾸면 CSS 전환으로. 동작 줄이기면 app.css 가 전환을 끈다.
	 */
	import '@fontsource/nanum-pen-script/index.css';
	import { LOGO_FACES, LOGO_PATH, LOGO_VIEWBOX } from '$lib/ui/schoolLogo';

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
		border = 'brand',
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
		border?: Border;
		w?: number;
	} = $props();

	// 봉투마다 다른 id — 편지함에 봉투가 여러 장이어도 SVG id 가 겹치지 않게
	const uid = $props.id();
	// 밀랍 — 가장자리가 울퉁불퉁하고 아래로 한 방울 흘러내린 모양
	const WAX =
		'M20 2.2c2.6-.2 3.9 1.9 6.3 2.4 2.5.5 4.9-.9 6.6 1.1 1.6 1.9.4 4.4 1.3 6.6.9 2.3 3.5 3.3 3.6 5.9.1 2.7-2.6 3.7-3.3 6.1-.7 2.4.8 4.9-.8 6.9-1.5 1.9-4.2 1.4-6.3 2.4-1.2.6-1.6 2-1.8 3.5-.2 1.4-.9 2.6-2.1 2.6s-1.8-1.2-2-2.6c-.1-1-.5-1.9-1.4-2.2-2.4-.8-5.2.2-7.1-1.6-1.9-1.9-.9-4.6-1.8-7-.8-2.3-3.5-3.4-3.6-6-.1-2.7 2.7-3.6 3.5-6 .8-2.4-.6-4.9 1.1-6.9 1.7-1.9 4.3-1.1 6.6-1.8C16.5 4 17.6 2.4 20 2.2z';
</script>

<div class="env b-{border}" class:show-back={side === 'back'} class:glow style:--w="{w}px" aria-hidden="true">
	<!-- 앞면 (주소 쪽) -->
	<div class="face front">
		<div class="inner grain">
			<i class="show-through"></i>

			<div class="from-block">
				<span class="lbl">보내는 사람</span>
				<span class="from-line"><span class="en">From.</span> <span class="hand">{from}</span></span>
				<span class="avion">
					<svg viewBox="0 0 24 24"><path d="M21 15.5v-2l-8-5V3.8a1.5 1.5 0 0 0-3 0v4.7l-8 5v2l8-2.5v4.6L7.5 19v1.5L11.5 19l4 1.5V19L13 17.6V13z" fill="currentColor" /></svg>
					항공 · PAR AVION
				</span>
			</div>

			<!-- 우표 — 톱니 가장자리 · 학교 로고 · 액면가 -->
			<div class="stamp">
				<div class="stamp-art">
					<svg class="logo" viewBox={LOGO_VIEWBOX}>
						{#each LOGO_FACES as f (f.d)}<path d={f.d} fill={f.fill} />{/each}
					</svg>
					<span class="s-name">CNSA</span>
					<span class="s-val num">430</span>
				</div>
			</div>

			<!-- 소인 — 물결 줄 + 이중 원 (학교 로고 · 날짜) -->
			<div class="postmark">
				<svg class="waves" viewBox="0 0 60 22">
					<path d="M0 3q5-4 10 0t10 0 10 0 10 0 10 0 10 0M0 9q5-4 10 0t10 0 10 0 10 0 10 0 10 0M0 15q5-4 10 0t10 0 10 0 10 0 10 0 10 0M0 21q5-4 10 0t10 0 10 0 10 0 10 0 10 0" fill="none" stroke="currentColor" stroke-width="1.3" />
				</svg>
				<div class="ring">
					<small>CNSA POST</small>
					<b class="num">{postmark || date}</b>
					<svg class="pm-logo" viewBox={LOGO_VIEWBOX}><path d={LOGO_PATH} fill="currentColor" /></svg>
				</div>
			</div>

			<div class="to-block">
				<span class="lbl">받는 사람</span>
				<span class="to-line">
					<span class="en">To.</span>
					<span class="hand big">{to}</span>
					{#if toSub}<span class="sub">{toSub}</span>{/if}
				</span>
				<i class="rule"></i>
				<i class="rule short"></i>
				<span class="zip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
			</div>

			{#if sticker}<span class="sticker">{sticker}</span>{/if}
		</div>
	</div>

	<!-- 뒷면 (덮개 쪽) -->
	<div class="face back" class:open data-paper={paper}>
		<div class="wall"></div>
		<div class="paper-in">
			<i></i><i></i><i></i><i></i><i></i><i></i>
		</div>
		<div class="pocket grain">
			<i class="side l"></i>
			<i class="side r"></i>
			<i class="bottom"></i>
			<span class="back-date num">{date}</span>
			<span class="back-from"><span class="en">From.</span> <span class="hand">{from}</span></span>
		</div>
		<div class="flap">
			<div class="flap-face"></div>
		</div>
		<i class="edge"></i>
		{#if sealed}
			<div class="seal" class:broken class:stamping>
				{#each ['l', 'r'] as half (half)}
					<span class="half {half}">
						<svg viewBox="0 0 40 44">
							<defs>
								<radialGradient id="wax-{uid}-{half}" cx="36%" cy="30%" r="75%">
									<stop offset="0" stop-color="#e2455f" />
									<stop offset=".45" stop-color="#b8142f" />
									<stop offset="1" stop-color="#6d0718" />
								</radialGradient>
								<radialGradient id="pool-{uid}-{half}" cx="50%" cy="50%" r="50%">
									<stop offset=".7" stop-color="#000" stop-opacity="0" />
									<stop offset="1" stop-color="#000" stop-opacity=".28" />
								</radialGradient>
							</defs>
							<path d={WAX} fill="url(#wax-{uid}-{half})" />
							<!-- 눌러 찍은 자리 — 가운데가 살짝 꺼지고 테두리가 솟는다 -->
							<circle cx="20" cy="20.5" r="11.8" fill="url(#pool-{uid}-{half})" />
							<circle cx="20" cy="20.5" r="11.8" fill="none" stroke="rgb(255 190 200 / .35)" stroke-width=".7" />
							<circle cx="20" cy="20.5" r="10.4" fill="none" stroke="rgb(70 0 12 / .35)" stroke-width=".6" />
							<!-- 학교 로고 양각: 밝은 윤곽을 살짝 위에, 어두운 면을 그 위에 -->
							<g transform="translate(13.2 12.6) scale(.068)">
								<path d={LOGO_PATH} fill="rgb(255 200 208 / .45)" transform="translate(-10 -12)" />
								<path d={LOGO_PATH} fill="rgb(92 0 18 / .6)" />
							</g>
							<!-- 빛 반사 -->
							<ellipse cx="14" cy="10" rx="5" ry="2.4" fill="#fff" opacity=".28" transform="rotate(-24 14 10)" />
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
		--s1: var(--g-orange);
		--s2: var(--g-pink);
		position: relative;
		width: var(--w);
		height: calc(var(--w) * 0.62);
		font-size: calc(var(--w) / 20);
		transform-style: preserve-3d;
		transform: rotateY(0deg);
		transition: transform 0.8s cubic-bezier(0.34, 0.8, 0.26, 1);
		color: var(--env-ink);
	}
	/* 항공우편 테두리 — 받은 편지는 보낸 사람 성별로 */
	.b-f {
		--s1: #d8313b;
		--s2: #9d1830;
	}
	.b-m {
		--s1: #2f6fd6;
		--s2: #173f8c;
	}
	.env.show-back {
		transform: rotateY(180deg);
	}
	.face {
		position: absolute;
		inset: 0;
		border-radius: 0.3em;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}
	.back {
		transform: rotateY(180deg);
	}
	.env.glow .face {
		box-shadow:
			0 0 0 0.08em color-mix(in srgb, var(--s1) 55%, transparent),
			0 0.35em 1.4em color-mix(in srgb, var(--s1) 38%, transparent),
			0 0.1em 0.4em rgb(0 0 0 / 0.12);
	}

	/* ── 앞면 ── */
	.front {
		/* 항공우편 줄무늬 테두리 */
		background: repeating-linear-gradient(
			-45deg,
			var(--s1) 0 0.9em,
			var(--env-paper) 0.9em 1.35em,
			var(--s2) 1.35em 2.25em,
			var(--env-paper) 2.25em 2.7em
		);
		box-shadow:
			0 0.3em 1em -0.1em rgb(40 20 10 / 0.22),
			0 0.06em 0.15em rgb(40 20 10 / 0.14);
	}
	.inner {
		position: absolute;
		inset: 0.42em;
		border-radius: 0.12em;
		overflow: hidden;
		box-shadow: inset 0 0 0.9em rgb(120 90 50 / 0.1);
	}
	/* 종이 결 — 아주 옅은 잡음 + 가장자리가 살짝 바랜 빛 */
	.grain {
		background-image:
			url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .25 0 0 0 0 .2 0 0 0 0 .15 0 0 0 .09 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"),
			radial-gradient(130% 120% at 30% 20%, rgb(255 255 255 / 0.35), transparent 60%),
			linear-gradient(var(--env-paper), var(--env-paper));
	}
	/* 뒷면 덮개 모양이 종이 너머로 아주 옅게 비친다 */
	.show-through {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(to bottom right, transparent calc(50% - 0.03em), rgb(80 60 40 / 0.05) 50%, transparent calc(50% + 0.03em)) left top / 50% 62% no-repeat,
			linear-gradient(to bottom left, transparent calc(50% - 0.03em), rgb(80 60 40 / 0.05) 50%, transparent calc(50% + 0.03em)) right top / 50% 62% no-repeat;
		pointer-events: none;
	}
	.lbl {
		display: block;
		font-size: 0.42em;
		font-weight: 800;
		letter-spacing: 0.12em;
		opacity: 0.45;
	}
	.en {
		font-size: 0.6em;
		font-weight: 800;
		letter-spacing: 0.04em;
		opacity: 0.55;
	}
	.hand {
		font-family: var(--hand);
		font-size: 1.25em;
		line-height: 1;
	}
	.hand.big {
		font-size: 1.9em;
	}
	.from-block {
		position: absolute;
		top: 0.7em;
		left: 0.85em;
		display: flex;
		flex-direction: column;
		gap: 0.18em;
		max-width: 52%;
	}
	.from-line {
		display: flex;
		align-items: baseline;
		gap: 0.3em;
		white-space: nowrap;
		overflow: hidden;
		padding-bottom: 0.12em;
		border-bottom: 0.05em dashed var(--env-line);
	}
	.avion {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 0.25em;
		margin-top: 0.3em;
		padding: 0.14em 0.45em 0.14em 0.35em;
		border: 0.07em solid var(--s2);
		border-radius: 0.2em;
		color: var(--s2);
		font-size: 0.46em;
		font-weight: 900;
		letter-spacing: 0.08em;
		transform: rotate(-1.5deg);
		opacity: 0.85;
	}
	.avion svg {
		width: 1.25em;
		height: 1.25em;
		transform: rotate(45deg);
	}

	/* 우표 — 톱니 가장자리 (가운데는 꽉 채우고 여백에만 둥근 구멍) */
	.stamp {
		position: absolute;
		top: 0.55em;
		right: 0.65em;
		width: 3em;
		height: 3.55em;
		padding: 0.24em;
		background: #fffdf8;
		transform: rotate(3deg);
		-webkit-mask:
			linear-gradient(#000 0 0) content-box,
			radial-gradient(circle, transparent 0.11em, #000 0.12em) 0 0 / 0.44em 0.44em round;
		mask:
			linear-gradient(#000 0 0) content-box,
			radial-gradient(circle, transparent 0.11em, #000 0.12em) 0 0 / 0.44em 0.44em round;
		filter: drop-shadow(0 0.05em 0.1em rgb(0 0 0 / 0.25));
	}
	.stamp-art {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding-top: 0.1em;
		/* 하늘 — 로고가 떠 있는 옅은 새벽빛 */
		background:
			radial-gradient(120% 70% at 50% 110%, color-mix(in srgb, var(--s1) 30%, transparent), transparent 70%),
			linear-gradient(180deg, #eaf6fd, #fff4ec);
		box-shadow: inset 0 0 0 0.06em rgb(1 64 153 / 0.35);
		color: #014099;
	}
	.stamp-art .logo {
		width: 1.35em;
		height: 1.55em;
		filter: drop-shadow(0 0.04em 0.05em rgb(1 40 90 / 0.3));
	}
	.s-name {
		margin-top: 0.12em;
		font-size: 0.34em;
		font-weight: 900;
		letter-spacing: 0.14em;
	}
	.s-val {
		position: absolute;
		top: 0.14em;
		left: 0.18em;
		font-size: 0.3em;
		font-weight: 900;
	}
	/* 소인 — 우표 위에 비스듬히 찍힌 잉크 */
	.postmark {
		position: absolute;
		top: 1em;
		right: 2.1em;
		display: flex;
		align-items: center;
		color: rgb(40 30 60 / 0.62);
		transform: rotate(-10deg);
		mix-blend-mode: multiply;
		pointer-events: none;
	}
	.waves {
		width: 3.3em;
		height: 1.2em;
		margin-right: -0.25em;
	}
	.ring {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 3em;
		height: 3em;
		border-radius: 50%;
		border: 0.1em solid currentColor;
		box-shadow:
			inset 0 0 0 0.14em transparent,
			inset 0 0 0 0.2em currentColor;
		line-height: 1;
	}
	.ring small {
		font-size: 0.3em;
		font-weight: 900;
		letter-spacing: 0.06em;
	}
	.ring b {
		margin: 0.1em 0 0.06em;
		font-size: 0.66em;
		font-weight: 900;
	}
	.pm-logo {
		width: 0.5em;
		height: 0.58em;
	}
	.to-block {
		position: absolute;
		left: 36%;
		right: 0.85em;
		bottom: 0.55em;
		display: flex;
		flex-direction: column;
	}
	.to-line {
		display: flex;
		align-items: baseline;
		gap: 0.35em;
		min-width: 0;
	}
	.to-line .big {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.sub {
		flex: none;
		font-size: 0.56em;
		font-weight: 700;
		opacity: 0.6;
	}
	.rule {
		height: 0;
		margin-top: 0.2em;
		border-bottom: 0.05em dashed var(--env-line);
	}
	.rule.short {
		width: 72%;
		margin-top: 0.62em;
	}
	/* 우편번호 칸 — 한국 편지 봉투의 빨간 네모 다섯 개 */
	.zip {
		display: flex;
		align-self: flex-end;
		gap: 0.14em;
		margin-top: 0.4em;
	}
	.zip i {
		width: 0.62em;
		height: 0.72em;
		border: 0.06em solid rgb(214 48 60 / 0.6);
	}
	/* 읽음 · 답장 옴 — 고무 도장 */
	.sticker {
		position: absolute;
		left: 0.8em;
		bottom: 0.8em;
		padding: 0.18em 0.5em;
		border: 0.12em double currentColor;
		border-radius: 0.25em;
		color: color-mix(in srgb, var(--s2) 85%, #000);
		font-size: 0.62em;
		font-weight: 900;
		letter-spacing: 0.08em;
		transform: rotate(-8deg);
		mix-blend-mode: multiply;
		opacity: 0.85;
	}

	/* ── 뒷면 ── */
	.wall {
		position: absolute;
		inset: 0;
		border-radius: 0.3em;
		/* 안감 — 잔 무늬 종이 (덮개를 열면 보인다) */
		background:
			radial-gradient(circle at 25% 25%, color-mix(in srgb, var(--s1) 35%, transparent) 0.06em, transparent 0.07em) 0 0 / 0.55em 0.55em,
			radial-gradient(circle at 75% 75%, color-mix(in srgb, var(--s2) 30%, transparent) 0.06em, transparent 0.07em) 0 0 / 0.55em 0.55em,
			linear-gradient(160deg, #fbe7e2, #f3dbe6);
		box-shadow:
			0 0.3em 1em -0.1em rgb(40 20 10 / 0.22),
			0 0.06em 0.15em rgb(40 20 10 / 0.14);
	}
	/* 봉투 안의 편지지 — 줄 친 미색 종이, 윗단에 테마 색 띠 */
	.paper-in {
		position: absolute;
		left: 0.9em;
		right: 0.9em;
		top: 0.5em;
		height: 88%;
		display: flex;
		flex-direction: column;
		gap: 0.55em;
		padding: 1.1em 1.2em;
		border-radius: 0.18em;
		background:
			linear-gradient(90deg, transparent 0.8em, rgb(240 57 110 / 0.25) 0.8em 0.86em, transparent 0.86em),
			#fffdf8;
		box-shadow: 0 0.1em 0.4em rgb(0 0 0 / 0.15);
		transform: translateY(0);
		transition: transform 0.75s cubic-bezier(0.22, 0.9, 0.3, 1);
		z-index: 2;
	}
	.paper-in::before {
		content: '';
		position: absolute;
		inset: 0 0 auto;
		height: 0.14em;
		border-radius: 0.18em 0.18em 0 0;
		background: var(--accent-fill);
		opacity: 0.8;
	}
	.paper-in i {
		height: 0.07em;
		background: rgb(59 47 36 / 0.13);
	}
	.paper-in i:first-child {
		width: 42%;
		height: 0.12em;
		background: rgb(59 47 36 / 0.35);
	}
	.back[data-paper='peek'] .paper-in {
		transform: translateY(-42%);
	}
	.back[data-paper='out'] .paper-in {
		transform: translateY(-80%);
	}
	/* 앞주머니 — 양옆 날개 · 아래 날개가 가운데로 모인 모양 (각 날개에 접힌 그늘) */
	.pocket {
		position: absolute;
		inset: 0;
		border-radius: 0.3em;
		clip-path: polygon(0 0, 50% 56%, 100% 0, 100% 100%, 0 100%);
		z-index: 3;
	}
	.side,
	.bottom {
		position: absolute;
		inset: 0;
	}
	.side.l {
		clip-path: polygon(0 0, 50% 56%, 0 100%);
		background: linear-gradient(90deg, rgb(255 255 255 / 0.12), rgb(90 60 30 / 0.1));
	}
	.side.r {
		clip-path: polygon(100% 0, 50% 56%, 100% 100%);
		background: linear-gradient(270deg, rgb(255 255 255 / 0.1), rgb(90 60 30 / 0.12));
	}
	/* 아래 날개 — 가장 위에 겹쳐 조금 밝고, 접힌 선을 따라 그늘이 진다 */
	.bottom {
		clip-path: polygon(0 100%, 50% 44%, 100% 100%);
		background:
			linear-gradient(180deg, rgb(90 60 30 / 0.14), transparent 22%),
			linear-gradient(0deg, rgb(255 255 255 / 0.2), transparent 60%),
			var(--env-paper);
		filter: drop-shadow(0 -0.05em 0.08em rgb(0 0 0 / 0.1));
	}
	.back-date {
		position: absolute;
		left: 1em;
		bottom: 0.9em;
		font-size: 0.55em;
		font-weight: 800;
		letter-spacing: 0.06em;
		opacity: 0.45;
	}
	.back-from {
		position: absolute;
		right: 1em;
		bottom: 0.75em;
		display: flex;
		align-items: baseline;
		gap: 0.3em;
		max-width: 56%;
		white-space: nowrap;
		overflow: hidden;
	}
	/* 덮개 — 위에서 접혀 내려와 봉인된다 (아래 주머니에 그림자). 열면 위로 넘어가고, 반쯤 넘어간 때부터 편지지 뒤로 */
	.flap {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 62%;
		transform-origin: 50% 0;
		transform: perspective(40em) rotateX(0deg);
		filter: drop-shadow(0 0.12em 0.12em rgb(60 30 10 / 0.22));
		transition:
			transform 0.7s cubic-bezier(0.45, 0.05, 0.25, 1),
			z-index 0s 0.33s,
			filter 0s 0.33s;
		z-index: 4;
	}
	.flap-face {
		position: absolute;
		inset: 0;
		border-radius: 0.3em 0.3em 0 0;
		clip-path: polygon(0 0, 100% 0, 53.5% 95%, 50% 100%, 46.5% 95%);
		background:
			linear-gradient(180deg, transparent 70%, rgb(90 60 30 / 0.1)),
			linear-gradient(180deg, var(--env-shade), var(--env-paper) 75%);
		transition: background 0s 0.33s;
	}
	.back.open .flap {
		transform: perspective(40em) rotateX(180deg);
		filter: none;
		z-index: 1;
	}
	.back.open .flap-face {
		background:
			radial-gradient(circle at 25% 25%, color-mix(in srgb, var(--s1) 35%, transparent) 0.06em, transparent 0.07em) 0 0 / 0.55em 0.55em,
			linear-gradient(0deg, #fbe7e2, #f3dbe6);
	}
	/* 가장자리 줄무늬 — 받은 편지는 보낸 사람 성별 색. 덮개를 열면 옅어진다 */
	.edge {
		position: absolute;
		inset: 0;
		border-radius: 0.3em;
		padding: 0.3em;
		background: repeating-linear-gradient(-45deg, var(--s1) 0 0.9em, transparent 0.9em 1.35em, var(--s2) 1.35em 2.25em, transparent 2.25em 2.7em);
		-webkit-mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask-composite: xor;
		mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		mask-composite: exclude;
		opacity: 0.92;
		transition: opacity 0.3s;
		pointer-events: none;
		z-index: 5;
	}
	.back.open .edge {
		opacity: 0;
	}
	.b-brand .edge {
		opacity: 0;
	}
	/* 밀랍 봉인 — 깨지면 두 반쪽이 떨어져 나간다 */
	.seal {
		position: absolute;
		left: 50%;
		top: 62%;
		width: 3.2em;
		height: 3.52em;
		margin: -2em 0 0 -1.6em;
		z-index: 6;
		filter: drop-shadow(0 0.1em 0.12em rgb(70 0 15 / 0.4));
	}
	.half {
		position: absolute;
		inset: 0;
		transition:
			transform 0.6s cubic-bezier(0.3, 0, 0.6, 1),
			opacity 0.5s 0.1s;
	}
	.half svg {
		width: 100%;
		height: 100%;
	}
	.half.l {
		clip-path: polygon(0 0, 54% 0, 44% 30%, 57% 52%, 46% 78%, 50% 100%, 0 100%);
	}
	.half.r {
		clip-path: polygon(54% 0, 100% 0, 100% 100%, 50% 100%, 46% 78%, 57% 52%, 44% 30%);
	}
	.seal.stamping {
		animation: stamp 0.55s cubic-bezier(0.2, 1.3, 0.4, 1) both;
	}
	@keyframes stamp {
		0% {
			transform: translateY(-1.2em) scale(1.9) rotate(-16deg);
			opacity: 0;
		}
		55% {
			transform: scale(0.9) rotate(2deg);
			opacity: 1;
		}
		75% {
			transform: scale(1.04) rotate(-1deg);
		}
		100% {
			transform: none;
		}
	}
	.seal.broken .half.l {
		transform: translate(-1.3em, 2.2em) rotate(-38deg);
		opacity: 0;
	}
	.seal.broken .half.r {
		transform: translate(1.4em, 2.5em) rotate(32deg);
		opacity: 0;
	}
</style>
