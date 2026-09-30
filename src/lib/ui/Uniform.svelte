<script lang="ts" module>
	/** 깃에 다는 배지 칸 — 대표 업적 수와 같다 (학교 실제 배지가 늘면 여기서) */
	export const LAPEL_SLOTS = 3;
</script>

<script lang="ts">
	/**
	 * 교복 (Phase 60) — 우리 학교 교복 가슴을 가까이 본 그림. 대표 업적은 깃에 단 배지로, 가슴 주머니 위엔 교표.
	 * 깃은 그림 아래로 이어질 만큼 크게 (배지 3개가 다 깃 안에), 가슴 주머니는 수평으로 교표 바로 위에 (Phase 61).
	 * Phase 62 — 몸통을 왼쪽으로(오른쪽 끝에 소매 솔기), 깃 · 칼라를 곡선으로, 천 주름 · 깃이 말리는 그늘,
	 * 숨 쉬듯 아주 살짝 움직이고 넥타이 · 리본 꼬리가 흔들린다 (동작 줄이기면 멈춤). 배지는 손으로 꽂은 듯 조금씩 기울게.
	 * 넥타이는 매듭(머리) · 매듭 아래 보조개 · 날의 둥근 그늘, 매듭은 천이 감겨 줄무늬 방향이 날과 반대.
	 * 리본은 고리 두 개(안쪽 그늘 · 접힌 주름) · 가운데 매듭 · 제비꼬리로 자른 꼬리 두 개.
	 * Phase 63 — 앞섶(깃 안쪽 가장자리)을 곧은 선 대신 S 곡선으로, 천 두께(둥근 가장자리 빛 · 윤곽 · 손바느질),
	 * 깃이 조끼 · 셔츠 위로 떠서 드리운 그림자, 깃이 말려 넘어가는 빛 띠, 왼쪽은 몸이 돌아 들어가며 어둡고 부드러운 주름.
	 * Phase 64 — 사진처럼 조끼 V넥을 셔츠 칼라 끝 바로 아래로 올려(넓고 얕게, 남색 단) 매듭과 날 윗부분만 보이게.
	 * 스케치대로 넥타이가 왼쪽 끝에 오도록 몸 가운데만 왼쪽으로 — 오른쪽 깃 · 배지 · 주머니 · 교표 자리는 그대로, 왼쪽 깃은 그림 밖.
	 * Phase 65 — 조끼 목둘레는 뾰족한 V 대신 아래가 둥근 V, 넥타이 머리 · 날과 리본(머리 포함)을 큼직하게.
	 * 실제로 입은 순서대로 겹친다: 셔츠 → 넥타이 · 리본 꼬리 → 셔츠 칼라 → 조끼(넥타이 날 · 리본 꼬리는 조끼 속으로) → 리본 매듭 → 재킷.
	 * 칼라 끝은 조끼 목둘레보다 위에, 리본 · 넥타이는 재킷 앞섶에 닿지 않게, 칼라 바깥은 재킷 깃 밑으로.
	 * Phase 66 — 넥타이 · 리본을 1.5배 더(칼라도 넓게 펼쳐 매듭이 다 보이게), 넥타이 머리는 모서리가 둥근 다이아몬드꼴,
	 * 조끼 목둘레를 더 위로. 리본은 앞섶 사이보다 넓어 고리 끝이 재킷 깃 밑으로 들어간다 (입었을 때처럼 — 재킷 위로 올라오지 않는다).
	 * Phase 67 — 리본은 1.5배로 키우자 고리가 잘리고 매듭 · 꼬리만 남아 넥타이처럼 보여서 되돌림.
	 * 조끼 목둘레는 끝만 살짝 둥근 V 로 더 뾰족하게, 재킷 깃(앞섶 · 솔기)은 곡선을 줄여 곧고 조금 각지게.
	 * Phase 68 — 넥타이 · 리본 · 셔츠 카라를 처음부터 다시, 하나의 비례로. 키우기만 하던 것을 그만두고 카라 벌어짐(뾰족한 두 끝 사이)을 기준으로:
	 * 매듭 너비 ≈ 벌어짐의 1/2, 리본 너비 ≈ 2/3 (리본은 프레임 안에 통째로), 카라 끝은 매듭 · 리본 머리 아래로 조금 내려온다.
	 * 카라: 목에서 앞으로 꺾여 내려오는 뾰족한 잎(끝 60 도쯤) · 두 겹 끝단의 두께와 윗땀 · 꺾임 능선 · 위(목 쪽)는 그늘 · 잎이 셔츠 · 매듭 위에 드리우는
	 * 두 겹 그림자(붙은 진한 것 + 번지는 것) · 흰 셔츠 천 결. 잎이 매듭 어깨를 덮고, 리본 날개는 카라 위에 얹힌다.
	 * 넥타이: 머리는 위가 넓고 아래로 좁아지는 깔때기 앞판(줄무늬 방향이 옆 판과 반대) + 옆 판 · 접힌 선 · 치마 · 날 위 그림자 · 보조개, 날은 아래로 넓어지며 조끼 속으로.
	 * 리본: 가운데 조인 띠 · 위 면은 빛 · 아래 면은 접혀 그늘인 두 날개(안쪽은 모아 잡은 주름) · 바깥으로 벌어지는 제비꼬리 두 개(끝이 조끼 목둘레 단 바로 위)
	 * · 꼬리 사이로 셔츠 여밈 단추. 목 둘레 모양은 모두 목 가운데를 0 으로 둔 좌표 (translate(C 0)).
	 * Phase 69 — 리본 꼬리를 굵게(폭 약 1.35배) · 길게 — 조끼보다 나중에 그려 조끼 목둘레 단을 넘어 조끼 위로 늘어진다 (조끼 밖).
	 *   neck — 넥타이(남학생 · 상대 프로필) / 리본(여학생)
	 *   badges — 깃에 위에서부터 (최대 LAPEL_SLOTS)
	 *   emptyHref — 있으면 빈 칸을 점선 동그라미 "+" 로 (내 프로필 → 업적 화면)
	 *   onplace — 있으면 배지를 꾹 눌러 다른 칸으로 끌어 옮긴다 (Phase 69, lib/ui/badgeDrag). 빈 칸도 점선 동그라미로 보이고
	 *             밖에서 끌어 온 메달(업적 목록)도 받는다 — 칸마다 data-drop-slot. 옮긴 결과는 onplace(배지 코드, 칸 번호)
	 * 교복 색은 라이트 · 다크 모두 같다 (진짜 교복 색). 교표 그림: static/school-crest.png (scripts/generate-crest.mjs)
	 */
	import Badge from './Badge.svelte';
	import { badgeDrag } from './badgeDrag';
	import type { BadgeLite } from '$lib/achievements';

	let {
		neck = 'tie',
		badges = [],
		onpick,
		emptyHref,
		onplace
	}: {
		neck?: 'tie' | 'ribbon';
		badges?: BadgeLite[];
		onpick?: (b: BadgeLite) => void;
		emptyHref?: string;
		onplace?: (code: string, slot: number) => void;
	} = $props();
	let root: HTMLDivElement | undefined = $state();

	const uid = $props.id();
	const W = 360;
	const H = 280;
	/** 몸 가운데 (넥타이 · 셔츠 칼라 · 조끼 목둘레) — 스케치대로 넥타이가 왼쪽 끝에 오게 (Phase 64 · 66) */
	const C = 46;
	/** 목 둘레를 조금 아래로 — 그림 위 가장자리에 매듭 윗변이 잘리지 않게 */
	const NECK_Y = 6;
	/** 오른쪽 깃의 기준 — 깃 · 배지 · 주머니 · 교표 자리는 그대로 두고 몸 가운데만 왼쪽으로 (앞섶 사이가 넓어져 조끼가 넓게 보인다) */
	const LC = 72;
	/** 가슴 주머니 · 교표의 가운데 x — 깃 바깥 선과 소매 솔기 사이 */
	const PX = 285;
	/** 몸 가운데에서 s 쪽(1 = 보는 사람 기준 오른쪽, -1 = 왼쪽)으로 dx */
	const X = (s: number, dx: number) => C + s * dx;
	/** 오른쪽 깃 기준에서 dx */
	const R = (dx: number) => LC + dx;

	// 앞섶(깃 안쪽 가장자리) — 목 옆에서 단추 쪽으로 거의 곧게 (Phase 63 의 S 곡선을 Phase 67 에서 곧게)
	const FRONT = [
		[48, 0],
		[44, 30],
		[36.5, 72],
		[31, 110],
		[25, 150],
		[14.5, 220],
		[3, 300]
	];
	/** 앞섶 선 — dx 만큼 깃 쪽(+) · 가운데 쪽(-)으로 옮겨서 (두께 · 그림자 · 손바느질) */
	const front = (dx = 0, dy = 0) => {
		const p = FRONT.map(([x, y]) => `${R(x + dx)} ${y + dy}`);
		return `M${p[0]}C${p[1]} ${p[2]} ${p[3]}C${p[4]} ${p[5]} ${p[6]}`;
	};
	/** 깃 바깥쪽 윤곽 (앞섶을 뺀 나머지) — 아래 → 바깥 선(살짝 배가 부른 곡선) → 깃 끝 → 노치 → 칼라 → 목 뒤 */
	const lapelOuter = `M${R(58)} 300C${R(100)} 230 ${R(150)} 150 ${R(176)} 100L${R(152)} 84L${R(164)} 66C${R(140)} 40 ${R(118)} 16 ${R(100)} 0`;
	/** 오른쪽 깃 (보는 사람 기준) — 왼쪽 깃은 그림 밖 */
	const lapel = `${front()}L${lapelOuter.slice(1)}Z`;
	const lapelEdge = (inset = 0) =>
		`M${R(58 - inset)} 300C${R(100 - inset)} 230 ${R(150 - inset)} 150 ${R(176 - inset)} ${100 + inset * 0.4}`;
	/** 깃과 칼라가 만나는 솔기 (노치에서 목 쪽으로) */
	const gorge = `M${R(152)} 84C${R(130)} 69 ${R(100)} 47.5 ${R(64)} 24`;
	/** 셔츠가 보이는 곳 — 그림 왼쪽 끝에서 깃 앞섶까지 */
	const shirt = `M-20 -20H${R(FRONT[0][0])}V0${front().slice(front().indexOf('C'))}L-20 300Z`;
	// 조끼 목둘레 (사진) — 셔츠 칼라 끝 조금 아래를 지나 넓게, 팔은 곧고 끝만 살짝 둥근 V.
	// 칼라 끝 · 바깥 선보다 늘 아래라 칼라를 가리지 않는다. 왼쪽 팔은 그림 밖에서, 오른쪽 팔은 깃 밑으로
	const vLine =
		`M${X(-1, 104)} -10L${X(-1, 100)} 6C${X(-1, 86)} 44 ${X(-1, 70)} 72 ${X(-1, 56)} 80.5L${X(-1, 14)} 104.6C${X(-1, 9)} 107.5 ${X(-1, 4)} 109.5 ${C} 110` +
		`C${X(1, 4)} 109.5 ${X(1, 9)} 107.5 ${X(1, 14)} 104.6L${X(1, 56)} 80.5C${X(1, 70)} 72 ${X(1, 86)} 44 ${X(1, 100)} 6L${X(1, 104)} -10`;
	/** 조끼 몸판 — 오른쪽 팔 끝에서 곧장 깃 밑(앞섶과 깃 바깥 선 사이)으로 내려가 닫는다 (접히는 곳 없이) */
	const vest = `${vLine}L${R(30)} 300H-40V-10Z`;
	// ── 목 둘레 (Phase 68 — 카라 · 넥타이 · 리본을 한 비례로 처음부터 다시) ─────────────────────────────
	// 아래 모양은 모두 "목 가운데" 를 0 으로 둔 좌표 (그릴 때 translate(C 0)). 카라 벌어짐(뾰족한 끝 사이)이 기준:
	// 매듭 너비 ≈ 벌어짐의 절반, 리본 너비 ≈ 벌어짐의 2/3, 카라 끝은 매듭 · 리본 머리 아래로 조금 내려온다.
	/** 카라 잎 (오른쪽 — 왼쪽은 거울) — 목 옆에서 앞으로 내려와 끝이 뾰족한 삼각형. 바깥 아래 선은 재킷 깃 밑으로 */
	const leaf = 'M9 -14C14 6 32 40 47 62C54 54 66 38 92 6L106 -14Z';
	/** 카라 잎 안쪽(앞) 끝단 — 두 겹 두께 띠 · 윗땀 */
	const leafEdge = 'M9 -14C14 6 32 40 47 62';
	const leafStitchIn = 'M12.6 -8C18 9 33.5 38 45.4 57.6';
	const leafStitchOut = 'M46.4 58.4C53 50.6 64 35.6 89 6.6';
	/** 카라 꺾임(접힌 선) — 잎이 목에서 앞으로 꺾여 내려오는 곳의 부드러운 능선 */
	const leafFold = 'M13 3C33 9.5 58 6 92 -5';

	// 넥타이 — 머리(매듭): 윗변은 카라 밑에 숨고, 어깨가 넓다가 아래로 좁아지는 사다리꼴 · 아래 끝은 완만한 치마 곡선
	const knot = 'M-13 -4C-16 3-21.5 11-23.5 20C-25.5 29-23 39-14 45C-8 47.6 8 47.6 14 45C23 39 25.5 29 23.5 20C21.5 11 16 3 13 -4Z';
	/** 머리 앞면 — 넓은 쪽 천이 감긴 가운데 판 (양옆 판과 줄무늬 방향이 다르다) */
	const knotFront = 'M-13 -4C-12 14-9 32-5.5 47L5.5 47C9 32 12 14 13 -4Z';
	/** 날 — 머리 아래에서 좁게 나와 아래로 넓어진다. 끝은 조끼 속 */
	const blade = 'M-12.5 26C-12.5 60-16 96-22 130L-27 152L27 152L22 130C16 96 12.5 60 12.5 26Z';
	/** 머리 바로 아래 오목한 보조개 */
	const dimple = 'M-2.2 48C-1.6 56-0.6 63 1 70C1.6 63 2.4 55 3 48Z';

	// 리본 — 가운데 머리 하나 · 양옆 날개(고리) · 아래로 늘어진 제비꼬리 두 개. 목 가운데(0, 20) 기준
	const wing = 'M6 14.5C13 10.5 19 5 27 3.5C31 2.8 34.5 4 35 8.5C36 15 36 24 35 30.5C34.5 35 31 37 27 36.5C19 35.5 13 29.5 6 25.5Z';
	/** 날개를 위 · 아래로 접는 가운데 주름 */
	const wingCrease = 'M7 20.4C15 19.8 27 19.4 35.6 19.6';
	const wingPleats = 'M7.6 16C11.6 13.8 15.2 11.6 19.6 9M7.6 24.6C11.6 26.8 15.2 29 19.6 31.6';
	/** 가운데 머리 — 날개 안쪽 끝을 감싼 작은 띠 */
	const bowKnot = 'M-8.6 10.5C-3 8.8 3 8.8 8.6 10.5C10.2 17.5 10.2 24.5 8.6 31.5C3 33.2-3 33.2-8.6 31.5C-10.2 24.5-10.2 17.5-8.6 10.5Z';
	/** 꼬리 (오른쪽 — 왼쪽은 거울) — 머리 뒤에서 내려와 살짝 벌어지고 끝은 제비꼬리.
	 *  Phase 69 — 굵게(폭 16.5 → 22 · 아래로 조금 넓어진다) · 길게(조끼 목둘레 단을 넘어 조끼 위로 늘어진다) */
	const tail = 'M-2 22L20 22C21.2 54 22.8 90 25 126L13.8 115.5L2.4 128C1 92-0.6 56-2 22Z';
	const tailFold = 'M6.6 36C7.4 62 8.6 90 10.2 116';
	const tailShine = 'M12.6 26C13.4 56 14.8 88 16.8 118';

	// 배지 자리 — 깃 가운데 선을 따라 위에서 아래로. 칸 사이 62 — 폰 폭 280 에서 그림이 0.78배로 줄어도 누름 영역 44 가 겹치지 않게.
	// 손으로 꽂은 듯 조금씩 기울게 (tilt, 도)
	const SLOTS = [
		{ x: R(97), y: 108, tilt: -7 },
		{ x: R(75), y: 170, tilt: 5 },
		{ x: R(54), y: 232, tilt: -3 }
	].slice(0, LAPEL_SLOTS);
	const slots = $derived(SLOTS.map((s, i) => ({ ...s, b: badges[i] as BadgeLite | undefined })));
	const pct = (v: number, of: number) => `${(v / of) * 100}%`;
	/** SVG 안에서 도는 것의 중심 (viewBox 좌표) */
	const pivot = (x: number, y: number) => `transform-origin:${x}px ${y}px`;
