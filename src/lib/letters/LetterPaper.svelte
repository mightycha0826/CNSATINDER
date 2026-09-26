<script lang="ts">
	/**
	 * 편지 한 장 (보기) — To. 받는 사람 · 내용(서식 그대로) · From. 보낸 사람.
	 * 편지 화면에서 편지로 주고받은 말을 이렇게 그린다 (채팅 한 줄은 말풍선).
	 */
	import RichText from './RichText.svelte';
	import type { LetterFmt } from './rich';

	let {
		to,
		from,
		body,
		fmt = null,
		removed = false,
		mine = false
	}: { to: string; from: string; body: string | null; fmt?: LetterFmt | null; removed?: boolean; mine?: boolean } = $props();
</script>

<article class="letter-paper card" class:mine aria-label="{from}의 편지">
	<p class="lp-to">To. {to}</p>
	{#if removed}
		<p class="lp-body removed">운영진이 내린 편지예요</p>
	{:else}
		<div class="lp-body selectable">
			{#if fmt}<RichText body={body ?? ''} {fmt} />{:else}{body}{/if}
		</div>
	{/if}
	<p class="lp-from">From. {from}</p>
</article>

<style>
	/* 내 편지는 오른쪽으로, 받은 편지는 왼쪽으로 살짝 — 누가 쓴 편지인지 한눈에 */
	.card {
		margin-right: 28px;
	}
	.card.mine {
		margin-right: 0;
		margin-left: 28px;
	}
	.removed {
		font-style: italic;
		opacity: 0.6;
	}
</style>
