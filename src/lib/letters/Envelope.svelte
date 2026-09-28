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
	 *   뒷면(back) : 안감 · 편지지 · 양옆/아래 주머니(접힌 선 · 그늘) · 덮개(그림자) · 밀랍 봉인(학교 로고 양각, 덮개 끝에 붙음) · 가장자리 줄무늬
	 * 받은 편지는 보낸 사람의 성별로 테두리 색이 다르다 (border — 여학생 붉은색, 남학생 푸른색).
	 * 크기는 w 하나로 — 안쪽은 전부 em (1em = w / 20) 이라 목록의 작은 봉투와 연출의 큰 봉투가 같은 모양이다.
	 * 움직임은 부모가 상태(side · sealed · stamping · cracked · open · paper)를 바꾸면 CSS 전환으로. 동작 줄이기면 app.css 가 전환을 끈다.
	 *   stamping: 밀랍이 떨어지고 → 놋쇠 도장이 화면 앞에서 내려와 쿵 찍고(밀랍이 눌려 퍼짐 · 충격 파문 · 봉투가 눌림) → 들린다 (1.2s, Phase 40)
	 *   cracked : 봉인이 부르르 떨며 덮개 선을 따라 금이 가고 부스러기가 떨어진다 → open 이면 봉인이 덮개에 붙은 채 함께 들린다 (Phase 40 —
	 *             예전의 "두 쪽으로 갈라져 날아가기"를 대신한다)
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
		cracked = false,
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
		/** 봉인에 금이 감 (봉투를 여는 중) */
		cracked?: boolean;
		open?: boolean;
		paper?: PaperPos;
		postmark?: string;
		glow?: boolean;
		sticker?: string;
		/** 봉인이 막 찍히는 중 — 도장이 내려와 쿵 찍는 움직임 (1.2s) */
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

