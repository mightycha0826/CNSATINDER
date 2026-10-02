<script lang="ts">
	/**
	 * MSMP 우수 금뱃지 — 실제 금 핀을 그대로 옮긴 그림 (Phase 71).
	 * 육각형 금판 = 비스듬히 본 정육면체. 가장자리를 따라 도드라진 테, 가운데에서 세 모서리가 갈라지고
	 * 세 면마다 도드라진 금 막대(글자 획)가 면의 결을 따라 놓인다. 오른쪽 아래 칸에는 "MSMP" 가 새겨져 있다.
	 * 모두 한 덩어리 금이라 색 대신 빛으로 구분한다 — 도드라진 선은 위가 밝고 아래로 그림자.
	 * 모양은 사진에서 잰 점 그대로 (사진을 격자에 대고 잰 것, 사진 픽셀 × 0.1).
	 */
	let { shine = false, delay = 0 }: { shine?: boolean; delay?: number } = $props();
	const uid = $props.id();

	type Pt = readonly [number, number];
	const pts = (...p: Pt[]) => p.map((q) => q.join(' ')).join(' ');
	// 바깥 육각형 · 안쪽 도드라진 테 (위 → 오른쪽 위 → 오른쪽 아래 → 아래 → 왼쪽 아래 → 왼쪽 위)
	const hex = pts([62.8, 4], [107.5, 38.5], [103, 90.5], [56, 110.5], [3.5, 78.5], [8, 26.2]);
	const T: Pt = [62.5, 8.8], UR: Pt = [103, 41.5], LR: Pt = [99, 88], B: Pt = [56, 106], LL: Pt = [8.5, 76], UL: Pt = [12.8, 28.5];
	const C: Pt = [56.5, 62];
	const rim = pts(T, UR, LR, B, LL, UL);
	// 세 면 (윗면 · 왼면 · 오른면) — 빛이 조금씩 다르게
	const faceTop = pts(UL, T, UR, C);
	const faceLeft = pts(UL, C, B, LL);
	const faceRight = pts(C, UR, LR, B);
	// 도드라진 선 — 정육면체 모서리 셋 · 면마다 글자 획 · 오른쪽 아래 글자 칸의 테
	const RIDGES = [
		`M${UL.join(' ')}L${C.join(' ')}L${UR.join(' ')}M${C.join(' ')}L${B.join(' ')}`,
		'M29.5 38L60.5 23.8M44.5 50.8L74.5 36.2',
		'M25 54.2L54 73.5M11 61L41 83',
		'M70.5 69L89.5 62.5',
		'M67.8 100.5L68.8 85L99 71.7'
	].join('');
</script>

<svg class="pin-art" viewBox="0 1.5 111 111" aria-hidden="true">
	<defs>
		<clipPath id="{uid}-clip"><polygon points={hex} /></clipPath>
		<linearGradient id="{uid}-gold" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#fff0a8" />
			<stop offset="0.3" stop-color="#f0c94a" />
			<stop offset="0.55" stop-color="#d9a722" />
			<stop offset="0.78" stop-color="#f6d766" />
			<stop offset="1" stop-color="#b8820f" />
		</linearGradient>
		<linearGradient id="{uid}-top" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#f7dc72" />
			<stop offset="1" stop-color="#e8bf3c" />
		</linearGradient>
		<linearGradient id="{uid}-left" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#e9c243" />
			<stop offset="0.7" stop-color="#d4a522" />
			<stop offset="1" stop-color="#fbe08a" />
		</linearGradient>
		<linearGradient id="{uid}-right" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#dcb02c" />
			<stop offset="1" stop-color="#c8951a" />
		</linearGradient>
		<linearGradient id="{uid}-sweep" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0.3" stop-color="#fff" stop-opacity="0" />
			<stop offset="0.5" stop-color="#fff" stop-opacity="0.8" />
			<stop offset="0.7" stop-color="#fff" stop-opacity="0" />
		</linearGradient>
	</defs>

	<!-- 금판 두께 · 바탕 -->
	<polygon points={hex} fill="#8a5f08" stroke="#8a5f08" stroke-width="2" stroke-linejoin="round" transform="translate(0 1.8)" />
	<polygon points={hex} fill="url(#{uid}-gold)" stroke="#fbe7a0" stroke-width="1" stroke-linejoin="round" />

	<!-- 세 면 -->
	<polygon points={faceTop} fill="url(#{uid}-top)" />
	<polygon points={faceLeft} fill="url(#{uid}-left)" />
	<polygon points={faceRight} fill="url(#{uid}-right)" />

	<!-- 도드라진 테 · 선: 아래 그림자 → 몸 → 위쪽 빛 -->
	<g fill="none" stroke-linecap="square" stroke-linejoin="miter">
		<polygon points={rim} stroke="#9a6b0c" stroke-width="2.6" transform="translate(0.5 0.9)" />
		<path d={RIDGES} stroke="#9a6b0c" stroke-width="2.6" transform="translate(0.5 0.9)" />
		<polygon points={rim} stroke="#e7b737" stroke-width="2.4" />
		<path d={RIDGES} stroke="#e7b737" stroke-width="2.4" />
		<polygon points={rim} stroke="#fff6c8" stroke-width="0.8" transform="translate(-0.4 -0.6)" />
		<path d={RIDGES} stroke="#fff6c8" stroke-width="0.8" transform="translate(-0.4 -0.6)" />
	</g>

	<!-- 글자 칸 — MSMP (오른면의 결을 따라 기울어진 새김) -->
	<g transform="translate(72.5 94.8) skewY(-23.5)" font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="6.2" letter-spacing="0.3">
		<text x="0.3" y="0.55" fill="#9a6b0c">MSMP</text>
		<text fill="#fff3bc">MSMP</text>
	</g>

	<!-- 광택 — 왼쪽 아래 모서리의 강한 빛 · 윗면의 긁힌 듯한 결 -->
	<g clip-path="url(#{uid}-clip)" fill="none" stroke="#fff" stroke-linecap="round">
		<path d="M10 86L38 103" stroke-opacity="0.75" stroke-width="2.6" />
		<path d="M20 30L58 13M34 45L78 25" stroke-opacity="0.18" stroke-width="3.4" />
		<path d="M60 66V100" stroke-opacity="0.35" stroke-width="1.4" />
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
