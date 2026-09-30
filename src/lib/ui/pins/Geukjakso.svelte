<script lang="ts">
	/**
	 * 극작소 (연극 동아리) 뱃지 — 실제 에나멜 핀을 그대로 옮긴 그림 (Phase 70, CNSA 분류의 첫 뱃지).
	 * 빨간 상자 위로 솟은 검은 슬레이트(클래퍼보드: 흰 화살 셋 · 점 셋 · 줄 셋) + 오른쪽 아래 막이 걷힌 무대 상자.
	 * 에나멜 핀처럼: 칸마다 검은 금속 테두리가 도드라지고, 에나멜 위에 유리 같은 빛 · 아래로 떨어지는 그림자.
	 * 모양은 사진에서 잰 점 그대로 (viewBox 단위, 사진 픽셀 ÷ 10).
	 */
	let { shine = false, delay = 0 }: { shine?: boolean; delay?: number } = $props();
	const uid = $props.id();

	// 꼭짓점 — A·B 슬레이트 위 · C 슬레이트가 앞면에 닿는 곳 · D·E 옆면 위 · F·G 옆면 아래
	// H·I 무대 상자 위 모서리 · Q 윗면 안쪽 · J·K 무대 앞면 위 · L·M 무대 앞면 아래 · N 무대 옆면 아래 · W 앞면이 무대 뒤로 들어가는 곳
	const P = {
		A: [23, 20], B: [78.5, 6.5], C: [69.5, 44], D: [19, 33.5], E: [36, 49.5], F: [9, 81], G: [26.5, 96],
		H: [86, 41], Q: [84.5, 45.5], I: [108, 59.5], J: [103, 62.5], K: [54.5, 69], L: [99, 96.5], M: [46.5, 106], N: [104.5, 94], W: [48, 99.5]
	} as const;
	const poly = (...k: (keyof typeof P)[]) => k.map((n) => P[n].join(' ')).join(' ');
	const outline = poly('A', 'B', 'C', 'H', 'I', 'N', 'L', 'M', 'W', 'G', 'F', 'D');
</script>

