<script lang="ts">
	/** 신고 상세 — 신고자 카드: 낸 신고 · 기각된 신고 (허위 신고 반복 확인용) */
	let { filed, dismissed, filedLabel = '낸 신고' }: { filed: number; dismissed: number; filedLabel?: string } = $props();
</script>

<section class="a-card">
	<h2 class="a-h2">신고자</h2>
	<dl class="a-dl">
		<dt>{filedLabel}</dt>
		<dd class="num">{filed}건</dd>
		<dt>기각된 신고</dt>
		<dd class="num" class:danger={dismissed >= 2}>{dismissed}건</dd>
	</dl>
	{#if dismissed >= 2}
		<p class="a-hint">기각이 반복되는 신고자입니다. 허위 신고 여부를 확인해 주세요.</p>
	{/if}
</section>
