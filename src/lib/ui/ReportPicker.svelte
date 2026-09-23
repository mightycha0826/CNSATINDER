<script lang="ts" module>
	import type { ReportReason } from '$lib/chat/types';

	/** 신고 사유 — 채팅과 익명편지가 같은 목록을 쓴다 (서버 check 제약과 같은 값) */
	const REASONS: { v: ReportReason; label: string }[] = [
		{ v: 'personal_info', label: '이름·학번·SNS를 캐물어요' },
		{ v: 'sexual', label: '성적인 말을 해요' },
		{ v: 'harassment', label: '욕설·괴롭힘' },
		{ v: 'hate', label: '혐오 표현' },
		{ v: 'impersonation', label: '다른 사람인 척해요' },
		{ v: 'spam', label: '도배·광고' },
		{ v: 'other', label: '기타' }
	];
</script>

<script lang="ts">
	/** 신고 시트 윗부분 — 사유 고르기 + 운영진에게 남길 말. 제출 버튼은 시트 쪽에 둔다. */
	let {
		reason = $bindable(null),
		note = $bindable(''),
		title,
		intro
	}: { reason?: ReportReason | null; note?: string; title: string; intro: string } = $props();
</script>

<div class="report">
	<h3>{title}</h3>
	<p class="warn left">{intro}</p>
	<div class="reasons">
		{#each REASONS as r (r.v)}
			<button class="reason" class:on={reason === r.v} onclick={() => (reason = r.v)}>{r.label}</button>
		{/each}
	</div>
	<textarea class="note" bind:value={note} rows="2" maxlength="1000" placeholder="운영진에게 더 알려줄 내용 (선택)"></textarea>
</div>

<style>
	.report {
		padding: 8px var(--pad) 12px;
	}
	h3 {
		margin: 4px 0 8px;
		font-size: 16px;
		font-weight: 700;
	}
	.reasons {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 10px;
	}
	.reason {
		height: 34px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 14px;
	}
	.reason.on {
		border-color: var(--text);
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
	}
	.note {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		background: var(--surface);
		outline: none;
		resize: none;
		font-size: 14px;
	}
</style>
