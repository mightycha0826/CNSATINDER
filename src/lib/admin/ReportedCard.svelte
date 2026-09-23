<script lang="ts">
	/** 신고 상세 — 피신고자(작성자) 카드: 상태 · 경고 · 같은 사람이 받은 다른 신고 */
	import type { Snippet } from 'svelte';
	import { REASON_LABEL, STATUS_LABEL, fmtTime, type ReportStatus } from '$lib/adminTypes';
	import AccountStatus from './AccountStatus.svelte';

	let {
		title,
		reported,
		history,
		historyLabel,
		historyHref,
		extra
	}: {
		title: string;
		reported: { status: string; strikes: number; suspended_until: string | null } | null;
		history: { id: string; created_at: string; reason: string; status: ReportStatus }[];
		historyLabel: string;
		/** 다른 신고 상세 주소의 앞부분 (/admin/reports) */
		historyHref: string;
		/** 목록 끝에 더할 줄 (dt/dd) */
		extra?: Snippet;
	} = $props();
</script>

<section class="a-card">
	<h2 class="a-h2">{title}</h2>
	<dl class="a-dl">
		<dt>상태</dt>
		<dd><AccountStatus account={reported} /></dd>
		<dt>경고 누적</dt>
		<dd class="num">{reported?.strikes ?? 0}회</dd>
		<dt>{historyLabel}</dt>
		<dd class="num" class:danger={history.length > 0}>{history.length}건</dd>
		{@render extra?.()}
	</dl>
	{#if history.length}
		<ul class="a-list hist">
			{#each history as h (h.id)}
				<li>
					<a href="{historyHref}/{h.id}">{fmtTime(h.created_at)} · {REASON_LABEL[h.reason] ?? h.reason}</a>
					<span class="st st-{h.status}">{STATUS_LABEL[h.status]}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.hist {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
		font-size: 12px;
	}
</style>
