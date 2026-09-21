<script lang="ts">
	import { enhance } from '$app/forms';
	import { REASON_LABEL, STATUS_LABEL } from '$lib/adminTypes';

	let { data, form } = $props();
	const d = $derived(data.d);
	const r = $derived(d.report);

	let target = $state<'reported' | 'reporter'>('reported');
	let action = $state<'warn' | 'suspend' | 'ban' | 'reinstate'>('suspend');
	let days = $state(3);
	let note = $state('');

	const fmt = (s: string) =>
		new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	const time = (s: string) => new Date(s).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

	const ACTIONS = [
		{ v: 'warn', label: '경고' },
		{ v: 'suspend', label: '기간 정지' },
		{ v: 'ban', label: '영구 정지' },
		{ v: 'reinstate', label: '제한 해제' }
	] as const;

	function confirmSanction(e: SubmitEvent) {
		const who = target === 'reported' ? '피신고자' : '신고자';
		const what = ACTIONS.find((a) => a.v === action)!.label + (action === 'suspend' ? ` ${days}일` : '');
		if (!confirm(`${who}에게 "${what}" 조치를 할까요? 이 조치는 기록됩니다.`)) e.preventDefault();
	}
	function confirmIdentity(e: SubmitEvent) {
		if (!confirm('두 사람의 학교 이메일을 확인합니다. 열람 기록이 남습니다. 계속할까요?')) e.preventDefault();
	}
</script>

<a class="back" href="/admin">← 신고 목록</a>

