<script lang="ts" module>
	/** 깃에 다는 배지 칸 — 대표 업적 수와 같다 (학교 실제 배지가 늘면 여기서) */
	export const LAPEL_SLOTS = 3;
</script>

<script lang="ts">
	/**
	 * 교복 (Phase 60) — 우리 학교 교복 가슴을 가까이 본 그림. 대표 업적은 깃에 단 배지로, 가슴 주머니 위엔 교표.
	 * 스케치대로 넥타이(가운데)는 왼쪽으로 치우치고, 오른쪽 가슴 · 깃이 넓게 보인다.
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
	/** 몸 가운데 (넥타이 · 단추 줄) — 오른쪽 가슴을 넓게 보이려고 왼쪽으로 */
	const C = 118;
	// 오른쪽 깃(보는 사람 기준) — 안쪽 선 위 → 꺾이는 곳, 바깥 선 아래 끝 → 노치 → 칼라 위
	const lapel = (s: 1 | -1) =>
		[
			[34, 0],
			[4, 226],
			[116, 94],
			[100, 80],
			[108, 66],
			[68, 0]
		]
			.map(([x, y], i) => `${i ? 'L' : 'M'}${C + s * x} ${y}`)
			.join('') + 'Z';
	// 배지 자리 — 깃을 따라 위에서 아래로. 칸 사이 64 — 폰 폭 280 에서 그림이 0.69배로 줄어도 누름 영역 44 가 겹치지 않게
	const SLOTS = [
		[C + 74, 92],
		[C + 54, 156],
		[C + 34, 220]
	].slice(0, LAPEL_SLOTS);
	const slots = $derived(SLOTS.map(([x, y], i) => ({ x, y, b: badges[i] as BadgeLite | undefined })));
	const pct = (v: number, of: number) => `${(v / of) * 100}%`;
</script>

