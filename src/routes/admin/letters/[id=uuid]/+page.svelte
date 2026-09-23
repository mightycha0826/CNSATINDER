<script lang="ts">
	import { enhance } from '$app/forms';
	import { REASON_LABEL, fmtTime } from '$lib/adminTypes';
	import { confirmed } from '$lib/admin/confirm';
	import FormMsg from '$lib/admin/FormMsg.svelte';
	import IdentityCard from '$lib/admin/IdentityCard.svelte';
	import ReportHeader from '$lib/admin/ReportHeader.svelte';
	import ReportedCard from '$lib/admin/ReportedCard.svelte';
	import ReporterCard from '$lib/admin/ReporterCard.svelte';
	import SanctionForm from '$lib/admin/SanctionForm.svelte';

	let { data, form } = $props();
	const d = $derived(data.d);
	const r = $derived(d.report);
	const admin = $derived(data.staff?.role === 'admin');

	const KIND: Record<string, string> = { letter: '편지 본문', parent: '답글이 달린 댓글', comment: '신고한 댓글' };

	const live = $derived(
		r.comment_id ? d.target.comment_status === 'visible' && d.target.letter_status === 'open' : d.target.letter_status === 'open'
	);

	const askRemove = confirmed(
		() => `이 ${r.comment_id ? '댓글' : '편지'}를 내릴까요? 학생들에게 더 이상 보이지 않고, 기록이 남습니다.`
	);
</script>

<ReportHeader
	back={{ href: '/admin/letters', label: '편지 신고 목록' }}
	title="{r.target_type === 'letter' ? '편지' : '댓글'} · {REASON_LABEL[r.reason] ?? r.reason}"
	report={r}
/>
<FormMsg {form} />

<div class="a-grid">
	<section class="a-col">
		<div>
			<h2 class="a-h2">신고 시점 사본 <span class="muted">{d.evidence.length}개</span></h2>
			{#if r.note}<p class="rnote"><b>신고자 메모</b> {r.note}</p>{/if}
			<div class="msgs">
				{#each d.evidence as e (e.ord)}
					<div class="m" class:target={e.kind === 'comment' || (e.kind === 'letter' && !r.comment_id)}>
						<div class="m-head">
							<span class="kind">{KIND[e.kind] ?? e.kind}</span>
							<span class="muted">{e.alias ?? ''} · {fmtTime(e.sent_at)}</span>
						</div>
						<p class="body">{e.body}</p>
					</div>
				{/each}
			</div>
			<p class="a-hint">이름은 그 편지 안에서만 쓰는 임시 이름입니다. 다른 편지·채팅과 이어지지 않습니다.</p>
		</div>
	</section>

	<aside class="a-aside">
		<section class="a-card">
			<h2 class="a-h2">글 상태</h2>
			<p class="now">
				{#if live}<b>학생들에게 보이는 중</b>{:else}<span class="muted">내려짐 (작성자 삭제 또는 운영진 조치)</span>{/if}
			</p>
			{#if live}
				<form method="POST" action="?/remove" use:enhance={askRemove}>
					<button class="btn a-danger-btn">{r.comment_id ? '댓글 내리기' : '편지 내리기'}</button>
				</form>
			{/if}
		</section>

		<ReportedCard
			title="작성자"
			reported={d.reported}
			history={d.history}
			historyLabel="다른 편지 신고"
			historyHref="/admin/letters"
		>
			{#snippet extra()}
				<dt>채팅 신고</dt>
				<dd class="num" class:danger={d.chat_reports > 0}>{d.chat_reports}건</dd>
			{/snippet}
		</ReportedCard>
		<ReporterCard filed={d.reporter_filed} dismissed={d.reporter_dismissed} filedLabel="낸 편지 신고" />

		<section class="a-card">
			<h2 class="a-h2">조치</h2>
			<SanctionForm
				isAdmin={admin}
				banned={d.reported?.status === 'banned'}
				targets={[
					{ v: 'reported', label: '작성자' },
					{ v: 'reporter', label: '신고자' }
				]}
			/>
		</section>

		<section class="a-card">
			<div class="a-links">
				{#if admin}<a href="/admin/posts/{r.letter_id}">편지 전체 · 참여자 보기 →</a>{/if}
				<a href="/admin/users/{r.reported_id}">작성자 계정 →</a>
				<a href="/admin/users/{r.reporter_id}">신고자 계정 →</a>
			</div>
		</section>

		{#if admin}<IdentityCard {form} reportedLabel="작성자" />{/if}
	</aside>
</div>

<style>
	.rnote {
		margin: 0 0 10px;
		padding: 10px 12px;
		background: var(--surface);
		border-radius: var(--r-sm);
		font-size: 13px;
		line-height: 1.6;
	}
	.msgs {
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
	}
	.m {
		padding: 10px 12px;
		border-top: 1px solid var(--line);
	}
	.m:first-child {
		border-top: 0;
	}
	.m.target {
		background: color-mix(in srgb, var(--danger) 6%, transparent);
	}
	.m-head {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 12px;
	}
	.kind {
		font-weight: 700;
	}
	.m.target .kind {
		color: var(--danger);
	}
	.body {
		margin: 6px 0 0;
		font-size: 14px;
		line-height: 1.6;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.now {
		margin: 0 0 10px;
		font-size: 13px;
	}
</style>