<header class="head">
	<div>
		<h1>{REASON_LABEL[r.reason] ?? r.reason}</h1>
		<p class="muted">{fmt(r.created_at)} 접수 · <span class="st st-{r.status}">{STATUS_LABEL[r.status]}</span></p>
	</div>
	<form method="POST" action="?/status" use:enhance>
		{#if r.status === 'open'}
			<button class="btn-ghost sm" name="status" value="reviewing">검토 시작</button>
		{/if}
		{#if r.status !== 'dismissed'}
			<button class="btn-ghost sm" name="status" value="dismissed">기각</button>
		{:else}
			<button class="btn-ghost sm" name="status" value="open">다시 열기</button>
		{/if}
	</form>
</header>

{#if form?.done}<p class="ok">{form.done}</p>{/if}
{#if form?.error}<p class="err">{form.error}</p>{/if}

<div class="grid">
	<section class="convo">
		<h2>대화 사본 <span class="muted">{d.evidence.length}개</span></h2>
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
				<p class="muted">저장된 대화가 없어요 (방이 매칭 직후 신고됨).</p>
			{/each}
		</div>
	</section>

	<aside>
		<section class="card">
			<h2>피신고자</h2>
			<dl>
				<dt>상태</dt>
				<dd>
					{#if d.reported?.status === 'banned'}<b class="danger">영구 정지</b>
					{:else if d.reported?.status === 'suspended'}<b class="danger">정지 (검토 대기)</b>
					{:else if d.reported?.suspended_until && Date.parse(d.reported.suspended_until) > Date.now()}
						<b class="danger">{fmt(d.reported.suspended_until)}까지 정지</b>
					{:else}정상{/if}
				</dd>
				<dt>경고 누적</dt>
				<dd class="num">{d.reported?.strikes ?? 0}회</dd>
				<dt>다른 신고</dt>
				<dd class="num" class:danger={d.history.length > 0}>{d.history.length}건</dd>
			</dl>
			{#if d.history.length}
				<ul class="hist">
					{#each d.history as h (h.id)}
						<li>
							<a href="/admin/reports/{h.id}">{fmt(h.created_at)} · {REASON_LABEL[h.reason]}</a>
							<span class="st st-{h.status}">{STATUS_LABEL[h.status]}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="card">
			<h2>신고자</h2>
			<dl>
				<dt>낸 신고</dt>
				<dd class="num">{d.reporter_filed}건</dd>
				<dt>기각된 신고</dt>
				<dd class="num" class:danger={d.reporter_dismissed >= 2}>{d.reporter_dismissed}건</dd>
			</dl>
			{#if d.reporter_dismissed >= 2}
				<p class="hint">기각이 반복되는 신고자예요. 허위 신고 여부를 확인해 주세요.</p>
			{/if}
		</section>

		<section class="card">
			<h2>조치</h2>
			<form method="POST" action="?/sanction" use:enhance onsubmit={confirmSanction}>
				<div class="seg">
					<label><input type="radio" name="target" value="reported" bind:group={target} /> 피신고자</label>
					<label><input type="radio" name="target" value="reporter" bind:group={target} /> 신고자</label>
				</div>
				<select class="field" name="action" bind:value={action}>
					{#each ACTIONS as a (a.v)}<option value={a.v}>{a.label}</option>{/each}
				</select>
				{#if action === 'suspend'}
					<label class="days">
						<input class="field num" type="number" name="days" min="1" max="365" bind:value={days} /> 일
					</label>
				{/if}
				<textarea class="field ta" name="note" rows="2" placeholder="조치 사유 (기록용)" bind:value={note}></textarea>
				<button class="btn" class:danger-btn={action === 'ban'}>조치하기</button>
			</form>
		</section>

		<section class="card id">
			<h2>신원 확인</h2>
			{#if form?.identity}
				<dl>
					<dt>피신고자</dt>
					<dd class="mono">{form.identity.reported ?? '(탈퇴)'}</dd>
					<dt>신고자</dt>
					<dd class="mono">{form.identity.reporter ?? '(탈퇴)'}</dd>
				</dl>
				<p class="hint">이 열람은 활동 기록에 남았어요. 학생에게 조치를 전달할 때만 사용하세요.</p>
			{:else}
				<p class="hint">
					학교 이메일은 꼭 필요할 때만 확인하세요.<br />열람하면 누가 언제 봤는지 기록됩니다.
				</p>
				<form method="POST" action="?/identity" use:enhance onsubmit={confirmIdentity}>
					<button class="btn-ghost">이메일 확인</button>
				</form>
			{/if}
		</section>
	</aside>
</div>

<style>
	.back {
		display: inline-block;
		margin-bottom: 12px;
		font-size: 13px;
		color: var(--text-2);
	}
	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 14px;
		border-bottom: 1px solid var(--line);
		margin-bottom: 16px;
	}
	.head form {
		display: flex;
		gap: 6px;
	}
	h1 {
		margin: 0 0 4px;
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}
	.head p {
		margin: 0;
		font-size: 13px;
	}
	.sm {
		width: auto;
		height: 34px;
		padding: 0 12px;
		font-size: 13px;
	}
	.ok,
	.err {
		padding: 10px 12px;
		border-radius: var(--r-sm);
		font-size: 13px;
		margin: 0 0 12px;
	}
	.ok {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		color: var(--accent);
	}
	.err {
		background: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 20px;
		align-items: start;
	}
	@media (max-width: 860px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
	h2 {
		margin: 0 0 10px;
		font-size: 14px;
		font-weight: 700;
	}
	h2 .muted {
		font-weight: 500;
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
	.m:first-child {
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
	.sys:first-child {
		border-top: 0;
	}

	aside {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.card {
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 12px;
		margin: 0;
		font-size: 13px;
	}
	dt {
		color: var(--text-2);
	}
	dd {
		margin: 0;
		text-align: right;
	}
	.hist {
		list-style: none;
		margin: 10px 0 0;
		padding: 10px 0 0;
		border-top: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
	}
	.hist li {
		display: flex;
		justify-content: space-between;
	}
	.hist a {
		color: var(--text);
	}
	.hint {
		margin: 8px 0 0;
		font-size: 12px;
		line-height: 1.6;
		color: var(--text-2);
	}
	.card form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 4px;
	}
	.seg {
		display: flex;
		gap: 14px;
		font-size: 13px;
	}
	.days {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	.days .field {
		width: 90px;
	}
	.ta {
		height: auto;
		padding: 8px 12px;
		resize: vertical;
	}
	.danger-btn {
		background: var(--danger);
	}
	.id .btn-ghost {
		margin-top: 8px;
	}
	.mono {
		font-family: ui-monospace, 'SF Mono', Consolas, monospace;
		font-size: 12px;
		word-break: break-all;
	}
	.danger {
		color: var(--danger);
	}
	.st {
		font-weight: 600;
	}
	.st-open {
		color: var(--danger);
	}
	.st-reviewing {
		color: var(--accent);
	}
	.st-actioned,
	.st-dismissed {
		color: var(--text-2);
	}
</style>
