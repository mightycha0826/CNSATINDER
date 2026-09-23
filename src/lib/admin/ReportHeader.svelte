<script lang="ts">
	/** 신고 상세 머리 — 목록으로 · 제목 · 접수 시각과 상태 · 검토 시작/기각/다시 열기 */
	import { enhance } from '$app/forms';
	import { STATUS_LABEL, fmtTime, type ReportStatus } from '$lib/adminTypes';

	let {
		back,
		title,
		report
	}: { back: { href: string; label: string }; title: string; report: { created_at: string; status: ReportStatus } } =
		$props();
</script>

<a class="a-back" href={back.href}>← {back.label}</a>

<header class="a-head">
	<div>
		<h1 class="a-h1">{title}</h1>
		<p class="a-sub">{fmtTime(report.created_at)} 접수 · <span class="st st-{report.status}">{STATUS_LABEL[report.status]}</span></p>
	</div>
	<form class="actions" method="POST" action="?/status" use:enhance>
		{#if report.status === 'open'}
			<button class="btn-ghost a-sm" name="status" value="reviewing">검토 시작</button>
		{/if}
		{#if report.status !== 'dismissed'}
			<button class="btn-ghost a-sm" name="status" value="dismissed">기각</button>
		{:else}
			<button class="btn-ghost a-sm" name="status" value="open">다시 열기</button>
		{/if}
	</form>
</header>

<style>
	.actions {
		display: flex;
		gap: 6px;
	}
</style>