<div class="env b-{border}" class:show-back={side === 'back'} class:glow class:thud={stamping} style:--w="{w}px" aria-hidden="true">
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
			<!-- 밀랍 봉인 — 덮개 끝에 붙어 있다. 열면 금이 간 채로 덮개와 함께 들린다 (Phase 40) -->
			{#if sealed}
				<div class="seal" class:cracked class:stamping>
					<div class="wax">
						<svg viewBox="0 0 40 44">
							<defs>
								<radialGradient id="wax-{uid}" cx="36%" cy="30%" r="75%">
									<stop offset="0" stop-color="#e2455f" />
									<stop offset=".45" stop-color="#b8142f" />
									<stop offset="1" stop-color="#6d0718" />
								</radialGradient>
								<radialGradient id="pool-{uid}" cx="50%" cy="50%" r="50%">
									<stop offset=".7" stop-color="#000" stop-opacity="0" />
									<stop offset="1" stop-color="#000" stop-opacity=".28" />
								</radialGradient>
							</defs>
							<path d={WAX} fill="url(#wax-{uid})" />
							<!-- 눌러 찍은 자리 — 가운데가 살짝 꺼지고 테두리가 솟는다 (찍히는 순간 나타난다) -->
							<g class="emboss">
								<circle cx="20" cy="20.5" r="11.8" fill="url(#pool-{uid})" />
								<circle cx="20" cy="20.5" r="11.8" fill="none" stroke="rgb(255 190 200 / .35)" stroke-width=".7" />
								<circle cx="20" cy="20.5" r="10.4" fill="none" stroke="rgb(70 0 12 / .35)" stroke-width=".6" />
								<!-- 학교 로고 양각: 밝은 윤곽을 살짝 위에, 어두운 면을 그 위에 -->
								<g transform="translate(13.2 12.6) scale(.068)">
									<path d={LOGO_PATH} fill="rgb(255 200 208 / .45)" transform="translate(-10 -12)" />
									<path d={LOGO_PATH} fill="rgb(92 0 18 / .6)" />
								</g>
							</g>
							<!-- 빛 반사 -->
							<ellipse cx="14" cy="10" rx="5" ry="2.4" fill="#fff" opacity=".28" transform="rotate(-24 14 10)" />
							<!-- 덮개 선을 따라 가는 금 — 봉투를 열 때 그어진다 -->
							<g class="crack" fill="none" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3.5 21.6l4.6-1.4 3.1 2.2 4.4-2.6 3.6 1.9 3.9-1.7 3.4 2.3 4.2-2 3.6 1.3 3.2-.8" pathLength="1" stroke="rgb(255 185 195 / .45)" stroke-width="1.1" transform="translate(0 .7)" />
								<path d="M3.5 21.6l4.6-1.4 3.1 2.2 4.4-2.6 3.6 1.9 3.9-1.7 3.4 2.3 4.2-2 3.6 1.3 3.2-.8" pathLength="1" stroke="#3a0310" stroke-width=".9" />
							</g>
						</svg>
					</div>
					<!-- 금이 갈 때 떨어지는 밀랍 부스러기 -->
					<i class="crumb c1"></i><i class="crumb c2"></i><i class="crumb c3"></i>
					{#if stamping}
						<!-- 봉인 도장 — 위(화면 앞)에서 내려와 쿵 찍고 들린다. 그림자가 가까워질수록 작고 진해진다 -->
						<i class="shock"></i>
						<i class="stamp-shadow"></i>
						<svg class="stamper" viewBox="0 0 40 40">
							<defs>
								<radialGradient id="brass-{uid}" cx="34%" cy="28%" r="78%">
									<stop offset="0" stop-color="#fff3c4" />
									<stop offset=".3" stop-color="#e6bb5c" />
									<stop offset=".72" stop-color="#a8752a" />
									<stop offset="1" stop-color="#5f3f10" />
								</radialGradient>
								<radialGradient id="wood-{uid}" cx="38%" cy="32%" r="72%">
									<stop offset="0" stop-color="#b98356" />
									<stop offset=".55" stop-color="#6e3f22" />
									<stop offset="1" stop-color="#3a1f0d" />
								</radialGradient>
							</defs>
							<circle cx="20" cy="20" r="19.4" fill="url(#brass-{uid})" />
							<circle cx="20" cy="20" r="16.2" fill="none" stroke="rgb(80 50 8 / .5)" stroke-width=".8" />
							<circle cx="20" cy="20" r="12.6" fill="url(#wood-{uid})" />
							<ellipse cx="15.6" cy="13.8" rx="4.6" ry="2.5" fill="#fff" opacity=".32" transform="rotate(-32 15.6 13.8)" />
						</svg>
					{/if}
				</div>
			{/if}
		</div>
		<i class="edge"></i>
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
	/* ── 밀랍 봉인 — 덮개 끝(뾰족한 곳)에 붙어 있다. 덮개가 열리면 함께 들리고, 반쯤 넘어가면 덮개 뒤로 사라진다 ── */
	.seal {
		position: absolute;
		left: 50%;
		top: 100%;
		width: 3.2em;
		height: 3.52em;
		margin: -2em 0 0 -1.6em;
		filter: drop-shadow(0 0.1em 0.12em rgb(70 0 15 / 0.4));
		transition:
			transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
			opacity 0s;
	}
	.back.open .seal {
		opacity: 0;
		transition-delay: 0s, 0.33s;
	}
	.wax {
		position: absolute;
		inset: 0;
		/* 밀랍 동그라미의 가운데 (viewBox 40×44 에서 20, 20.5) */
		transform-origin: 50% 46.6%;
	}
	.wax svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* 찍기 (1.2s) — 0~20% 녹은 밀랍이 떨어져 퍼지고 · 30% 도장이 다가와 · 37% 살짝 들었다가 · 45% 쿵 · 60% 누른 채 · 85% 들려 사라진다 */
	.seal.stamping .wax {
		animation: pour 1.2s both;
	}
	@keyframes pour {
		0% {
			transform: scale(0.25);
			opacity: 0;
			animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1.2);
		}
		8% {
			opacity: 1;
		}
		22%,
		44% {
			transform: scale(0.74);
		}
		/* 도장에 눌려 옆으로 퍼진다 */
		47% {
			transform: scale(1.16, 0.9);
			animation-timing-function: cubic-bezier(0.3, 0, 0.3, 1);
		}
		58% {
			transform: scale(0.96, 1.04);
		}
		66% {
			transform: scale(1.02, 0.99);
		}
		76%,
		100% {
			transform: none;
		}
	}
	/* 로고 양각은 찍힌 순간부터 */
	.seal.stamping .emboss {
		animation: emboss 1.2s both;
	}
	@keyframes emboss {
		0%,
		45% {
			opacity: 0;
		}
		47%,
		100% {
			opacity: 1;
		}
	}
	/* 놋쇠 도장 (위에서 내려다본 모습 — 손잡이 나무 · 놋쇠 테) */
	.stamper,
	.stamp-shadow,
	.shock {
		position: absolute;
		left: 50%;
		top: 46.6%;
		border-radius: 50%;
		pointer-events: none;
	}
	.stamper {
		/* 머리는 양각 자리(로고 둘레)만큼 — 밀랍이 도장 둘레로 밀려 나오는 게 보이게 */
		width: 2.3em;
		height: 2.3em;
		margin: -1.15em 0 0 -1.15em;
		opacity: 0;
		animation: stamper 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	@keyframes stamper {
		0%,
		10% {
			transform: translate(0.5em, -1.2em) scale(2.6);
			opacity: 0;
		}
		30% {
			transform: translate(0.1em, -0.25em) scale(1.45);
			opacity: 1;
			animation-timing-function: ease-in-out;
		}
		/* 치기 전에 살짝 들어 올린다 (예비 동작) */
		37% {
			transform: translate(0.14em, -0.32em) scale(1.62);
			animation-timing-function: cubic-bezier(0.6, 0, 1, 0.5);
		}
		/* 쿵 */
		45% {
			transform: none;
			opacity: 1;
			animation-timing-function: ease-out;
		}
		50% {
			transform: scale(0.96);
		}
		62% {
			transform: scale(0.97);
			opacity: 1;
			animation-timing-function: cubic-bezier(0.4, 0, 0.8, 0.5);
		}
		86%,
		100% {
			transform: translate(-0.2em, -0.9em) scale(1.9);
			opacity: 0;
		}
	}
	/* 도장 그림자 — 멀면 크고 흐리고 비껴 있고, 닿으면 작고 진하다 */
	.stamp-shadow {
		width: 2.3em;
		height: 2.3em;
		margin: -1.15em 0 0 -1.15em;
		background: radial-gradient(closest-side, rgb(40 5 10 / 0.6), rgb(40 5 10 / 0.25) 70%, transparent);
		opacity: 0;
		animation: stamp-shadow 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	@keyframes stamp-shadow {
		0%,
		10% {
			transform: translate(1.6em, 2em) scale(1.9);
			opacity: 0;
		}
		30% {
			transform: translate(0.6em, 0.8em) scale(1.3);
			opacity: 0.35;
			animation-timing-function: ease-in-out;
		}
		37% {
			transform: translate(0.75em, 1em) scale(1.4);
			opacity: 0.3;
			animation-timing-function: cubic-bezier(0.6, 0, 1, 0.5);
		}
		45%,
		62% {
			transform: translate(0.06em, 0.1em) scale(1.06);
			opacity: 0.7;
			animation-timing-function: cubic-bezier(0.4, 0, 0.8, 0.5);
		}
		86%,
		100% {
			transform: translate(1.4em, 1.8em) scale(1.8);
			opacity: 0;
		}
	}
	/* 충격 파문 — 쿵 하는 순간 밀랍 둘레로 퍼진다 */
	.shock {
		width: 3em;
		height: 3em;
		margin: -1.5em 0 0 -1.5em;
		border: 0.1em solid rgb(184 20 47 / 0.55);
		box-shadow: 0 0 0.3em rgb(255 255 255 / 0.5) inset;
		opacity: 0;
		animation: shock 1.2s cubic-bezier(0.1, 0.7, 0.3, 1) both;
	}
	@keyframes shock {
		0%,
		45% {
			transform: scale(0.75);
			opacity: 0;
		}
		47% {
			opacity: 0.9;
		}
		78%,
		100% {
			transform: scale(2.1);
			opacity: 0;
		}
	}
	/* 쿵 — 봉투 전체가 한 번 눌렸다 돌아온다 (뒤집기 transform 과 겹치지 않게 scale · translate 속성으로) */
	.env.thud {
		animation: thud 1.2s both;
	}
	@keyframes thud {
		0%,
		44.5% {
			scale: 1;
			translate: 0 0;
		}
		47.5% {
			scale: 0.972;
			translate: 0 0.14em;
			animation-timing-function: cubic-bezier(0.3, 0, 0.3, 1.4);
		}
		62%,
		100% {
			scale: 1;
			translate: 0 0;
		}
	}

	/* 열기 — 봉인이 부르르 떨고, 덮개 선을 따라 금이 가고, 부스러기가 떨어진다. 그다음 덮개와 함께 들린다 */
	.crack path {
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
	}
	.seal.cracked .crack path {
		animation: crack 0.32s 0.16s cubic-bezier(0.5, 0, 0.2, 1) forwards;
	}
	@keyframes crack {
		to {
			stroke-dashoffset: 0;
		}
	}
	.seal.cracked .wax {
		animation: tremble 0.42s ease-in-out;
	}
	@keyframes tremble {
		20% {
			transform: rotate(-4deg) scale(1.02);
		}
		40% {
			transform: rotate(3.5deg);
		}
		60% {
			transform: rotate(-2deg);
		}
		80% {
			transform: rotate(1deg);
		}
	}
	/* 떨어진 뒤에는 살짝 들떠 있다 (그늘이 조금 깊어진다) */
	.seal.cracked {
		transform: translateY(-0.05em) scale(1.03);
		transition-delay: 0.45s, 0s;
	}
	.back.open .seal.cracked {
		transition-delay: 0s, 0.33s;
	}
	.crumb {
		position: absolute;
		width: 0.34em;
		height: 0.28em;
		background: radial-gradient(circle at 35% 30%, #e0465e, #8a0c20 70%);
		clip-path: polygon(10% 20%, 60% 0, 100% 45%, 75% 100%, 20% 85%, 0 50%);
		opacity: 0;
	}
	.c1 {
		left: 10%;
		top: 46%;
		--dx: -0.7em;
		--dy: 1.3em;
		--r: -140deg;
	}
	.c2 {
		left: 80%;
		top: 49%;
		--dx: 0.8em;
		--dy: 1.1em;
		--r: 160deg;
	}
	.c3 {
		left: 58%;
		top: 52%;
		width: 0.24em;
		height: 0.2em;
		--dx: 0.25em;
		--dy: 1.5em;
		--r: 90deg;
	}
	.seal.cracked .crumb {
		animation: crumb 0.5s 0.3s cubic-bezier(0.35, 0, 0.8, 0.6) both;
	}
	/* 톡 튀었다가 떨어진다 */
	@keyframes crumb {
		0% {
			opacity: 1;
			transform: none;
		}
		30% {
			opacity: 1;
			transform: translate(calc(var(--dx) * 0.35), -0.3em) rotate(calc(var(--r) * 0.3));
		}
		100% {
			opacity: 0;
			transform: translate(var(--dx), var(--dy)) rotate(var(--r));
		}
	}
</style>
