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
	/* 배지는 22 지만 누름은 44 (G1) — 말풍선 아래 자리는 ChatView .bwrap.reacted 가 비워 둔다.
	   넓힌 영역은 말풍선 밑에 깐다(z-index -1, 쌓임 기준은 ChatView .bwrap): 위로 넓힌 만큼이 말풍선 아래쪽 절반을 덮어
	   길게 누르기 · 두 번 톡 · 밀기 · 오른쪽 클릭 · 글자 고르기를 배지가 가로채던 것 (G1.3). 보이는 배지는 그대로 말풍선 위 */
	.reacts::after {
		content: '';
		position: absolute;
		inset: min(-2px, calc(50% - 22px));
		z-index: -1;
	}
	.reacts:active {
		transform: scale(0.9);
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