<div class="uniform" data-neck={neck} role="group" aria-label="교복 · 대표 업적 {badges.length}개">
	<svg viewBox="0 0 {W} {H}" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
		<defs>
			<!-- 넥타이 · 리본 무늬: 남색 바탕 + 하늘색 사선 줄 + 작은 물방울 (사진 1~4) -->
			<pattern id="{uid}-tie" patternUnits="userSpaceOnUse" width="18" height="18" patternTransform="rotate(-38)">
				<rect width="18" height="18" fill="#1b2a5c" />
				<rect y="0" width="18" height="5.5" fill="#a9d3ee" />
				<rect y="5.5" width="18" height="1.2" fill="#e8f4fb" />
				<circle cx="4.5" cy="12" r="1.6" fill="#7fc2e8" />
				<circle cx="13.5" cy="12" r="1.6" fill="#7fc2e8" />
			</pattern>
			<linearGradient id="{uid}-cloth" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#2a3263" />
				<stop offset="0.55" stop-color="#1e2550" />
				<stop offset="1" stop-color="#161b3d" />
			</linearGradient>
			<linearGradient id="{uid}-lapel" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="#343d78" />
				<stop offset="1" stop-color="#252d5d" />
			</linearGradient>
			<linearGradient id="{uid}-shirt" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#f7fafc" />
				<stop offset="1" stop-color="#dfe7ee" />
			</linearGradient>
			<radialGradient id="{uid}-light" cx="30%" cy="0%" r="90%">
				<stop offset="0" stop-color="#fff" stop-opacity="0.12" />
				<stop offset="1" stop-color="#fff" stop-opacity="0" />
			</radialGradient>
		</defs>

		<!-- 재킷 몸판 (전체 바탕) -->
		<rect width={W} height={H} fill="url(#{uid}-cloth)" />

		<!-- 앞섶 사이로 보이는 셔츠 · 조끼 -->
		<path d="M{C - 34} 0H{C + 34}L{C + 4} 214H{C - 4}Z" fill="url(#{uid}-shirt)" />
		{#if neck === 'tie'}
			<!-- 넥타이: 매듭 + 날 (조끼 속으로 들어간다) -->
			<path d="M{C - 9} 44L{C + 9} 44L{C + 16} 170L{C} 186L{C - 16} 170Z" fill="url(#{uid}-tie)" />
			<path d="M{C - 13} 24H{C + 13}L{C + 9} 46H{C - 9}Z" fill="url(#{uid}-tie)" />
			<path d="M{C - 13} 24H{C + 13}L{C + 9} 46H{C - 9}Z" fill="#000" opacity="0.15" />
		{/if}
		<!-- 회색 V넥 조끼 (사진 3~5) -->
		<path d="M{C - 31} 20L{C} 150L{C + 31} 20L{C + 4} 214H{C - 4}Z" fill="#595d66" />
		<path d="M{C - 31} 20L{C} 150L{C + 31} 20" fill="none" stroke="#3f4249" stroke-width="3" />
		<!-- 셔츠 칼라 -->
		<path d="M{C - 36} 0L{C - 2} 22L{C - 14} 44L{C - 40} 12Z" fill="#fbfdff" stroke="#c9d4de" stroke-width="1" />
		<path d="M{C + 36} 0L{C + 2} 22L{C + 14} 44L{C + 40} 12Z" fill="#fbfdff" stroke="#c9d4de" stroke-width="1" />

		<!-- 깃 (노치 라펠) — 몸판 위로 살짝 뜬 그림자 + 가장자리에 새틴 광 -->
		{#each [-1, 1] as const as s (s)}
			<path d={lapel(s)} fill="#0a0d24" opacity="0.5" transform="translate({s * 3} 4)" />
			<path d={lapel(s)} fill="url(#{uid}-lapel)" />
			<path d={lapel(s)} fill="none" stroke="#9aa4d6" stroke-opacity="0.45" stroke-width="1.6" stroke-linejoin="round" />
		{/each}

		<!-- 단추 -->
		<circle cx={C + 4} cy="250" r="7" fill="#2e3563" stroke="#0e1230" stroke-width="1.5" />
		<circle cx={C + 4} cy="250" r="2.4" fill="#0e1230" opacity="0.6" />

		<!-- 가슴 주머니 + 교표 (보는 사람 기준 오른쪽) -->
		<path d="M{C + 128} 118L{C + 214} 112L{C + 215} 118L{C + 129} 124Z" fill="#141938" />
		<path d="M{C + 128} 118L{C + 214} 112" stroke="#8d97c9" stroke-opacity="0.35" stroke-width="1.2" />
		<image href="/school-crest.png" x={C + 136} y="128" width="72" height="75.5" />

		{#if neck === 'ribbon'}
			<!-- 리본: 양쪽 고리 + 매듭 + 꼬리 두 개 (사진 2 · 4 · 5) -->
			<g>
				<path d="M{C - 6} 44L{C - 22} 112L{C - 10} 108L{C - 4} 118L{C + 2} 48Z" fill="url(#{uid}-tie)" />
				<path d="M{C + 6} 44L{C + 24} 110L{C + 12} 106L{C + 6} 116L{C - 2} 48Z" fill="url(#{uid}-tie)" />
				<path d="M{C - 8} 36C{C - 30} 16 {C - 52} 20 {C - 50} 40C{C - 48} 60 {C - 26} 60 {C - 8} 48Z" fill="url(#{uid}-tie)" />
				<path d="M{C + 8} 36C{C + 30} 16 {C + 52} 20 {C + 50} 40C{C + 48} 60 {C + 26} 60 {C + 8} 48Z" fill="url(#{uid}-tie)" />
				<path d="M{C - 8} 36C{C - 30} 16 {C - 52} 20 {C - 50} 40C{C - 48} 60 {C - 26} 60 {C - 8} 48Z" fill="none" stroke="#0e1640" stroke-opacity="0.5" />
				<path d="M{C + 8} 36C{C + 30} 16 {C + 52} 20 {C + 50} 40C{C + 48} 60 {C + 26} 60 {C + 8} 48Z" fill="none" stroke="#0e1640" stroke-opacity="0.5" />
				<!-- 고리 안쪽 주름 -->
				<path d="M{C - 10} 40C{C - 26} 34 {C - 38} 36 {C - 42} 42C{C - 34} 44 {C - 22} 46 {C - 10} 45Z" fill="#0b1433" opacity="0.35" />
				<path d="M{C + 10} 40C{C + 26} 34 {C + 38} 36 {C + 42} 42C{C + 34} 44 {C + 22} 46 {C + 10} 45Z" fill="#0b1433" opacity="0.35" />
				<rect x={C - 9} y="33" width="18" height="18" rx="4" fill="url(#{uid}-tie)" />
				<rect x={C - 9} y="33" width="18" height="18" rx="4" fill="#000" opacity="0.18" />
			</g>
		{/if}

		<!-- 위에서 비치는 빛 -->
		<rect width={W} height={H} fill="url(#{uid}-light)" />
	</svg>

	<!-- 깃의 배지 (대표 업적) -->
	{#each slots as s, i (i)}
		{#if s.b}
			{@const b = s.b}
			<button class="pin u-tap" style:left={pct(s.x, W)} style:top={pct(s.y, H)} onclick={() => onpick?.(b)} aria-label="{b.title} 업적 자세히">
				<Badge code={b.code} icon={b.icon} tier={b.tier} title={b.title} size={40} />
			</button>
		{:else if emptyHref}
			<a class="pin empty" href={emptyHref} style:left={pct(s.x, W)} style:top={pct(s.y, H)} aria-label="대표 업적 비어 있음 · 업적 보기">
				<span aria-hidden="true">+</span>
			</a>
		{/if}
	{/each}
</div>

<style>
	.uniform {
		position: relative;
		width: 100%;
		aspect-ratio: 360 / 280;
		border-radius: var(--r-card);
		overflow: hidden;
		background: #1e2550;
		box-shadow: var(--shadow-1);
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
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
		filter: drop-shadow(0 3px 3px rgb(5 8 25 / 0.55));
		text-decoration: none;
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
