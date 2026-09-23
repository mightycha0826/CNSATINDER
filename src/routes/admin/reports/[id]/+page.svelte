<script lang="ts">
	import { enhance } from '$app/forms';
	import { REASON_LABEL, STATUS_LABEL, fmtClock, fmtTime, type Identity } from '$lib/adminTypes';
	import SanctionForm from '$lib/admin/SanctionForm.svelte';
	import { confirmed } from '$lib/admin/confirm';

	let { data, form } = $props();
	const d = $derived(data.d);
	const r = $derived(d.report);
	const admin = $derived(data.staff?.role === 'admin');

	const time = fmtClock;
	const suspended = $derived(!!d.reported?.suspended_until && Date.parse(d.reported.suspended_until) > Date.now());

	const askIdentity = confirmed(() => '두 사람의 학교 이메일을 확인합니다. 열람 기록이 남습니다. 계속할까요?');
</script>

{#snippet idRow(label: string, who: Identity)}
	<dt>{label}</dt>
	<dd class="mono">{who.email ?? '(탈퇴)'}{#if who.name}<span class="rname">({who.name})</span>{/if}</dd>
{/snippet}

<a class="a-back" href="/admin">← 신고 목록</a>

<header class="a-head">
	<div>
		<h1 class="a-h1">{REASON_LABEL[r.reason] ?? r.reason}</h1>
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
			<h2 class="a-h2">대화 사본 <span class="muted">{d.evidence.length}개</span></h2>
			{#if r.note}<p class="rnote"><b>신고자 메모</b> {r.note}</p>{/if}
			<div class="msgs">
				{#each d.evidence as m (m.ord)}
					{#if m.sender === 0}
						<div class="sys">{m.body}</div>
					{:else}
						<div class="m" class:by-reported={m.sender === 2}>
							<span class="who">{m.sender === 2 ? '피신고자' : '신고자'}</span>
							<span class="body">{m.body}</span>
							<span class="t num">{time(m.sent_at)}</span>
						</div>
					{/if}
				{:else}
					<p class="muted empty">저장된 대화가 없어요 (방이 매칭 직후 신고됨).</p>
				{/each}
			</div>
		</div>
	</section>

	<aside class="a-aside">
		<section class="a-card">
			<h2 class="a-h2">피신고자</h2>
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
				<dt>다른 신고</dt>
				<dd class="num" class:danger={d.history.length > 0}>{d.history.length}건</dd>
			</dl>
			{#if d.history.length}
				<ul class="a-list hist">
					{#each d.history as h (h.id)}
						<li>
							<a href="/admin/reports/{h.id}">{fmtTime(h.created_at)} · {REASON_LABEL[h.reason] ?? h.reason}</a>
							<span class="st st-{h.status}">{STATUS_LABEL[h.status]}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="a-card">
			<h2 class="a-h2">신고자</h2>
			<dl class="a-dl">
				<dt>낸 신고</dt>
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
					{ v: 'reported', label: '피신고자' },
					{ v: 'reporter', label: '신고자' }
				]}
			/>
		</section>

		<section class="a-card">
			{#if admin}<h2 class="a-h2">관리자 열람</h2>{/if}
			<div class="a-links">
				{#if admin}<a href="/admin/rooms/{r.room_id}">이 대화 전체 보기 →</a>{/if}
				<a href="/admin/users/{r.reported_id}">피신고자 계정 →</a>
				<a href="/admin/users/{r.reporter_id}">신고자 계정 →</a>
			</div>
			{#if admin}<p class="a-hint">대화 열람은 활동 기록에 남습니다. 대화는 끝나고 24시간 뒤 지워집니다.</p>{/if}
		</section>

		{#if admin}
			<section class="a-card">
				<h2 class="a-h2">신원 확인</h2>
				{#if form && 'identity' in form && form.identity}
					<dl class="a-dl">
						{@render idRow('피신고자', form.identity.reported)}
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
		display: grid;
		grid-template-columns: 64px 1fr auto;
		gap: 10px;
		padding: 9px 12px;
		border-top: 1px solid var(--line);
		font-size: 14px;
		line-height: 1.5;
	}
	.m:first-child,
	.sys:first-child {
		border-top: 0;
	}
	.m .who {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-2);
		padding-top: 1px;
	}
	.m.by-reported {
		background: color-mix(in srgb, var(--danger) 6%, transparent);
	}
	.m.by-reported .who {
		color: var(--danger);
	}
	.m .body {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.m .t {
		font-size: 12px;
		color: var(--text-2);
	}
	.sys {
		padding: 8px 12px;
		font-size: 12px;
		color: var(--text-2);
		text-align: center;
		border-top: 1px solid var(--line);
	}
	.empty {
		margin: 0;
		padding: 16px;
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
