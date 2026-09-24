<script lang="ts">
	/** 말풍선 아래 모서리의 공감 표시 — 내 말풍선은 오른쪽, 상대는 왼쪽. 누르면 공감 고르기. */
	import type { ReactionSummary } from './reactions';

	let { summary, mine, onclick }: { summary: ReactionSummary; mine: boolean; onclick: (e: MouseEvent) => void } =
		$props();
</script>

<button
	class="reacts"
	class:mine
	{onclick}
	aria-label="공감 {summary.emojis.join(' ')}{summary.count ? ' 2개' : ''}"
>
	{#each summary.emojis as e, i (i)}<span>{e}</span>{/each}
	{#if summary.count}<span class="n">{summary.count}</span>{/if}
</button>

<style>
	.reacts {
		position: absolute;
		bottom: -15px;
		left: 8px;
		display: flex;
		align-items: center;
		gap: 1px;
		height: 22px;
		padding: 0 6px;
		border-radius: 999px;
		border: 2px solid var(--bg);
		background: var(--field);
		font-size: 12px;
		line-height: 1;
	}
	.reacts.mine {
		left: auto;
		right: 8px;
	}
	.n {
		margin-left: 2px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-2);
	}
</style>
