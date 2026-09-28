<script lang="ts">
	/**
	 * 처음 사용법 안내 (튜토리얼, Phase 44) — 처음 홈에 오면 한 단계씩: 어디를 누르면 무엇이 되는지 화면의 그 자리를 비춰 주고
	 * (새 대화 찾기 · 익명편지 탭 · 프로필 탭 · 알림 · 설정), 화면에 없는 규칙(시간 · 연장 · 공개 · 고정 · 말풍선 · 매너 온도 · 지킬 것)은 그림 카드로.
	 * 언제든 "건너뛰기". 끝까지 보거나 건너뛰면 이 기기에 "봤음" (lib/tour.svelte.ts), 설정 › 앱 › "사용법 다시 보기"로 다시.
	 * 떠 있는 동안 다른 저절로 뜨는 창(업적 축하 · 매너 평가 · 알림 권한)은 기다린다 (UI.touring).
	 */
	import { page } from '$app/state';
	import { focustrap } from '$lib/focustrap';
	import { backClose } from '$lib/overlay.svelte';
	import { S, UI } from '$lib/state.svelte';
	import { TOUR, autoTourAllowed, markTourSeen, tourSeen } from '$lib/tour.svelte';
	import { gateMin, gateOn, lettersState } from '$lib/letters/gate.svelte';
	import MannerTemp from './MannerTemp.svelte';

	type Art = 'hello' | 'timer' | 'reveal' | 'bubbles' | 'temp' | 'rules';
	type Step = { target?: string; round?: boolean; title: string; body: string; art?: Art };

	const room = $derived(S.settings?.room_minutes ?? 5);
	const extend = $derived(S.settings?.extend_minutes ?? 10);
	const lettersLocked = $derived(gateOn() && lettersState() !== 'open');

	const STEPS = $derived<Step[]>([
		{
			art: 'hello',
			title: 'CNSATINDER에 온 걸 환영해요',
			body: '이름도 학번도 묻지 않는 우리 학교 익명 대화 앱이에요. 어떻게 쓰는지 하나씩 알려 드릴게요.'
		},
		{
			target: '.cta',
			title: '새 대화 찾기',
			body: '누르면 지금 상대를 찾는 학생 중 한 명과 익명으로 이어져요. 화면을 켜 두면 계속 찾아요.'
		},
		{
			art: 'timer',
			title: `첫 대화는 ${room}분`,
			body: `둘 다 대화 화면을 보고 있을 때만 시간이 흘러요. 끝나기 조금 전에 둘 다 원하면 ${extend}분씩 더 이야기할 수 있어요.`
		},
		{
			art: 'reveal',
			title: '연장할 때마다 하나씩',
			body: '연장할 때마다 학년 → 공통 질문 → 디플로마 → 공통 질문 → 동아리 순서로 서로를 조금씩 알게 돼요. 끝까지 가면 둘 다 "고정"해서 시간 제한 없이 이어갈 수 있어요.'
		},
		{
			art: 'bubbles',
			title: '말풍선 다루기',
			body: '길게 누르면 공감 · 답장 · 복사, 두 번 톡 치면 하트, 옆으로 밀면 답장이에요. 대화 목록에서 줄을 길게 누르면 신고 · 차단 · 나가기.'
		},
		{
			art: 'temp',
			title: '매너 온도',
			body: '대화가 끝나면 서로를 익명으로 평가해요. 좋은 대화가 쌓이면 온도가 올라가고, 대화 상대에게 보여요.'
		},
		{
			target: 'a.tab[href="/letters"]',
			title: '익명편지',
			body:
				'학생 이름을 찾아 익명으로 편지를 보내요. 받는 사람에게 나는 성별이나 내가 적은 서명으로만 보여요.' +
				(lettersLocked ? ` 가입한 학생이 ${gateMin()}명 모이면 열려요.` : '')
		},
		{
			target: 'a.tab[href="/me"]',
			title: '프로필과 명성',
			body: '대화 상대에게 보이는 소개 · 관심사 · MBTI를 적어요. 대화하고 편지를 주고받으면 업적이 모이고, 메달을 누르면 얻는 방법이 나와요.'
		},
		{ target: 'button.heart', round: true, title: '알림', body: '새 메시지 · 편지 · 공지가 여기에 모여요.' },
		{
			target: 'button.settings',
			round: true,
			title: '설정',
			body: '화면 · 글자 크기 · 알림 종류를 바꿀 수 있어요. 이 안내도 여기서 다시 볼 수 있어요.'
		},
		{ art: 'rules', title: '이것만 지켜 주세요', body: '' }
	]);

	// ── 언제 띄우나 — 홈에서, 시작하기(온보딩)를 마친 뒤, 이 기기에서 처음(또는 다시 보기) ──
	let open = $state(false);
	let step = $state(0);
	// 홈이 다 그려진 뒤에 살짝 늦게 — 화면을 옮기는 중에 열면 그 이동이 끝나며 뒤로가기 칸(overlay)이 지워져 곧바로 닫힌다
	$effect(() => {
		const onHome = page.url.pathname === '/';
		const ready = !!S.profile?.onboarded && S.me !== null;
		if (!onHome || !ready || open) return;
		const t = setTimeout(() => {
			if (page.url.pathname !== '/') return;
			if (TOUR.replay || (!tourSeen() && autoTourAllowed())) {
				step = 0;
				open = true;
			}
		}, 600);
		return () => clearTimeout(t);
	});
	$effect(() => {
		UI.touring = open;
		return () => (UI.touring = false);
	});

	function finish() {
		open = false;
		markTourSeen();
	}
	// 안드로이드 뒤로가기 = 건너뛰기 (저절로 뜨는 창 — 누른 적이 있는 화면에서만 기록을 쌓는다)
	backClose(finish, { auto: true, open: () => open });

	const cur = $derived(STEPS[step]);
	const last = $derived(step === STEPS.length - 1);
	const next = () => (last ? finish() : (step += 1));
	const prev = () => step > 0 && (step -= 1);

	// ── 비출 자리 — 단계마다 · 화면 크기가 바뀌면 다시 잰다. 자리가 없으면(화면에 안 보임) 가운데 카드로 ──
	let hole = $state<{ x: number; y: number; w: number; h: number; r: number } | null>(null);
	let vh = $state(800);
	function measure() {
		vh = window.innerHeight;
		const sel = STEPS[step]?.target;
		const el = sel ? document.querySelector<HTMLElement>(sel) : null;
		const r = el?.getBoundingClientRect();
		if (!el || !r || r.width === 0 || r.bottom < 0 || r.top > vh) {
			hole = null;
			return;
		}
		const pad = STEPS[step].round ? 2 : 6;
		hole = { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2, r: STEPS[step].round ? 999 : 18 };
	}
	$effect(() => {
		if (!open) return;
		void step;
		const raf = requestAnimationFrame(measure);
		const late = setTimeout(measure, 350); // 탭바 · 버튼이 늦게 자리를 잡는 경우
		window.addEventListener('resize', measure);
		return () => {
			cancelAnimationFrame(raf);
			clearTimeout(late);
			window.removeEventListener('resize', measure);
		};
	});
	// 비춘 자리가 화면 아래쪽이면 카드는 그 위에, 위쪽이면 아래에
	const cardAt = $derived(!hole ? 'center' : hole.y + hole.h / 2 > vh / 2 ? 'above' : 'below');
