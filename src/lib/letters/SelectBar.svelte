<script lang="ts">
	/**
	 * 편지 고르는 중의 아래 막대 (Phase 47) — 보관함 · 폴더 화면. "n통 골랐어요" + 할 일 단추들(children).
	 * 화면 아래(아이폰 홈 막대 위)에 붙는다. 아무것도 안 골랐으면 안내만.
	 */
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import { reducedMotion } from '$lib/motion';

	let { count, children }: { count: number; children: Snippet } = $props();
</script>

<div class="bar" role="region" aria-label="고른 편지" transition:fly={{ y: 80, duration: reducedMotion() ? 0 : 220 }}>
	<p class="count" aria-live="polite">{count ? `${count}통 골랐어요` : '폴더에 넣을 편지를 골라 주세요'}</p>
	<div class="acts">{@render children()}</div>
</div>

<style>
	.bar {
		position: fixed;
		left: 50%;
		bottom: 0;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
		width: min(100%, 520px);
		padding: 12px var(--pad) calc(12px + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		background: var(--glass);
		-webkit-backdrop-filter: saturate(180%) blur(20px);
		backdrop-filter: saturate(180%) blur(20px);
		border-top: 1px solid var(--glass-line);
	}
	.count {
		flex: 1 1 auto;
		margin: 0;
		font-size: 14px;
		font-weight: 700;
	}
	.acts {
		display: flex;
		flex: 0 1 auto;
		gap: 8px;
		margin-left: auto;
	}
	.acts :global(button) {
		height: 46px;
		padding: 0 18px;
		border-radius: 999px;
		font-size: 15px;
		font-weight: 800;
		white-space: nowrap;
	}
	.acts :global(.go) {
		background: var(--accent-fill-deep);
		color: var(--on-accent);
	}
	.acts :global(.go:disabled) {
		background: var(--field);
		color: var(--text-2);
	}
	.acts :global(.plain) {
		background: var(--field);
	}
	.acts :global(button:active:not(:disabled)) {
		transform: scale(0.96);
	}
</style>
