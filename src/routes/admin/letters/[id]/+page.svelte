<script lang="ts">
	import { enhance } from '$app/forms';
	import { REASON_LABEL, STATUS_LABEL, fmtTime, type Identity } from '$lib/adminTypes';
	import SanctionForm from '$lib/admin/SanctionForm.svelte';
	import { confirmed } from '$lib/admin/confirm';

	let { data, form } = $props();
	const d = $derived(data.d);
	const r = $derived(d.report);
	const admin = $derived(data.staff?.role === 'admin');

	const KIND: Record<string, string> = { letter: '편지 본문', parent: '답글이 달린 댓글', comment: '신고한 댓글' };

	const live = $derived(
		r.comment_id ? d.target.comment_status === 'visible' && d.target.letter_status === 'open' : d.target.letter_status === 'open'
	);
	const suspended = $derived(!!d.reported?.suspended_until && Date.parse(d.reported.suspended_until) > Date.now());

	const askRemove = confirmed(
		() => `이 ${r.comment_id ? '댓글' : '편지'}를 내릴까요? 학생들에게 더 이상 보이지 않고, 기록이 남습니다.`
	);
	const askIdentity = confirmed(() => '두 사람의 학교 이메일을 확인합니다. 열람 기록이 남습니다. 계속할까요?');
</script>

{#snippet idRow(label: string, who: Identity)}
	<dt>{label}</dt>
	<dd class="mono">{who.email ?? '(탈퇴)'}{#if who.name}<span class="rname">({who.name})</span>{/if}</dd>
{/snippet}

<a class="a-back" href="/admin/letters">← 편지 신고 목록</a>

<header class="a-head">
	<div>
		<h1 class="a-h1">{r.target_type === 'letter' ? '편지' : '댓글'} · {REASON_LABEL[r.reason] ?? r.reason}</h1>
		<p class="a-sub">{fmtTime(r.created_at)} 접수 · <span class="st st-{r.status}">{STATUS_LABEL[r.status]}</span></p>
	</div>
	<form class="head-actions" method="POST" action="?/status" use:enhance>
		{#if r.status === 'open'}
			<button class="btn-ghost a-sm" name="status" value="reviewing">검토 시작</button>
		{/if}
		{#if r.status !== 'dismissed'}
			<button class="btn-ghost a-sm" name="status" value="dismissed">기각</button>
		{:else}
			<button class="btn-ghost a-sm" name="status" value="open">다시 열기</button>
		{/if}
	</form>
</header>

{#if form && 'done' in form && form.done}<p class="a-ok">{form.done}</p>{/if}
{#if form && 'error' in form && form.error}<p class="a-err">{form.error}</p>{/if}

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

		<section class="a-card">
			<h2 class="a-h2">작성자</h2>
			<dl class="a-dl">
				<dt>상태</dt>
				<dd>
					{#if d.reported?.status === 'banned'}<b class="danger">영구 정지</b>
					{:else if d.reported?.status === 'suspended'}<b class="danger">정지 (검토 대기)</b>
					{:else if suspended}<b class="danger">{fmtTime(d.reported!.suspended_until!)}까지 정지</b>
					{:else if !d.reported}<span class="muted">탈퇴</span>
					{:else}정상{/if}
				</dd>
				<dt>경고 누적</dt>
				<dd class="num">{d.reported?.strikes ?? 0}회</dd>
				<dt>다른 편지 신고</dt>
				<dd class="num" class:danger={d.history.length > 0}>{d.history.length}건</dd>
				<dt>채팅 신고</dt>
				<dd class="num" class:danger={d.chat_reports > 0}>{d.chat_reports}건</dd>
			</dl>
			{#if d.history.length}
				<ul class="a-list hist">
					{#each d.history as h (h.id)}
						<li>
							<a href="/admin/letters/{h.id}">{fmtTime(h.created_at)} · {REASON_LABEL[h.reason] ?? h.reason}</a>
							<span class="st st-{h.status}">{STATUS_LABEL[h.status]}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="a-card">
			<h2 class="a-h2">신고자</h2>
			<dl class="a-dl">
				<dt>낸 편지 신고</dt>
				<dd class="num">{d.reporter_filed}건</dd>
				<dt>기각된 신고</dt>
				<dd class="num" class:danger={d.reporter_dismissed >= 2}>{d.reporter_dismissed}건</dd>
			</dl>
			{#if d.reporter_dismissed >= 2}
				<p class="a-hint">기각이 반복되는 신고자입니다. 허위 신고 여부를 확인해 주세요.</p>
			{/if}
		</section>

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

		{#if admin}
			<section class="a-card">
				<h2 class="a-h2">신원 확인</h2>
				{#if form && 'identity' in form && form.identity}
					<dl class="a-dl">
						{@render idRow('작성자', form.identity.reported)}
						{@render idRow('신고자', form.identity.reporter)}
					</dl>
					<p class="a-hint">이 열람은 활동 기록에 남습니다. 학생에게 조치를 전달할 때만 사용하세요.</p>
				{:else}
					<p class="a-hint" style="margin-top:0">학교 이메일은 꼭 필요할 때만 확인하세요.<br />열람하면 누가 언제 봤는지 기록됩니다.</p>
					<form method="POST" action="?/identity" use:enhance={askIdentity}>
						<button class="btn-ghost id-btn">이메일 확인</button>
					</form>
				{/if}
			</section>
		{/if}
	</aside>
</div>

<style>
	.head-actions {
		display: flex;
		gap: 6px;
	}
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
	.hist {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
		font-size: 12px;
	}
	.id-btn {
		margin-top: 8px;
	}
</style>