</script>

{#if open}
	<div class="tour" role="dialog" aria-modal="true" aria-label="사용법 안내" tabindex="-1" use:focustrap>
		<!-- 비추기 — 자리를 뺀 나머지를 어둡게 (자리가 없으면 전체를 어둡게) -->
		<div
			class="hole"
			class:none={!hole}
			style:left="{hole?.x ?? 0}px"
			style:top="{hole?.y ?? 0}px"
			style:width="{hole?.w ?? 0}px"
			style:height="{hole?.h ?? 0}px"
			style:border-radius="{hole?.r ?? 0}px"
			aria-hidden="true"
		></div>

		<div
			class="card {cardAt}"
			style:top={cardAt === 'below' && hole ? `${hole.y + hole.h + 14}px` : null}
			style:bottom={cardAt === 'above' && hole ? `${vh - hole.y + 14}px` : null}
		>
			{#key step}
				<div class="inner">
					{#if cur.art}
						<div class="art art-{cur.art}" aria-hidden="true">
							{#if cur.art === 'hello'}
								<img src="/icon-192.png" alt="" width="72" height="72" />
							{:else if cur.art === 'timer'}
								<svg viewBox="0 0 100 100" class="ring">
									<circle cx="50" cy="50" r="42" class="track" />
									<circle cx="50" cy="50" r="42" class="fill" pathLength="100" />
								</svg>
								<span class="ring-text"><b class="num">{room}</b>분<small class="num">+{extend}분씩</small></span>
							{:else if cur.art === 'reveal'}
								<ol class="path">
									{#each ['학년', '질문', '디플로마', '질문', '동아리'] as t, i (i)}<li style:--i={i}>{t}</li>{/each}
									<li class="pin" style:--i={5}>고정</li>
								</ol>
							{:else if cur.art === 'bubbles'}
								<div class="mini">
									<span class="b them">오늘 급식 뭐였어?</span>
									<span class="b me">카레! <i class="heart">♥</i></span>
									<span class="finger"></span>
								</div>
							{:else if cur.art === 'temp'}
								<div class="temp-art"><MannerTemp temp={42.3} /></div>
							{:else if cur.art === 'rules'}
								<ul class="rules">
									<li><span>🙊</span>이름 · 학번 · 반 · SNS는 <b>묻지도, 말하지도 않기</b></li>
									<li><span>🤝</span>상대가 불편할 말은 하지 않기</li>
									<li><span>🚨</span>불쾌한 일이 있으면 <b>바로 신고하기</b></li>
								</ul>
							{/if}
						</div>
					{/if}
					<h2>{cur.title}</h2>
					{#if cur.body}<p>{cur.body}</p>{/if}
				</div>
			{/key}

			<div class="dots" aria-label="{STEPS.length}단계 중 {step + 1}단계">
				{#each STEPS as _, i (i)}<i class:on={i === step} class:past={i < step}></i>{/each}
			</div>
			<div class="foot">
				<!-- 건너뛰기는 카드 안에 — 화면 위쪽(알림 · 설정)을 비출 때 가리지 않게 -->
				{#if !last}<button class="skip u-tap" onclick={finish}>건너뛰기</button>{:else}<span></span>{/if}
				<div class="btns">
					{#if step > 0}<button class="prev u-tap" onclick={prev}>이전</button>{/if}
					<button class="btn next" onclick={next}>{last ? '시작하기' : step === 0 ? '알려 주세요' : '다음'}</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.tour {
		position: fixed;
		inset: 0;
		z-index: 90;
		outline: none;
	}
	/* 비추는 구멍 — 둘레를 크게 어둡게 칠해서 구멍만 밝게 남긴다. 단계를 넘기면 구멍이 미끄러져 옮겨 간다 */
	.hole {
		position: fixed;
		box-shadow:
			0 0 0 3px color-mix(in srgb, #fff 85%, transparent),
			0 0 0 200vmax rgb(12 6 9 / 0.66);
		transition:
			left 0.38s cubic-bezier(0.3, 0.8, 0.25, 1),
			top 0.38s cubic-bezier(0.3, 0.8, 0.25, 1),
			width 0.38s cubic-bezier(0.3, 0.8, 0.25, 1),
			height 0.38s cubic-bezier(0.3, 0.8, 0.25, 1),
			border-radius 0.38s;
		pointer-events: none;
		animation: hole-in 0.3s ease-out;
	}
	.hole.none {
		left: 50% !important;
		top: 50% !important;
		width: 0 !important;
		height: 0 !important;
		box-shadow: 0 0 0 200vmax rgb(12 6 9 / 0.66);
	}
	@keyframes hole-in {
		from {
			opacity: 0;
		}
	}
	.skip {
		min-height: 44px;
		margin-left: -8px;
		padding: 0 8px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}
	.card {
		position: fixed;
		left: 50%;
		width: min(360px, calc(100vw - 32px));
		translate: -50% 0;
		padding: 20px 20px 16px;
		border-radius: 26px;
		background: var(--surface);
		box-shadow: var(--shadow-2);
		transition:
			top 0.38s cubic-bezier(0.3, 0.8, 0.25, 1),
			bottom 0.38s cubic-bezier(0.3, 0.8, 0.25, 1);
	}
	.card.center {
		top: 50%;
		translate: -50% -50%;
	}
	.inner {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		text-align: center;
		animation: step-in 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	@keyframes step-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	h2 {
		margin: 0;
		font-size: 19px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}
	p {
		margin: 0;
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-2);
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 12px;
	}
	.dots {
		display: flex;
		justify-content: center;
		gap: 4px;
		margin-top: 16px;
	}
	.dots i {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--line);
		transition:
			width 0.25s,
			background 0.25s;
	}
	.dots i.past {
		background: color-mix(in srgb, var(--accent) 45%, var(--line));
	}
	.dots i.on {
		width: 18px;
		background: var(--accent);
	}
	.btns {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.prev {
		min-height: 44px;
		padding: 0 12px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}
	.next {
		width: auto;
		height: 46px;
		padding: 0 20px;
		font-size: 15px;
	}

	/* ── 그림 ── */
	.art {
		display: grid;
		place-items: center;
		min-height: 96px;
		margin-bottom: 6px;
	}
	.art-hello img {
		border-radius: 20px;
		box-shadow: var(--glow);
		animation: pop 0.6s cubic-bezier(0.3, 1.5, 0.5, 1);
	}
	@keyframes pop {
		from {
			transform: scale(0.6);
			opacity: 0;
		}
	}
	/* 시간 — 줄어드는 고리 */
	.art-timer {
		position: relative;
		width: 104px;
		height: 104px;
	}
	.ring {
		position: absolute;
		inset: 0;
		rotate: -90deg;
	}
	.ring circle {
		fill: none;
		stroke-width: 8;
		stroke-linecap: round;
	}
	.ring .track {
		stroke: var(--field);
	}
	.ring .fill {
		stroke: var(--g-coral);
		stroke-dasharray: 100;
		animation: drain 3.2s ease-in-out infinite alternate;
	}
	@keyframes drain {
		from {
			stroke-dashoffset: 0;
		}
		to {
			stroke-dashoffset: 72;
		}
	}
	.ring-text {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1;
		font-weight: 800;
	}
	.ring-text b {
		font-family: var(--display);
		font-size: 34px;
		font-weight: 400;
		background: var(--brand);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.ring-text small {
		margin-top: 4px;
		font-size: 11px;
		color: var(--text-2);
	}
	/* 공개 순서 — 칩이 하나씩 켜진다 */
	.path {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 6px;
		max-width: 300px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.path li {
		padding: 6px 11px;
		border-radius: 999px;
		background: var(--field);
		font-size: 13px;
		font-weight: 700;
		animation: chip 0.4s calc(var(--i) * 0.18s) both cubic-bezier(0.3, 1.4, 0.5, 1);
	}
	.path li.pin {
		background: var(--accent-fill-deep);
		color: var(--on-accent);
	}
	@keyframes chip {
		from {
			opacity: 0;
			transform: scale(0.7);
		}
	}
	/* 말풍선 — 내 말풍선에 하트가 톡 */
	.mini {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 220px;
	}
	.mini .b {
		max-width: 80%;
		padding: 8px 13px;
		border-radius: 18px;
		font-size: 14px;
	}
	.mini .them {
		align-self: flex-start;
		background: var(--field);
	}
	.mini .me {
		position: relative;
		align-self: flex-end;
		background: var(--bubble-fill);
		color: var(--on-accent);
	}
	.heart {
		position: absolute;
		left: -8px;
		bottom: -8px;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--surface);
		box-shadow: var(--shadow-1);
		color: #ff3040;
		font-size: 12px;
		font-style: normal;
		animation: heart 2.4s 0.6s infinite;
	}
	@keyframes heart {
		0%,
		20% {
			transform: scale(0);
		}
		30% {
			transform: scale(1.3);
		}
		40%,
		100% {
			transform: scale(1);
		}
	}
	.finger {
		position: absolute;
		right: 22px;
		bottom: -2px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: rgb(0 0 0 / 0.18);
		box-shadow: 0 0 0 6px rgb(0 0 0 / 0.06);
		animation: tap 2.4s infinite;
	}
	@keyframes tap {
		0%,
		100% {
			transform: scale(1);
			opacity: 0;
		}
		8%,
		22% {
			opacity: 1;
		}
		12% {
			transform: scale(0.8);
		}
		18% {
			transform: scale(1);
		}
		26% {
			transform: scale(0.8);
			opacity: 1;
		}
		34% {
			opacity: 0;
		}
	}
	.temp-art {
		width: 240px;
	}
	.rules {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
		text-align: left;
	}
	.rules li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 14px;
		background: var(--field);
		font-size: 14px;
		line-height: 1.45;
	}
	.rules span {
		font-size: 18px;
	}
</style>
