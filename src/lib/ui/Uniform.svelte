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
	 *   neck — 넥타이(남학생 · 상대 프로필) / 리본(여학생)
	 *   badges — 깃에 위에서부터 (최대 LAPEL_SLOTS)
	 *   emptyHref — 있으면 빈 칸을 점선 동그라미 "+" 로 (내 프로필 → 업적 화면)
	 * 교복 색은 라이트 · 다크 모두 같다 (진짜 교복 색). 교표 그림: static/school-crest.png (scripts/generate-crest.mjs)
	 */
	import Badge from './Badge.svelte';
	import type { BadgeLite } from '$lib/achievements';

	let {
		neck = 'tie',
		badges = [],
		onpick,
		emptyHref
	}: {
		neck?: 'tie' | 'ribbon';
		badges?: BadgeLite[];
		onpick?: (b: BadgeLite) => void;
		emptyHref?: string;
	} = $props();

	const uid = $props.id();
	const W = 360;
	const H = 280;
	/** 몸 가운데 (넥타이 · 셔츠 칼라 · 조끼 V넥) — 스케치대로 넥타이가 왼쪽 끝에 오게 (Phase 64) */
	const C = 32;
	/** 목 둘레(넥타이 · 셔츠 칼라 · 조끼 V넥 · 리본)를 사진처럼 크게 — 목 가운데 위를 기준으로 */
	const NS = 1.25;
	/** 넥타이를 목 둘레 안에서 한 번 더 크게 (머리 · 날 큼직하게) */
	const TS = 1.2;
	/** 리본 크기 · 위치 (목 둘레 안에서) */
	const RIBBON = `translate(${C} 8) scale(1.12) translate(${-C} 0)`;
	/** 오른쪽 깃의 기준 — 깃 · 배지 · 주머니 · 교표 자리는 그대로 두고 몸 가운데만 왼쪽으로 (앞섶 사이가 넓어져 조끼가 넓게 보인다) */
	const LC = 72;
	/** 가슴 주머니 · 교표의 가운데 x — 깃 바깥 선과 소매 솔기 사이 */
	const PX = 285;
	/** 몸 가운데에서 s 쪽(1 = 보는 사람 기준 오른쪽, -1 = 왼쪽)으로 dx */
	const X = (s: number, dx: number) => C + s * dx;
	/** 오른쪽 깃 기준에서 dx */
	const R = (dx: number) => LC + dx;

	// 앞섶(깃 안쪽 가장자리) — 목 옆에서 내려와 가슴께에서 안으로 살짝 부풀었다가 아래로 (곧은 선이 아니라 S 곡선, Phase 63)
	const FRONT = [
		[40, 0],
		[39, 32],
		[31, 72],
		[25, 110],
		[19, 150],
		[11, 220],
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
	const gorge = `M${R(152)} 84C${R(128)} 64 ${R(98)} 42 ${R(64)} 24`;
	/** 셔츠가 보이는 곳 — 그림 왼쪽 끝에서 깃 앞섶까지 */
	const shirt = `M-20 -20H${R(FRONT[0][0])}V0${front().slice(front().indexOf('C'))}L-20 300Z`;
	// 조끼 목둘레 (사진) — 셔츠 칼라 끝 조금 아래를 지나 넓고 얕게, 아래는 뾰족하지 않고 둥글게 (라운드에 가까운 V).
	// 칼라 끝 · 바깥 선보다 늘 아래라 칼라를 가리지 않는다. 왼쪽 팔은 그림 밖에서, 오른쪽 팔은 깃 밑으로
	const vLine = `M${X(-1, 96)} 10C${X(-1, 70)} 34 ${X(-1, 46)} 66 ${X(-1, 28)} 86C${X(-1, 17)} 97 ${X(-1, 9)} 101 ${C} 101C${X(1, 9)} 101 ${X(1, 17)} 97 ${X(1, 28)} 86C${X(1, 46)} 66 ${X(1, 70)} 34 ${X(1, 96)} 10`;
	/** 조끼 몸판 — 오른쪽 끝은 깃 밑(앞섶과 깃 바깥 선 사이)에서 닫는다 */
	const vest = `${vLine}L${R(60)} 8L${R(30)} 300H-100V8Z`;
	// 셔츠 칼라 한 쪽 — 목 가운데에서 만나 아래 바깥으로 뾰족하게. 바깥은 목을 감아 재킷 깃 밑으로 들어간다
	const leaf = (s: 1 | -1) => {
		const x = (d: number) => X(s, d);
		return `M${x(1)} 10C${x(12)} 14 ${x(18)} 40 ${x(30)} 68C${x(38)} 60 ${x(50)} 44 ${x(60)} 26L${x(62)} 0L${x(3)} 0Z`;
	};
	const leafStitch = (s: 1 | -1) => `M${X(s, 5)} 14C${X(s, 14)} 19 ${X(s, 19.5)} 42 ${X(s, 29.5)} 62`;

	// 넥타이 — 매듭(머리)은 위가 넓은 사다리꼴에 둥근 변, 날은 아래로 넓어지며 조끼 속으로
	const knot = `M${C - 17} 19C${C - 7} 15.5 ${C + 7} 15.5 ${C + 17} 19C${C + 15} 30 ${C + 12} 42 ${C + 8.5} 50C${C + 3.5} 53.5 ${C - 3.5} 53.5 ${C - 8.5} 50C${C - 12} 42 ${C - 15} 30 ${C - 17} 19Z`;
	const blade = `M${C - 8} 49C${C - 13} 80 ${C - 18} 130 ${C - 20} 200L${C + 20} 202C${C + 17} 130 ${C + 12} 80 ${C + 8} 49Z`;

	// 리본 — 고리 · 고리 안쪽 · 주름 · 꼬리(제비꼬리)
	const loop = (s: 1 | -1) => {
		const x = (d: number) => X(s, d);
		return `M${x(7)} 18C${x(14)} 11 ${x(25)} 2 ${x(35)} 4C${x(44)} 6 ${x(46)} 26 ${x(40)} 38C${x(34)} 47 ${x(20)} 42 ${x(7)} 32Z`;
	};
	const loopInner = (s: 1 | -1) => {
		const x = (d: number) => X(s, d);
		return `M${x(8)} 20C${x(15)} 17 ${x(23)} 18 ${x(26)} 24C${x(21)} 27.5 ${x(14)} 29 ${x(8)} 30Z`;
	};
	const loopFolds = (s: 1 | -1) => {
		const x = (d: number) => X(s, d);
		return `M${x(9)} 21C${x(18)} 15 ${x(28)} 11 ${x(37)} 12.5M${x(9)} 31C${x(18)} 37 ${x(28)} 39 ${x(36)} 36M${x(27)} 26C${x(32)} 25 ${x(37)} 25 ${x(41)} 24`;
	};
	const loopShine = (s: 1 | -1) => `M${X(s, 12)} 13C${X(s, 20)} 6.5 ${X(s, 28)} 3.5 ${X(s, 35)} 5.5`;
	/** 고리 바깥 끝 — 천이 뒤로 접혀 넘어가는 둥근 면 */
	const loopTurn = (s: 1 | -1) => `M${X(s, 36)} 5C${X(s, 44)} 8 ${X(s, 45)} 26 ${X(s, 39.5)} 37.5C${X(s, 41)} 26 ${X(s, 40.5)} 13 ${X(s, 36)} 5Z`;
	const tail = (s: 1 | -1, len: number) => {
		const x = (d: number) => X(s, d);
		const y = (v: number) => 32 + (v - 32) * len;
		return `M${x(2)} 32C${x(6)} ${y(56)} ${x(12)} ${y(82)} ${x(20)} ${y(106)}L${x(12)} ${y(100.5)}L${x(5)} ${y(111)}C${x(1)} ${y(86)} ${x(-2)} ${y(60)} ${x(-4)} 34Z`;
	};
	const tailFold = (s: 1 | -1, len: number) => {
		const y = (v: number) => 32 + (v - 32) * len;
		return `M${X(s, 0.5)} ${y(48)}C${X(s, 4)} ${y(64)} ${X(s, 8)} ${y(80)} ${X(s, 12.5)} ${y(99)}`;
	};
	/** 리본 머리(가운데 매듭) — 고리 안쪽 끝을 덮을 만큼 크게 */
	const bowKnot = `M${C - 10.5} 12.5C${C - 4} 10 ${C + 4} 10 ${C + 10.5} 12.5C${C + 12.5} 21 ${C + 12.5} 29 ${C + 10.5} 37.5C${C + 4} 40 ${C - 4} 40 ${C - 10.5} 37.5C${C - 12.5} 29 ${C - 12.5} 21 ${C - 10.5} 12.5Z`;

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

<div class="uniform" data-neck={neck} role="group" aria-label="교복 · 대표 업적 {badges.length}개">
	<div class="body">
		<svg viewBox="0 0 {W} {H}" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
			<defs>
				<!-- 넥타이 · 리본 무늬 (사진): 남색 바탕 + 흰 테를 두른 하늘색 넓은 사선 줄 + 작은 잎 무늬 -->
				{#each [['a', -40], ['b', 40]] as [k, deg] (k)}
					<pattern id="{uid}-tie-{k}" patternUnits="userSpaceOnUse" width="22" height="22" patternTransform="rotate({deg})">
						<rect width="22" height="22" fill="#1a2858" />
						<rect y="0.9" width="22" height="7" fill="#8fc6ec" />
						<rect y="0" width="22" height="0.9" fill="#eef6fb" />
						<rect y="7.9" width="22" height="0.9" fill="#eef6fb" />
						<path d="M6 15.2c1.6-2.4 3.8-2.9 5.6-1.6-1.4 1.9-3.4 2.5-5.6 1.6Z" fill="#62b8e6" />
						<path d="M8.6 17.6c1-1.5 2.4-1.8 3.5-1-0.9 1.2-2.1 1.5-3.5 1Z" fill="#3f86c9" />					</pattern>
				{/each}
				<!-- 천 결 (능직) -->
				<pattern id="{uid}-twill" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(-50)">
					<rect width="3" height="1" fill="#fff" opacity="0.028" />
				</pattern>
				<!-- 조끼 뜨개 결 -->
				<pattern id="{uid}-knit" patternUnits="userSpaceOnUse" width="3.2" height="4">
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
				<linearGradient id="{uid}-leaf" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="#ffffff" />
					<stop offset="1" stop-color="#e3e9ef" />
				</linearGradient>
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
				<linearGradient id="{uid}-tailShade" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="#000" stop-opacity="0.45" />
					<stop offset="0.3" stop-color="#000" stop-opacity="0.05" />
					<stop offset="1" stop-color="#fff" stop-opacity="0.06" />
				</linearGradient>
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

			<!-- 목 둘레 — 가까이 본 사진처럼 크게. 실제로 입은 순서대로 겹친다: 셔츠 → 넥타이 · 리본 꼬리 → 셔츠 칼라 → 조끼 → 리본 머리 · 고리 → 재킷 -->
			<g transform="translate({C} 0) scale({NS}) translate({-C} 0)">
				{#if neck === 'tie'}
					<g class="tie" transform="translate({C} 10) scale({TS}) translate({-C} -10)">
						<!-- 날 — 매듭에 매달려 살짝 흔들리고, 조끼 속으로 들어간다 -->
						<g class="sway" style={pivot(C, 50)}>
							<path d={blade} fill="#000" opacity="0.2" transform="translate(2.5 3)" filter="url(#{uid}-blur2)" />
							<path class="blade" d={blade} fill="url(#{uid}-tie-a)" />
							<path d={blade} fill="url(#{uid}-round)" />
							<path d={blade} fill="none" stroke="#0b1433" stroke-opacity="0.45" stroke-width="0.8" />
							<!-- 매듭 아래 보조개 — 가운데가 오목하게 접힌 그늘 + 옆의 빛 -->
							<path d="M{C - 1.5} 53C{C - 0.5} 59 {C + 1} 64 {C + 3} 70C{C + 0.6} 66 {C - 1.8} 60 {C - 3.6} 54Z" fill="#050a20" opacity="0.5" filter="url(#{uid}-soft)" />
							<path d="M{C - 4.8} 54.5C{C - 3.8} 59 {C - 2.4} 63 {C - 0.6} 67" fill="none" stroke="#fff" stroke-opacity="0.15" stroke-width="1.1" stroke-linecap="round" />
						</g>
						<!-- 매듭(머리) — 감긴 천이라 줄무늬가 날과 반대로, 양옆이 말려 들어간 주름 -->
						<g transform="rotate(-2 {C} 34)">
							<ellipse cx={C} cy="52.5" rx="10" ry="3.2" fill="#000" opacity="0.55" filter="url(#{uid}-blur2)" />
							<path class="knot" d={knot} fill="url(#{uid}-tie-b)" />
							<path d={knot} fill="url(#{uid}-knot)" />
							<path d="M{C - 13.5} 22C{C - 11} 33 {C - 9} 42 {C - 6.5} 49.5M{C + 13.5} 22C{C + 11} 33 {C + 9} 42 {C + 6.5} 49.5" fill="none" stroke="#050a20" stroke-opacity="0.4" stroke-width="1" />
							<path d="M{C - 12} 20C{C - 4} 17.8 {C + 4} 17.8 {C + 12} 20" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="0.9" />
							<path d={knot} fill="none" stroke="#0b1433" stroke-opacity="0.5" stroke-width="0.8" />
						</g>
					</g>
				{/if}

				<!-- 셔츠 칼라 — 목 가운데서 만나 매듭 양옆으로 펼쳐진다 -->
				{#each [-1, 1] as const as s (s)}
					<path class="leaf" d={leaf(s)} fill="url(#{uid}-leaf)" stroke="#c3ccd6" stroke-width="0.8" filter="url(#{uid}-drop)" />
					<path d={leafStitch(s)} fill="none" stroke="#9aa6b3" stroke-opacity="0.5" stroke-width="0.6" stroke-dasharray="1.2 1.4" />
				{/each}

				{#if neck === 'ribbon'}
					<g class="ribbon-tails" filter="url(#{uid}-drop)" transform={RIBBON}>
						<!-- 꼬리 — 매듭 뒤에서 내려와 조끼 속으로 들어간다 (제비꼬리 끝은 조끼 안). 왼쪽이 조금 길게 -->
						<g class="sway tails" style={pivot(C, 32)}>
							{#each [[-1, 1.04, 'b'], [1, 0.94, 'a']] as const as [s, len, k] (s)}
								<g transform="rotate({s * -2.5} {C} 32)">
									<path class="tail" d={tail(s, len)} fill="url(#{uid}-tie-{k})" />
									<path d={tail(s, len)} fill="url(#{uid}-round)" />
									<path d={tail(s, len)} fill="url(#{uid}-tailShade)" />
									<path d={tailFold(s, len)} fill="none" stroke="#050a20" stroke-opacity="0.3" stroke-width="1" />
									<path d={tail(s, len)} fill="none" stroke="#0b1433" stroke-opacity="0.45" stroke-width="0.8" />
								</g>
							{/each}
						</g>
					</g>
				{/if}

				<!-- 회색 조끼 (사진) — 칼라 끝 아래로 넓고 얕은, 아래가 둥근 V 목둘레 · 뜨개 결 + 남색 목둘레 단(골 무늬). 넥타이 날 · 리본 꼬리는 조끼 속으로 -->
				<path class="vest" d={vest} fill="url(#{uid}-knit)" />
				<path d={vest} fill="url(#{uid}-vestShade)" />
				<path d="M{C + 40} 118C{C + 30} 170 {C + 20} 230 {C + 8} 300" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="10" filter="url(#{uid}-blur)" />
				<path d={vLine} fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="2" transform="translate(0 5)" filter="url(#{uid}-soft)" />
				<path class="vneck" d={vLine} fill="none" stroke="#181b30" stroke-width="8" stroke-linecap="round" />
				<path d={vLine} fill="none" stroke="#262a44" stroke-width="6.4" stroke-dasharray="0.7 1.5" />
				<path d={vLine} fill="none" stroke="#5a6080" stroke-opacity="0.35" stroke-width="0.8" transform="translate(0 -3.6)" />

				{#if neck === 'ribbon'}
					<g class="ribbon" filter="url(#{uid}-drop)" transform={RIBBON}>
						<!-- 고리 -->
						<g class="sway loops" style={pivot(C, 25)}>
							{#each [[-1, 'a', 2], [1, 'b', -3]] as const as [s, k, tilt] (s)}
								<g transform="rotate({tilt} {C} 25)">
								<path class="loop" d={loop(s)} fill="url(#{uid}-tie-{k})" />
								<path d={loop(s)} fill="url(#{uid}-knot)" opacity="0.8" />
								<path d={loopInner(s)} fill="#050a20" opacity="0.4" />
								<path d={loopFolds(s)} fill="none" stroke="#050a20" stroke-opacity="0.3" stroke-width="1" stroke-linecap="round" />
								<path d={loopShine(s)} fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="1" stroke-linecap="round" />
								<path d={loopTurn(s)} fill="#fff" opacity="0.13" />
								<path d={loop(s)} fill="none" stroke="#0b1433" stroke-opacity="0.5" stroke-width="0.8" />
								</g>
							{/each}
						</g>
						<!-- 머리(가운데 매듭) — 크게, 조여서 가로 주름 -->
						<path class="bow-knot" d={bowKnot} fill="url(#{uid}-tie-b)" />
						<path d={bowKnot} fill="url(#{uid}-knot)" />
						<path d="M{C - 8.5} 18C{C - 3} 20.5 {C + 3} 20.5 {C + 8.5} 18M{C - 9} 32.5C{C - 3} 30 {C + 3} 30 {C + 9} 32.5M{C - 3} 23C{C - 1} 25 {C + 1} 25 {C + 3} 23" fill="none" stroke="#050a20" stroke-opacity="0.35" stroke-width="0.9" />
						<path d={bowKnot} fill="none" stroke="#0b1433" stroke-opacity="0.55" stroke-width="0.8" />
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
			<path d={front(-0.2)} fill="none" stroke="#02041a" stroke-opacity="0.85" stroke-width="1" />
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

		<!-- 깃의 배지 (대표 업적) — 조금씩 기울게 -->
		{#each slots as s, i (i)}
			{#if s.b}
				{@const b = s.b}
				<button class="pin u-tap" style:left={pct(s.x, W)} style:top={pct(s.y, H)} onclick={() => onpick?.(b)} aria-label="{b.title} 업적 자세히">
					<span class="tilt" style:rotate="{s.tilt}deg"><Badge code={b.code} icon={b.icon} tier={b.tier} title={b.title} size={40} shine delay={i * 260} /></span>
				</button>
			{:else if emptyHref}
				<a class="pin empty" href={emptyHref} style:left={pct(s.x, W)} style:top={pct(s.y, H)} aria-label="대표 업적 비어 있음 · 업적 보기">
					<span aria-hidden="true">+</span>
				</a>
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
</style>