</script>

<div class="uniform" bind:this={root} data-neck={neck} role="group" aria-label="교복 · 대표 업적 {badges.length}개">
	<div class="body">
		<svg viewBox="0 0 {W} {H}" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
			<defs>
				<!-- 넥타이 · 리본 무늬 (사진): 남색 바탕 + 흰 테를 두른 하늘색 넓은 사선 줄 + 작은 잎 무늬.
				     A · B = 넥타이 (날 / 감긴 머리), a · b = 리본 (날개 · 꼬리) — 줄 간격을 그린 물건 크기에 맞췄다 -->
				{#each [['a', -40, 0.78], ['b', 40, 0.78], ['A', -40, 1.1], ['B', 40, 0.9]] as [k, deg, sc] (k)}
					<pattern id="{uid}-tie-{k}" patternUnits="userSpaceOnUse" width="22" height="22" patternTransform="rotate({deg}) scale({sc})">
						<rect width="22" height="22" fill="#1a2858" />
						<rect y="0.9" width="22" height="7" fill="#8fc6ec" />
						<rect y="0" width="22" height="0.9" fill="#eef6fb" />
						<rect y="7.9" width="22" height="0.9" fill="#eef6fb" />
						<path d="M6 15.2c1.6-2.4 3.8-2.9 5.6-1.6-1.4 1.9-3.4 2.5-5.6 1.6Z" fill="#62b8e6" />
						<path d="M8.6 17.6c1-1.5 2.4-1.8 3.5-1-0.9 1.2-2.1 1.5-3.5 1Z" fill="#3f86c9" />
					</pattern>
				{/each}
				<!-- 천 결 (능직) -->
				<pattern id="{uid}-twill" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(-50)">
					<rect width="3" height="1" fill="#fff" opacity="0.028" />
				</pattern>
				<!-- 흰 셔츠 · 카라 천 결 (아주 옅은 사선) — 흰 바탕이 밋밋하지 않게 -->
				<pattern id="{uid}-weave" patternUnits="userSpaceOnUse" width="1.7" height="1.7" patternTransform="rotate(38)">
					<rect width="1.7" height="0.6" fill="#6f8099" opacity="0.032" />
				</pattern>
				<!-- 조끼 뜨개 결 -->
				<pattern id="{uid}-knit" patternUnits="userSpaceOnUse" width="3.2" height="4" patternTransform="scale(1.25)">
					<rect width="3.2" height="4" fill="#5b5f68" />
					<path d="M0 0.3 1.6 3 3.2 0.3" fill="none" stroke="#696d77" stroke-width="0.9" />
					<path d="M0 2.3 1.6 5 3.2 2.3" fill="none" stroke="#4d5159" stroke-width="0.5" />
				</pattern>
				<linearGradient id="{uid}-cloth" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stop-color="#1b2043" />
					<stop offset="0.55" stop-color="#131733" />
					<stop offset="1" stop-color="#0d1025" />
				</linearGradient>
				<linearGradient id="{uid}-sleeve" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stop-color="#0a0d20" />
					<stop offset="0.5" stop-color="#121633" />
					<stop offset="1" stop-color="#0e1228" />
				</linearGradient>
				<!-- 깃이 말리는 그늘 — 앞섶 쪽은 어둡고 바깥 가장자리는 빛을 받는다 -->
				<linearGradient id="{uid}-lapel" gradientUnits="userSpaceOnUse" x1={R(20)} y1="170" x2={R(140)} y2="118">
					<stop offset="0" stop-color="#10142c" />
					<stop offset="0.3" stop-color="#1a2046" />
					<stop offset="0.8" stop-color="#232a56" />
					<stop offset="1" stop-color="#29315f" />
				</linearGradient>
				<clipPath id="{uid}-clip"><path d={lapel} /></clipPath>
				<!-- 조끼 — 왼쪽(몸이 돌아 들어가는 쪽)은 어둡고 가슴 가운데는 살짝 밝게 -->
				<linearGradient id="{uid}-vestShade" gradientUnits="userSpaceOnUse" x1="-10" y1="0" x2={R(40)} y2="0">
					<stop offset="0" stop-color="#000" stop-opacity="0.34" />
					<stop offset="0.5" stop-color="#fff" stop-opacity="0.05" />
					<stop offset="1" stop-color="#000" stop-opacity="0.12" />
				</linearGradient>
				<!-- 앞섶 가장자리 빛 · 깃이 말리는 빛 — 위(목 옆, 빛을 많이 받는 곳)에서 아래로 옅어진다 -->
				<linearGradient id="{uid}-rim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="300">
					<stop offset="0" stop-color="#8e98d6" stop-opacity="0.8" />
					<stop offset="0.4" stop-color="#6f79b8" stop-opacity="0.45" />
					<stop offset="1" stop-color="#5a639e" stop-opacity="0.1" />
				</linearGradient>
				<linearGradient id="{uid}-roll" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="300">
					<stop offset="0" stop-color="#b3bbef" stop-opacity="0.24" />
					<stop offset="0.45" stop-color="#b3bbef" stop-opacity="0.11" />
					<stop offset="1" stop-color="#b3bbef" stop-opacity="0.03" />
				</linearGradient>
				<!-- 왼쪽 끝 — 몸이 옆으로 돌아 들어가며 어두워진다 -->
				<linearGradient id="{uid}-turn" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stop-color="#000" stop-opacity="0.5" />
					<stop offset="1" stop-color="#000" stop-opacity="0" />
				</linearGradient>
				<linearGradient id="{uid}-shirt" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="#f7fafc" />
					<stop offset="1" stop-color="#d6dee7" />
				</linearGradient>
				<!-- 셔츠 칼라 잎 — 목에서 앞으로 꺾여 내려오며 (위는 살짝 그늘 · 가운데가 가장 밝고 · 끝은 다시 살짝 어둡게) -->
				<linearGradient id="{uid}-leaf" gradientUnits="userSpaceOnUse" x1="12" y1="-10" x2="54" y2="62">
					<stop offset="0" stop-color="#cfd9e5" />
					<stop offset="0.18" stop-color="#f1f5f9" />
					<stop offset="0.5" stop-color="#ffffff" />
					<stop offset="1" stop-color="#d6dfe9" />
				</linearGradient>
				<!-- 잎 위쪽(목 쪽) 그늘 — 꺾임 위로 둥글게 넘어간다 -->
				<linearGradient id="{uid}-leafTop" gradientUnits="userSpaceOnUse" x1="0" y1="-14" x2="0" y2="16">
					<stop offset="0" stop-color="#7d8ea6" stop-opacity="0.42" />
					<stop offset="1" stop-color="#7d8ea6" stop-opacity="0" />
				</linearGradient>
				<!-- 목 안쪽 그늘 — 카라 안쪽 · 목이 들어가는 곳 -->
				<radialGradient id="{uid}-hole" cx="0.5" cy="0.35" r="0.6">
					<stop offset="0" stop-color="#3a475e" stop-opacity="0.85" />
					<stop offset="1" stop-color="#3a475e" stop-opacity="0" />
				</radialGradient>
				<!-- 넥타이 날 · 리본 꼬리 — 둥글게 (가장자리 어둡게, 가운데 살짝 밝게) -->
				<linearGradient id="{uid}-round" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stop-color="#000" stop-opacity="0.34" />
					<stop offset="0.22" stop-color="#000" stop-opacity="0.04" />
					<stop offset="0.45" stop-color="#fff" stop-opacity="0.1" />
					<stop offset="0.75" stop-color="#000" stop-opacity="0.04" />
					<stop offset="1" stop-color="#000" stop-opacity="0.36" />
				</linearGradient>
				<!-- 매듭 — 위 왼쪽에서 빛, 아래로 갈수록 감겨 들어가 어둡게 -->
				<radialGradient id="{uid}-knot" cx="0.38" cy="0.2" r="0.95">
					<stop offset="0" stop-color="#fff" stop-opacity="0.22" />
					<stop offset="0.45" stop-color="#fff" stop-opacity="0" />
					<stop offset="1" stop-color="#000" stop-opacity="0.42" />
				</radialGradient>
				<!-- 넥타이 머리 — 카라 밑이라 위쪽이 그늘, 앞판이 볼록하게 빛을 받는다 -->
				<linearGradient id="{uid}-knotTop" gradientUnits="userSpaceOnUse" x1="0" y1="-4" x2="0" y2="22">
					<stop offset="0" stop-color="#02061a" stop-opacity="0.62" />
					<stop offset="1" stop-color="#02061a" stop-opacity="0" />
				</linearGradient>
				<radialGradient id="{uid}-knotVol" gradientUnits="userSpaceOnUse" cx="-5" cy="22" r="30">
					<stop offset="0" stop-color="#fff" stop-opacity="0.1" />
					<stop offset="0.55" stop-color="#fff" stop-opacity="0" />
					<stop offset="1" stop-color="#000" stop-opacity="0.3" />
				</radialGradient>
				<!-- 날 위쪽 — 머리 그늘이 덮여 아래로 옅어지고, 비단 광이 대각선으로 -->
				<linearGradient id="{uid}-bladeTop" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="104">
					<stop offset="0" stop-color="#02061a" stop-opacity="0.55" />
					<stop offset="0.35" stop-color="#02061a" stop-opacity="0.16" />
					<stop offset="1" stop-color="#02061a" stop-opacity="0" />
				</linearGradient>
				<linearGradient id="{uid}-sheen" gradientUnits="userSpaceOnUse" x1="-22" y1="60" x2="22" y2="104">
					<stop offset="0.25" stop-color="#fff" stop-opacity="0" />
					<stop offset="0.55" stop-color="#fff" stop-opacity="0.13" />
					<stop offset="0.85" stop-color="#fff" stop-opacity="0" />
				</linearGradient>
				<!-- 리본 날개 — 위쪽 면은 빛을, 아래쪽 면은 접혀 그늘로 -->
				<linearGradient id="{uid}-wing" gradientUnits="userSpaceOnUse" x1="0" y1="3" x2="0" y2="37">
					<stop offset="0" stop-color="#fff" stop-opacity="0.2" />
					<stop offset="0.5" stop-color="#fff" stop-opacity="0.02" />
					<stop offset="0.52" stop-color="#000" stop-opacity="0.12" />
					<stop offset="1" stop-color="#000" stop-opacity="0.38" />
				</linearGradient>
				<!-- 날개 안쪽(머리로 모이는 곳) 그늘 — 경계 없이 번지게 방사형으로 -->
				<radialGradient id="{uid}-hub" gradientUnits="userSpaceOnUse" cx="5" cy="20" r="19">
					<stop offset="0" stop-color="#02061a" stop-opacity="0.62" />
					<stop offset="0.55" stop-color="#02061a" stop-opacity="0.24" />
					<stop offset="1" stop-color="#02061a" stop-opacity="0" />
				</radialGradient>
				<!-- 머리(가운데 띠) — 원통처럼 가운데 밝고 양 끝 어둡게 -->
				<linearGradient id="{uid}-band" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stop-color="#000" stop-opacity="0.5" />
					<stop offset="0.3" stop-color="#fff" stop-opacity="0.12" />
					<stop offset="0.55" stop-color="#fff" stop-opacity="0.04" />
					<stop offset="1" stop-color="#000" stop-opacity="0.5" />
				</linearGradient>
				<linearGradient id="{uid}-tailShade" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="#000" stop-opacity="0.5" />
					<stop offset="0.3" stop-color="#000" stop-opacity="0.05" />
					<stop offset="1" stop-color="#fff" stop-opacity="0.06" />
				</linearGradient>
				<clipPath id="{uid}-cKnot"><path d={knot} /></clipPath>
				<clipPath id="{uid}-cBlade"><path d={blade} /></clipPath>
				<clipPath id="{uid}-cLeaf"><path d={leaf} /></clipPath>
				<clipPath id="{uid}-cWing"><path d={wing} /></clipPath>
				<clipPath id="{uid}-cTail"><path d={tail} /></clipPath>
				<clipPath id="{uid}-cBand"><path d={bowKnot} /></clipPath>
				<linearGradient id="{uid}-welt" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="#262d58" />
					<stop offset="1" stop-color="#151938" />
				</linearGradient>
				<radialGradient id="{uid}-light" cx="62%" cy="18%" r="75%">
					<stop offset="0" stop-color="#fff" stop-opacity="0.07" />
					<stop offset="1" stop-color="#fff" stop-opacity="0" />
				</radialGradient>
				<radialGradient id="{uid}-vignette" cx="50%" cy="40%" r="75%">
					<stop offset="0.6" stop-color="#000" stop-opacity="0" />
					<stop offset="1" stop-color="#000" stop-opacity="0.35" />
				</radialGradient>
				<filter id="{uid}-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
				<filter id="{uid}-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.7" /></filter>
				<filter id="{uid}-blur2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" /></filter>
				<filter id="{uid}-drop" x="-30%" y="-30%" width="160%" height="160%">
					<feDropShadow dx="0.6" dy="1.8" stdDeviation="1.4" flood-color="#000" flood-opacity="0.35" />
				</filter>
				<!-- 카라 잎이 셔츠 · 넥타이 위에 드리우는 그림자 — 붙어 있는 진한 그림자 + 번지는 넓은 그림자 -->
				<filter id="{uid}-cast" x="-20%" y="-20%" width="150%" height="150%">
					<feDropShadow dx="0.4" dy="1.3" stdDeviation="0.7" flood-color="#0b1330" flood-opacity="0.55" result="tight" />
					<feDropShadow in="tight" dx="1.8" dy="5" stdDeviation="2.8" flood-color="#0b1330" flood-opacity="0.38" />
				</filter>
				<!-- 교표 — 천에 수놓은 듯 살짝 가라앉게 -->
				<filter id="{uid}-stitch" x="-10%" y="-10%" width="120%" height="120%">
					<feColorMatrix type="matrix" values="0.9 0 0 0 0  0 0.88 0 0 0  0 0 0.9 0 0  0 0 0 1 0" />
					<feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#000" flood-opacity="0.5" />
				</filter>
			</defs>

			<!-- 재킷 몸판 + 천 결 -->
			<rect x="-20" y="-20" width={W + 40} height={H + 40} fill="url(#{uid}-cloth)" />
			<rect x="-20" y="-20" width={W + 40} height={H + 40} fill="url(#{uid}-twill)" />
			<!-- 가슴이 둥글게 빛을 받고, 아래로 흘러내리는 주름 -->
			<g filter="url(#{uid}-blur)">
				<ellipse cx="262" cy="84" rx="86" ry="66" fill="#fff" opacity="0.045" />
				<path d="M318 150C312 200 300 240 286 296" fill="none" stroke="#04061a" stroke-width="15" opacity="0.4" />
				<path d="M333 158C327 205 316 244 303 296" fill="none" stroke="#fff" stroke-width="7" opacity="0.04" />
				<path d="M212 258C240 270 276 276 318 272" fill="none" stroke="#04061a" stroke-width="12" opacity="0.28" />
			</g>
			<!-- 소매 (오른쪽 끝) — 솔기 안쪽으로 몸판이 둥글게 돌아간다 -->
			<path d="M338 -10C331 70 335 170 353 300" fill="none" stroke="#04061a" stroke-width="12" opacity="0.35" filter="url(#{uid}-blur)" />
			<path d="M338 -10C331 70 335 170 353 300L380 300L380 -10Z" fill="url(#{uid}-sleeve)" />
			<path d="M338 -10C331 70 335 170 353 300L380 300L380 -10Z" fill="url(#{uid}-twill)" />
			<path d="M338 -10C331 70 335 170 353 300" fill="none" stroke="#04061a" stroke-width="1.6" />
			<path d="M340.5 -10C333.5 70 337.5 170 355.5 300" fill="none" stroke="#4a5388" stroke-opacity="0.3" stroke-width="0.9" />

			<!-- 깃 앞섶 안쪽으로 보이는 셔츠 -->
			<path d={shirt} fill="url(#{uid}-shirt)" />
			<path d={shirt} fill="url(#{uid}-weave)" />

			<!-- 목 둘레 — 입은 순서대로 겹친다: 셔츠 → 넥타이 → 셔츠 카라(잎이 매듭 어깨를 덮는다) → 조끼 → 리본 꼬리(조끼 위로) · 머리 · 날개 → 재킷.
			     모양은 모두 목 가운데를 0 으로 (translate(C 0)) — 카라 벌어짐 기준으로 매듭 · 리본 크기를 맞췄다 -->
			<g transform="translate(0 {NECK_Y})">
				<!-- 목 안쪽 그늘 (카라 안 · 매듭 위) -->
				<ellipse cx={C} cy="-4" rx="21" ry="12" fill="url(#{uid}-hole)" />

				{#if neck === 'tie'}
					<g class="tie">
						<!-- 날 — 매듭에 매달려 살짝 흔들리고, 조끼 속으로 들어간다 -->
						<g class="sway" style={pivot(C, 46)}>
							<g transform="translate({C} 0)">
								<!-- 셔츠 위에 드리운 그림자 -->
								<path d={blade} fill="#0a1230" opacity="0.3" transform="translate(3.2 3.4)" filter="url(#{uid}-blur2)" />
								<path class="blade" d={blade} fill="url(#{uid}-tie-A)" />
								<path d={blade} fill="url(#{uid}-twill)" />
								<g clip-path="url(#{uid}-cBlade)">
									<!-- 접혀 말린 양옆 가장자리의 그늘 · 가운데 빛 -->
									<path d={blade} fill="none" stroke="#02061a" stroke-opacity="0.5" stroke-width="9" filter="url(#{uid}-blur2)" />
									<path d="M-2 40C-2.5 80-4 110-6 150" fill="none" stroke="#fff" stroke-opacity="0.1" stroke-width="10" filter="url(#{uid}-blur2)" />
									<path d={blade} fill="url(#{uid}-bladeTop)" />
									<path d={blade} fill="url(#{uid}-sheen)" />
									<!-- 머리가 날 위에 드리우는 그림자 (치마 아래로) -->
									<path d={knot} fill="#02061a" opacity="0.6" transform="translate(0 6)" filter="url(#{uid}-blur2)" />
									<!-- 머리 아래 보조개 — 가운데가 오목하게 접힌 그늘 + 옆으로 부푼 빛 -->
									<path d={dimple} fill="#02061a" opacity="0.55" filter="url(#{uid}-soft)" />
								</g>
								<path d={blade} fill="none" stroke="#0b1433" stroke-opacity="0.55" stroke-width="0.9" />
								<path d="M-11.6 34C-11.6 62-15 96-21 128" fill="none" stroke="#b9d9f2" stroke-opacity="0.22" stroke-width="0.7" />
							</g>
						</g>
						<!-- 머리(매듭) — 살짝 기울어 손으로 맨 느낌. 옆 판은 줄무늬가 날과 반대로 감기고, 가운데 판은 날 방향으로 -->
						<g transform="translate({C} 0) rotate(-1.4 0 26)">
							<path d={knot} fill="#0a1230" opacity="0.34" transform="translate(3 4.5)" filter="url(#{uid}-blur2)" />
							<path class="knot" d={knot} fill="url(#{uid}-tie-B)" />
							<g clip-path="url(#{uid}-cKnot)">
								<path d={knotFront} fill="url(#{uid}-tie-A)" />
								<!-- 판이 만나는 접힌 선 · 양옆 판이 가운데 판 밑으로 들어가는 그늘 -->
								<path d="M-13 -4C-12 14-9 32-5.5 47M13 -4C12 14 9 32 5.5 47" fill="none" stroke="#02061a" stroke-opacity="0.55" stroke-width="3.4" filter="url(#{uid}-soft)" />
								<path d="M-13 -4C-12 14-9 32-5.5 47M13 -4C12 14 9 32 5.5 47" fill="none" stroke="#02061a" stroke-opacity="0.6" stroke-width="0.9" />
								<path d="M-10.6 0C-9.8 14-7 30-3.6 44M10.6 0C9.8 14 7 30 3.6 44" fill="none" stroke="#fff" stroke-opacity="0.1" stroke-width="0.8" />
								<!-- 감긴 천의 가로 주름 -->
								<path d="M-22 33C-13 36-6 37 0 37C6 37 13 36 22 33" fill="none" stroke="#02061a" stroke-opacity="0.28" stroke-width="1" />
								<path d={knot} fill="none" stroke="#02061a" stroke-opacity="0.5" stroke-width="8" filter="url(#{uid}-blur2)" />
								<path d={knot} fill="url(#{uid}-knotVol)" />
								<path d={knot} fill="url(#{uid}-knotTop)" />
							</g>
							<!-- 치마(아래 끝) 가장자리에 걸리는 빛 -->
							<path d="M-11 44.6C-6 46.6 6 46.6 11 44.6" fill="none" stroke="#fff" stroke-opacity="0.16" stroke-width="1" stroke-linecap="round" />
							<path d={knot} fill="none" stroke="#0b1433" stroke-opacity="0.55" stroke-width="0.9" />
						</g>
					</g>
				{/if}

				{#if neck === 'ribbon'}
					<!-- 셔츠 앞 가운데(여밈) — 리본 꼬리 사이로 보이고, 조끼 속으로 들어간다 -->
					<g class="placket" transform="translate({C} 0)">
						<path d="M0 34V112" stroke="#aeb9c6" stroke-width="0.9" />
						<path d="M-6.5 34V112M6.5 34V112" stroke="#c4ced9" stroke-width="0.6" stroke-dasharray="1.6 1.9" />
						<circle cx="0" cy="97" r="3.3" fill="#f3f6f9" stroke="#a7b3c1" stroke-width="0.8" />
						<circle cx="-0.9" cy="96.2" r="0.5" fill="#8f9cab" /><circle cx="0.9" cy="96.2" r="0.5" fill="#8f9cab" />
						<circle cx="-0.9" cy="98" r="0.5" fill="#8f9cab" /><circle cx="0.9" cy="98" r="0.5" fill="#8f9cab" />
					</g>
				{/if}

				<!-- 셔츠 카라 — 목 옆에서 앞으로 꺾여 내려와 끝이 뾰족한 잎 두 개. 잎 밑으로 그림자가 드리우고, 매듭 · 셔츠보다 위에 얹힌다 -->
				<g transform="translate({C} 0)">
					{#each [1, -1] as const as s (s)}
						<g transform="scale({s} 1)">
							<path class="leaf" d={leaf} fill="url(#{uid}-leaf)" filter="url(#{uid}-cast)" />
							<path d={leaf} fill="url(#{uid}-weave)" />
							<g clip-path="url(#{uid}-cLeaf)">
								<path d={leaf} fill="url(#{uid}-leafTop)" />
								<!-- 꺾임 능선 — 위(목 쪽)는 둥글게 넘어가고 아래 잎 면이 시작된다 -->
								<path d={leafFold} fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="2.2" stroke-linecap="round" filter="url(#{uid}-soft)" />
								<path d="M14 5.4C34 11.4 58 7.4 92 -3.6" fill="none" stroke="#8394ab" stroke-opacity="0.32" stroke-width="2.6" filter="url(#{uid}-blur2)" />
								<!-- 잎이 앞으로 휘어 끝 쪽이 조금 더 밝고, 바깥 아래 선은 그늘 -->
								<path d="M50 66C58 57 69 42 92 9" fill="none" stroke="#8394ab" stroke-opacity="0.34" stroke-width="7" filter="url(#{uid}-blur2)" />
								<path d={leafEdge} fill="none" stroke="#8fa0b6" stroke-opacity="0.3" stroke-width="7" filter="url(#{uid}-blur2)" transform="translate(-3.4 0)" />
							</g>
							<!-- 두 겹 끝단의 두께 — 안쪽 끝의 밝은 띠 · 그 안의 오목한 그늘 · 윗땀 -->
							<path d={leaf} fill="none" stroke="#b6c2d0" stroke-width="0.9" stroke-linejoin="round" />
							<path d={leafEdge} fill="none" stroke="#fff" stroke-width="1.3" transform="translate(1.6 0.6)" stroke-linecap="round" />
							<path d={leafStitchIn} fill="none" stroke="#8695a8" stroke-opacity="0.7" stroke-width="0.7" stroke-dasharray="1.6 1.6" />
							<path d={leafStitchOut} fill="none" stroke="#8695a8" stroke-opacity="0.6" stroke-width="0.7" stroke-dasharray="1.6 1.6" />
						</g>
					{/each}
				</g>

				<!-- 셔츠 위 그늘 — 조끼 목둘레 단 바로 위(조끼가 셔츠 위에 얹혀 드리운 것) · 카라 끝 아래로 셔츠가 당겨진 주름 -->
				<path d={vLine} fill="none" stroke="#3d4b63" stroke-opacity="0.32" stroke-width="7" transform="translate(0 -6)" filter="url(#{uid}-blur2)" />
				<path d="M{C + 40} 74C{C + 44} 88 {C + 40} 96 {C + 30} 102" fill="none" stroke="#5b6d86" stroke-opacity="0.16" stroke-width="5" filter="url(#{uid}-blur2)" />

				<!-- 회색 조끼 (사진) — 칼라 끝 아래로 넓고 얕은, 아래가 둥근 V 목둘레 · 뜨개 결 + 남색 목둘레 단(골 무늬). 넥타이 날은 조끼 속으로 -->
				<path class="vest" d={vest} fill="url(#{uid}-knit)" />
				<path d={vest} fill="url(#{uid}-vestShade)" />
				<path d="M{C + 50} 120C{C + 38} 176 {C + 24} 236 {C + 10} 300" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="12" filter="url(#{uid}-blur)" />
				<path d={vLine} fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="2.5" transform="translate(0 6)" filter="url(#{uid}-soft)" />
				<path class="vneck" d={vLine} fill="none" stroke="#181b30" stroke-width="10" stroke-linecap="round" />
				<path d={vLine} fill="none" stroke="#262a44" stroke-width="8" stroke-dasharray="0.9 1.9" />
				<path d={vLine} fill="none" stroke="#5a6080" stroke-opacity="0.35" stroke-width="1" transform="translate(0 -4.5)" />

				{#if neck === 'ribbon'}
					<!-- 꼬리 (Phase 69) — 머리 뒤에서 내려와 살짝 벌어지고, 조끼 목둘레 단을 넘어 조끼 위로 늘어진다. 끝은 제비꼬리 -->
					<g class="ribbon-tails" transform="translate({C} 0)">
						<g class="sway tails" style="transform-origin:0px 22px">
							{#each [[1, 7], [-1, 9]] as const as [sg, deg] (sg)}
								<g transform="scale({sg} 1) rotate({-deg} 0 22)">
									<!-- 조끼 · 셔츠 위에 드리운 그림자 -->
									<path d={tail} fill="#060a1c" opacity="0.4" transform="translate(2.8 3.8)" filter="url(#{uid}-blur2)" />
									<path class="tail" d={tail} fill="url(#{uid}-tie-a)" />
									<path d={tail} fill="url(#{uid}-twill)" />
									<g clip-path="url(#{uid}-cTail)">
										<path d={tail} fill="none" stroke="#02061a" stroke-opacity="0.5" stroke-width="8" filter="url(#{uid}-blur2)" />
										<path d={tail} fill="url(#{uid}-tailShade)" />
										<path d={tailShine} fill="none" stroke="#fff" stroke-opacity="0.13" stroke-width="6" filter="url(#{uid}-blur2)" />
									</g>
									<path d={tailFold} fill="none" stroke="#050a20" stroke-opacity="0.3" stroke-width="0.9" />
									<path d={tail} fill="none" stroke="#0b1433" stroke-opacity="0.55" stroke-width="0.9" stroke-linejoin="round" />
								</g>
							{/each}
						</g>
					</g>
					<g class="ribbon" filter="url(#{uid}-drop)" transform="translate({C} 0)">
						<!-- 날개 — 가운데 주름으로 위 면은 빛을, 아래 면은 그늘을. 머리 쪽은 모아 잡은 주름 -->
						<g class="sway loops" style="transform-origin:0px 20px">
							{#each [[-1, 'b', 2.4], [1, 'a', -3]] as const as [sg, k, tilt] (sg)}
								<g transform="scale({sg * 0.91} 1) rotate({tilt} 0 20)">
									<path class="loop" d={wing} fill="url(#{uid}-tie-{k})" />
									<path d={wing} fill="url(#{uid}-twill)" />
									<g clip-path="url(#{uid}-cWing)">
										<path d={wing} fill="url(#{uid}-wing)" />
										<path d={wing} fill="none" stroke="#02061a" stroke-opacity="0.42" stroke-width="6" filter="url(#{uid}-blur2)" />
										<!-- 머리 쪽으로 모이는 안쪽 그늘 -->
										<path d={wing} fill="url(#{uid}-hub)" />
										<path d={wingCrease} fill="none" stroke="#02061a" stroke-opacity="0.45" stroke-width="2.2" filter="url(#{uid}-soft)" />
										<path d="M8 22.2C16 21.6 27 21.2 35.6 21.4" fill="none" stroke="#fff" stroke-opacity="0.16" stroke-width="1" />
									</g>
									<path d={wingPleats} fill="none" stroke="#050a20" stroke-opacity="0.32" stroke-width="0.9" stroke-linecap="round" />
									<path d="M12 9.4C18 5.6 24 4 30 4.2" fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="1" stroke-linecap="round" />
									<path d={wing} fill="none" stroke="#0b1433" stroke-opacity="0.55" stroke-width="0.9" stroke-linejoin="round" />
								</g>
							{/each}
						</g>
						<!-- 머리(가운데 띠) — 날개 안쪽 끝을 감싸 조인 곳. 줄이 가로로 감기고 위아래 조인 주름 -->
						<path d={bowKnot} fill="#0a1230" opacity="0.4" transform="translate(1.6 2.6)" filter="url(#{uid}-blur2)" />
						<path class="bow-knot" d={bowKnot} fill="url(#{uid}-tie-b)" />
						<g clip-path="url(#{uid}-cBand)">
							<path d={bowKnot} fill="url(#{uid}-band)" />
							<path d="M-11 15.6C-4 17.8 4 17.8 11 15.6M-11 25.6C-4 27.6 4 27.6 11 25.6" fill="none" stroke="#02061a" stroke-opacity="0.32" stroke-width="1" />
							<path d="M-11 12C-4 14 4 14 11 12" fill="none" stroke="#02061a" stroke-opacity="0.4" stroke-width="2.2" filter="url(#{uid}-soft)" />
							<path d="M-11 30C-4 32 4 32 11 30" fill="none" stroke="#fff" stroke-opacity="0.14" stroke-width="1.2" />
						</g>
						<path d="M-6.5 11.4C-2.5 10.2 2.5 10.2 6.5 11.4" fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="1" stroke-linecap="round" />
						<path d={bowKnot} fill="none" stroke="#0b1433" stroke-opacity="0.6" stroke-width="0.9" />
					</g>
				{/if}
			</g>

			<!-- 왼쪽 끝 — 몸이 옆으로 돌아 들어가며 어두워진다 -->
			<rect x="-20" y="-20" width="74" height="340" fill="url(#{uid}-turn)" opacity="0.6" />

			<!-- 깃이 조끼 · 셔츠 위로 떠 있어 앞섶 안쪽으로 드리운 그림자 -->
			<path d={front(-3.5, 3)} fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="8" filter="url(#{uid}-blur2)" />

			<!-- 깃 (노치 라펠, 보는 사람 기준 오른쪽) — 몸판 위로 뜬 부드러운 그림자, 말리는 그늘, 바깥 가장자리 빛 · 손바느질 -->
			<path d={lapel} fill="#03051a" opacity="0.6" transform="translate(3 4)" filter="url(#{uid}-blur2)" />
			<path class="lapel-r" d={lapel} fill="url(#{uid}-lapel)" />
			<path d={lapel} fill="url(#{uid}-twill)" />
			<g clip-path="url(#{uid}-clip)">
				<!-- 깃이 둥글게 말려 넘어가며 받는 넓은 빛 띠, 앞섶 바로 안쪽의 오목한 그늘 -->
				<path d={front(16)} fill="none" stroke="url(#{uid}-roll)" stroke-width="18" filter="url(#{uid}-blur)" />
				<path d={front(4)} fill="none" stroke="#02041a" stroke-opacity="0.3" stroke-width="3" filter="url(#{uid}-soft)" />
			</g>
			<!-- 앞섶 두께 — 둥근 가장자리 빛 + 윤곽 + 손바느질 -->
			<path d={front(1.3)} fill="none" stroke="url(#{uid}-rim)" stroke-width="1.5" />
			<path class="front-edge" d={front(-0.2)} fill="none" stroke="#02041a" stroke-opacity="0.85" stroke-width="1" />
			<path d={front(5.5)} fill="none" stroke="#8f99cf" stroke-opacity="0.24" stroke-width="0.7" stroke-dasharray="1.2 2.2" />
			<path d={gorge} fill="none" stroke="#05071a" stroke-opacity="0.7" stroke-width="1.3" />
			<path d={gorge} fill="none" stroke="#6f79b3" stroke-opacity="0.18" stroke-width="0.8" transform="translate(0 1.4)" />
			<path d={lapelEdge()} fill="none" stroke="#aab3e6" stroke-opacity="0.16" stroke-width="5" filter="url(#{uid}-blur2)" />
			<path d={lapelEdge(5)} fill="none" stroke="#8f99cf" stroke-opacity="0.3" stroke-width="0.7" stroke-dasharray="1.2 2.2" />
			<path d={lapelOuter} fill="none" stroke="#9aa4d6" stroke-opacity="0.32" stroke-width="1.2" stroke-linejoin="round" />

			<!-- 배지가 천에 드리운 그림자 -->
			{#each slots as s, i (i)}
				{#if s.b}<ellipse cx={s.x + 1.5} cy={s.y + 4} rx="17" ry="16" fill="#000" opacity="0.35" filter="url(#{uid}-blur2)" />{/if}
			{/each}

			<!-- 가슴 주머니(수평) + 바로 아래 가운데 교표 (보는 사람 기준 오른쪽, 사진처럼) -->
			<rect x={PX - 36} y="134" width="72" height="5" fill="#000" opacity="0.35" filter="url(#{uid}-blur2)" />
			<path class="pocket" d="M{PX - 36} 124H{PX + 36}V135H{PX - 36}Z" fill="url(#{uid}-welt)" />
			<path d="M{PX - 36} 124.6H{PX + 36}" stroke="#8d97c9" stroke-opacity="0.4" stroke-width="1.1" />
			<path d="M{PX - 33} 127.4H{PX + 33}" stroke="#8d97c9" stroke-opacity="0.25" stroke-width="0.8" stroke-dasharray="1.6 1.8" />
			<path d="M{PX - 36} 135.4H{PX + 36}" stroke="#04061a" stroke-opacity="0.85" stroke-width="1.6" />
			<path d="M{PX - 35.5} 124V135M{PX + 35.5} 124V135" stroke="#04061a" stroke-opacity="0.6" stroke-width="1.2" />
			<image href="/school-crest.png" x={PX - 32} y="146" width="64" height="67.1" filter="url(#{uid}-stitch)" />

			<!-- 위에서 비치는 빛 · 가장자리 어둡게 -->
			<rect width={W} height={H} fill="url(#{uid}-light)" />
			<rect width={W} height={H} fill="url(#{uid}-vignette)" />
		</svg>

		<!-- 깃의 배지 (대표 업적) — 조금씩 기울게. onplace 면 꾹 눌러 다른 칸으로 끌어 옮긴다 (Phase 69) -->
		{#each slots as s, i (i)}
			{#if s.b}
				{@const b = s.b}
				<button
					class="pin u-tap"
					data-drop-slot={i}
					style:left={pct(s.x, W)}
					style:top={pct(s.y, H)}
					onclick={() => onpick?.(b)}
					aria-label="{b.title} 업적 자세히"
					use:badgeDrag={{ enabled: !!onplace, scope: () => root, ondrop: (to) => to !== i && onplace?.(b.code, to) }}
				>
					<span class="tilt" style:rotate="{s.tilt}deg"><Badge code={b.code} icon={b.icon} tier={b.tier} title={b.title} size={40} shine delay={i * 260} /></span>
				</button>
			{:else if emptyHref}
				<a class="pin empty" data-drop-slot={i} href={emptyHref} style:left={pct(s.x, W)} style:top={pct(s.y, H)} aria-label="대표 업적 비어 있음 · 업적 보기">
					<span aria-hidden="true">+</span>
				</a>
			{:else if onplace}
				<!-- 빈 칸 — 메달을 끌어 와 놓는 자리 -->
				<span class="pin empty" data-drop-slot={i} style:left={pct(s.x, W)} style:top={pct(s.y, H)} aria-hidden="true"><span>+</span></span>
			{/if}
		{/each}
	</div>
</div>

<style>
	.uniform {
		position: relative;
		width: 100%;
		aspect-ratio: 360 / 280;
		border-radius: var(--r-card);
		overflow: hidden;
		background: #131733;
		box-shadow: var(--shadow-1);
		isolation: isolate;
	}
	/* 숨 쉬듯 아주 살짝 — 가장자리가 비지 않게 틀보다 조금 크게 */
	.body {
		position: absolute;
		inset: -2%;
		transform-origin: 50% 100%;
		animation: breathe 5.6s ease-in-out infinite alternate;
	}
	@keyframes breathe {
		to {
			transform: translateY(-0.5%) scale(1.012);
		}
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
	}
	/* 넥타이 날 · 리본 꼬리 · 고리 — 매달린 곳을 중심으로 천천히 흔들린다 (숨과 다른 박자) */
	.sway {
		transform-box: view-box;
		animation: sway 4.3s ease-in-out infinite alternate;
	}
	.tie .sway {
		rotate: -0.9deg;
		animation-name: sway-tie;
	}
	@keyframes sway-tie {
		to {
			rotate: 0.9deg;
		}
	}
	.tails {
		rotate: -1.6deg;
		animation-duration: 3.7s;
	}
	.loops {
		rotate: -0.6deg;
		animation-name: sway-loop;
		animation-duration: 5.1s;
	}
	@keyframes sway {
		to {
			rotate: 1.6deg;
		}
	}
	@keyframes sway-loop {
		to {
			rotate: 0.6deg;
		}
	}
	/* 배지 — 깃에 꽂은 핀. 누름 영역 44 */
	.pin {
		position: absolute;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		filter: drop-shadow(0 2px 1.5px rgb(5 8 25 / 0.6));
		text-decoration: none;
		transition: transform 0.15s;
	}
	.tilt {
		display: grid;
		place-items: center;
	}
	.empty span {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px dashed rgb(210 220 255 / 0.55);
		color: rgb(225 232 255 / 0.85);
		font-size: 20px;
		line-height: 1;
	}
	.pin:active {
		transform: translate(-50%, -50%) scale(0.92);
	}
	/* 끌어 옮기는 중 (Phase 69) — 칸마다 점선 고리가 숨 쉬고, 메달이 올라간 칸은 커지며 밝은 고리. 집은 자리는 흐리게 */
	.uniform:global([data-dropping]) .pin::after {
		content: '';
		position: absolute;
		inset: 0;
		border: 2px dashed rgb(210 220 255 / 0.7);
		border-radius: 50%;
		animation: slot-pulse 0.9s ease-in-out infinite alternate;
		pointer-events: none;
	}
	.uniform .pin:global([data-drop-over]) {
		transform: translate(-50%, -50%) scale(1.22);
	}
	.uniform:global([data-dropping]) .pin:global([data-drop-over])::after {
		border: 2.5px solid #ffe08a;
		box-shadow: 0 0 14px 2px rgb(255 224 138 / 0.65);
		animation: none;
	}
	@keyframes slot-pulse {
		to {
			scale: 1.12;
			opacity: 0.55;
		}
	}
</style>
