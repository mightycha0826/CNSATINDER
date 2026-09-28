<script lang="ts">
	/**
	 * 상단 바 오른쪽 ⋯ (메뉴) — 대화방 · 편지 화면이 같이 쓴다. 누름 영역 44×44 (G1), 오른쪽 끝에 붙게 음수 여백.
	 * push = 앞에 늘어나는 것이 없을 때 오른쪽 끝으로 밀어 붙인다 (margin-left: auto).
	 */
	let { onclick, label = '메뉴', push = false }: { onclick: () => void; label?: string; push?: boolean } = $props();
</script>

<button class="more u-tap icon" class:push {onclick} aria-label={label}>
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="5" cy="12" r="1.6" fill="currentColor" />
		<circle cx="12" cy="12" r="1.6" fill="currentColor" />
		<circle cx="19" cy="12" r="1.6" fill="currentColor" />
	</svg>
</button>

<style>
	.more {
		flex: none;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		margin-right: -12px;
	}
	.push {
		margin-left: auto;
	}
	.more svg {
		width: 22px;
		height: 22px;
	}
</style>
