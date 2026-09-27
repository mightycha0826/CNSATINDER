<script lang="ts">
	/**
	 * 편지지 한 장 (읽기, Phase 32) — 봉투에서 꺼낸 편지. To. (손글씨) · 날짜 · 본문(서식 그대로) · From. (손글씨).
	 * 모양은 app.css 의 .letter-paper (쓰는 편지지와 같은 종이) — 줄 친 미색 종이, 왼쪽 여백선, 뒤에 한 장 더 겹친 그림자.
	 */
	import '@fontsource/nanum-pen-script/index.css';
	import RichText from './RichText.svelte';
	import type { LetterFmt } from './rich';

	let {
		to,
		toSub = '',
		from,
		date,
		body,
		fmt = null,
		removed = false
	}: { to: string; toSub?: string; from: string; date: string; body: string | null; fmt?: LetterFmt | null; removed?: boolean } = $props();
</script>

<article class="letter-paper stacked" aria-label="{from}의 편지">
	<div class="lp-head">
		<p class="lp-to">To. {to}{#if toSub}<small>{toSub}</small>{/if}</p>
		<time class="lp-date">{date}</time>
	</div>
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
	/* 편지지 한 장 높이 — 짧은 편지도 종이처럼, 서명(From.)은 맨 아래 */
	article {
		display: flex;
		flex-direction: column;
		min-height: min(62dvh, 560px);
	}
	article :global(.lp-from) {
		margin-top: auto;
		padding-top: 16px;
	}
	.removed {
		font-style: italic;
		opacity: 0.6;
	}
</style>
