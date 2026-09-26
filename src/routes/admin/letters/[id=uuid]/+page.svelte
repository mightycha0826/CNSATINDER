<script lang="ts">
	import { enhance } from '$app/forms';
	import { REASON_LABEL, TARGET_LABEL, fmtTime } from '$lib/adminTypes';
	import { confirmed } from '$lib/admin/confirm';
	import FormMsg from '$lib/admin/FormMsg.svelte';
	import IdentityCard from '$lib/admin/IdentityCard.svelte';
	import ReportHeader from '$lib/admin/ReportHeader.svelte';
	import ReportedCard from '$lib/admin/ReportedCard.svelte';
	import ReporterCard from '$lib/admin/ReporterCard.svelte';
	import AutoReportCard from '$lib/admin/AutoReportCard.svelte';
	import SanctionForm from '$lib/admin/SanctionForm.svelte';

	let { data, form } = $props();
	const d = $derived(data.d);
	const r = $derived(d.report);
	const admin = $derived(data.staff?.role === 'admin');

	const KIND: Record<string, string> = {
		letter: '편지 본문',
		parent: '답글이 달린 댓글',
		comment: '신고한 댓글',
		dm_sender: '보낸 사람 (받는 사람에게는 익명)',
		dm_recipient: '받는 사람'
	};
	const dm = $derived(r.target_type === 'dm');

	const live = $derived(
		dm
			? d.target.thread_status != null && d.target.thread_status !== 'removed'
			: r.comment_id
				? d.target.comment_status === 'visible' && d.target.letter_status === 'open'
				: d.target.letter_status === 'open'
	);
	const what = $derived(dm ? '편지' : r.comment_id ? '댓글' : '편지');

	const askRemove = confirmed(
		() =>
			dm
				? '이 편지를 내릴까요? 보낸 사람 · 받는 사람 모두에게서 사라지고, 기록이 남습니다.'
				: `이 ${what}를 내릴까요? 학생들에게 더 이상 보이지 않고, 기록이 남습니다.`
	);
</script>

<ReportHeader
	back={{ href: '/admin/letters', label: '편지 신고 목록' }}
	title="{TARGET_LABEL[r.target_type] ?? r.target_type} · {REASON_LABEL[r.reason] ?? r.reason}"
	report={r}
/>
<FormMsg {form} />

<div class="a-grid">
	<section class="a-col">
		<div>
			<h2 class="a-h2">신고 시점 사본 <span class="muted">{d.evidence.length}개</span></h2>
			{#if r.note}<p class="rnote selectable"><b>{r.source === 'auto' ? 'AI 판정' : '신고자 메모'}</b> {r.note}</p>{/if}
			<div class="msgs">
				{#each d.evidence as e (e.ord)}
					<div class="m" class:target={!dm && (e.kind === 'comment' || (e.kind === 'letter' && !r.comment_id))}>
						<div class="m-head">
							<span class="kind">{KIND[e.kind] ?? e.kind}</span>
							<span class="muted">{e.alias ?? ''} · {fmtTime(e.sent_at)}</span>
						</div>
						<p class="body">{e.body}</p>
					</div>
				{/each}
			</div>
			<p class="a-hint">
				{#if dm}
					이름 편지: 보낸 사람은 받는 사람에게 이 익명 이름으로만 보였습니다. 받는 사람 이름은 학교 명단 이름입니다.
					보낸 사람이 누구인지는 아래 신원 확인(관리자, 기록 남음)으로 봅니다.
				{:else}
					이름은 그 편지 안에서만 쓰는 임시 이름입니다. 다른 편지·채팅과 이어지지 않습니다.
				{/if}
			</p>
		</div>
	</section>

	<aside class="a-aside">
		<section class="a-card">
			<h2 class="a-h2">글 상태</h2>
			<p class="now">
				{#if live}<b>{dm ? (d.target.thread_status === 'open' ? '주고받는 중' : '끝남 (둘에게 보이는 중)') : '학생들에게 보이는 중'}</b>
				{:else}<span class="muted">내려짐 ({dm ? '운영진 조치' : '작성자 삭제 또는 운영진 조치'})</span>{/if}
			</p>
			{#if live}
				<form method="POST" action="?/remove" use:enhance={askRemove}>
					<button class="btn a-danger-btn">{what} 내리기</button>
				</form>
			{/if}
		</section>

		<ReportedCard
			title={dm ? '신고된 사람' : '작성자'}
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
		{#if r.source === 'auto'}
			<AutoReportCard />
		{:else}
			<ReporterCard filed={d.reporter_filed} dismissed={d.reporter_dismissed} filedLabel="낸 편지 신고" />
		{/if}

		<section class="a-card">
			<h2 class="a-h2">조치</h2>
			<SanctionForm
				isAdmin={admin}
				banned={d.reported?.status === 'banned'}
				targets={r.source === 'auto'
					? [{ v: 'reported', label: '작성자' }]
					: [
							{ v: 'reported', label: '작성자' },
							{ v: 'reporter', label: '신고자' }
						]}
			/>
		</section>

		<section class="a-card">
			<div class="a-links">
				{#if admin && !dm}<a href="/admin/posts/{r.letter_id}">편지 전체 · 참여자 보기 →</a>{/if}
				<a href="/admin/users/{r.reported_id}">작성자 계정 →</a>
				{#if r.reporter_id}<a href="/admin/users/{r.reporter_id}">신고자 계정 →</a>{/if}
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
