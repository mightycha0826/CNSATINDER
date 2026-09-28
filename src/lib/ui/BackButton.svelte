<script lang="ts">
	/**
	 * 상단 바 왼쪽 뒤로가기.
	 * history = true 면 브라우저 뒤로가기(스크롤 자리 유지 · 기록이 쌓이지 않음), 들어온 기록이 없으면(알림으로 바로 열림)
	 * href 로 바꿔 끼운다 — lib/nav.ts goBack. false 면 href 로 이동.
	 */
	import { goto } from '$app/navigation';
	import { goBack } from '$lib/nav';

	let { href = '/', history: useHistory = false }: { href?: string; history?: boolean } = $props();

	function back() {
		if (useHistory) goBack(href);
		else void goto(href);
	}
</script>

<button class="back" onclick={back} aria-label="뒤로">
	<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
	</svg>
</button>

<style>
	/* 누름 영역 44×44 (G1) — 화살표 자리는 예전(28칸, -4)과 같게 음수 여백으로 맞춘다 */
	.back {
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		margin: 0 -8px 0 -12px;
		transition:
			opacity 0.2s,
			transform 0.2s;
	}
	/* 설정 화면의 둥근 40칸 단추(.topbar.ios)도 누름은 44 */
	.back::after {
		content: '';
		position: absolute;
		inset: min(0px, calc(50% - 22px));
	}
	.back:active {
		opacity: 0.55;
		transform: scale(0.92);
		transition-duration: 0.08s;
	}
	svg {
		width: 24px;
		height: 24px;
	}
</style>