<svg class="pin-art" viewBox="3 0 112 112" aria-hidden="true">
	<defs>
		<clipPath id="{uid}-clip"><polygon points={outline} /></clipPath>
		<linearGradient id="{uid}-red" x1="0" y1="0" x2="0.4" y2="1">
			<stop offset="0" stop-color="#e3262b" />
			<stop offset="1" stop-color="#c3131a" />
		</linearGradient>
		<linearGradient id="{uid}-side" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#b8121a" />
			<stop offset="1" stop-color="#990b12" />
		</linearGradient>
		<linearGradient id="{uid}-slate" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#2d2d33" />
			<stop offset="1" stop-color="#141417" />
		</linearGradient>
		<linearGradient id="{uid}-sweep" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0.3" stop-color="#fff" stop-opacity="0" />
			<stop offset="0.5" stop-color="#fff" stop-opacity="0.75" />
			<stop offset="0.7" stop-color="#fff" stop-opacity="0" />
		</linearGradient>
	</defs>

	<!-- 금속 판 (테두리 · 두께) — 조금 아래로 겹쳐 핀의 옆면처럼 -->
	<polygon points={outline} fill="#1b1b1f" stroke="#1b1b1f" stroke-width="5" stroke-linejoin="round" transform="translate(0 1.6)" />
	<polygon points={outline} fill="#3b3b42" stroke="#4a4a52" stroke-width="4.4" stroke-linejoin="round" />

	<g clip-path="url(#{uid}-clip)" stroke="#26262b" stroke-width="1.9" stroke-linejoin="round">
		<!-- 슬레이트 -->
		<polygon points={poly('A', 'B', 'C', 'E', 'D')} fill="url(#{uid}-slate)" />
		<!-- 빨간 상자: 옆면 · 앞면 -->
		<polygon points={poly('D', 'E', 'G', 'F')} fill="url(#{uid}-side)" />
		<polygon points={poly('E', 'C', 'H', 'Q', 'J', 'K', 'W', 'G')} fill="url(#{uid}-red)" />
		<!-- 무대 상자: 가는 윗면 · 옆면 · 앞면 (앞면 위로는 큰 상자의 앞면이 이어진다) -->
		<polygon points={poly('H', 'I', 'J', 'Q')} fill="#ad0f16" />
		<polygon points={poly('J', 'I', 'N', 'L')} fill="url(#{uid}-side)" />
		<polygon points={poly('K', 'J', 'L', 'M')} fill="url(#{uid}-red)" />
	</g>

	<!-- 슬레이트 무늬 (흰 에나멜) -->
	<g fill="none" stroke="#f3f4f7" stroke-linecap="round" stroke-linejoin="round">
		{#each [[37.5, 23.2], [50, 20.2], [62.5, 17.1]] as [x, y] (x)}
			<path d="M-2.4 -3.2L1.9 0L-2.4 3.2" stroke-width="2.7" transform="translate({x} {y}) rotate(-13.7)" />
		{/each}
		<path d="M27.8 33.6L64 27.2M32 39.6L64.2 33.6M37 45.4L64.6 40.2" stroke-width="1.5" />
		<path d="M42.6 31V37.4M47.6 36.8V43.3" stroke-width="1.3" />
	</g>
	<g fill="#f3f4f7">
		<circle cx="26.8" cy="25.8" r="1.35" />
		<circle cx="24.6" cy="29.6" r="1.25" />
		<circle cx="28.7" cy="29.9" r="1.25" />
	</g>

	<!-- 무대 막 — 위로 드리운 휘장 두 겹 · 양쪽으로 걷어 묶은 막 (금속 선) -->
	<g fill="none" stroke="#3d0a0e" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">
		<path d="M55.8 72C68 78.5 88 76 101.6 66.2M56.6 75.4C69 82 88.5 79.2 101 69.4" />
		<path d="M58 73.4C62.4 80.6 60.2 88.4 53.4 94.4M55.6 76.6C57 84.4 55.6 90 52.2 94.2M52.8 94.8L48.6 104.6M53.2 94.8L54.8 103.6M52.9 94.8L51.6 104.2" />
		<path d="M100.6 66.8C97.6 74.2 97.4 82 99.2 88.4M102.2 69.4C100.2 76.4 100.2 83 100.8 88.4M99.8 88.8L97.4 95.8M100.2 88.8L101.8 95.3" />
	</g>

	<!-- 에나멜 위 유리 빛 — 윗 모서리마다 가는 흰 빛, 오른쪽 위에 넓은 빛 -->
	<g clip-path="url(#{uid}-clip)" fill="none" stroke="#fff" stroke-linecap="round">
		<path d="M38.5 53L67 48.3M22 38.5L33 49" stroke-opacity="0.45" stroke-width="1.4" />
		<path d="M88 44.5L104 59.5" stroke-opacity="0.35" stroke-width="1.2" />
		<path d="M12.5 80L20.5 40" stroke-opacity="0.2" stroke-width="2.2" />
		<path d="M96 84L99.5 67" stroke-opacity="0.18" stroke-width="1.6" />
		<path d="M28 21.5L74 10.5" stroke-opacity="0.25" stroke-width="1.2" />
	</g>

	{#if shine}
		<g clip-path="url(#{uid}-clip)">
			<rect class="sweep" x="-40" y="-10" width="60" height="140" fill="url(#{uid}-sweep)" transform="skewX(-18)" style:--d="{delay}ms" />
		</g>
	{/if}
</svg>

<style>
	.pin-art {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.sweep {
		transform-box: view-box;
		translate: -60px 0;
		animation: pin-sweep 1.9s calc(var(--d) + 0.45s) cubic-bezier(0.45, 0, 0.25, 1) forwards;
	}
	@keyframes pin-sweep {
		to {
			translate: 170px 0;
		}
	}
</style>
