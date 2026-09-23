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
	.back {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		margin-left: -4px;
	}
	svg {
		width: 24px;
		height: 24px;
	}
</style>
