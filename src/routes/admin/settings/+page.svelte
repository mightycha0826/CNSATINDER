<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const s = $derived(data.s);
	const isAdmin = $derived(data.staff?.role === 'admin');

	const FIELDS = [
		{ k: 'room_minutes', label: '기본 대화 시간', unit: '분', hint: '둘 다 입장한 순간부터' },
		{ k: 'extend_minutes', label: '연장 시간', unit: '분', hint: '둘 다 동의할 때마다' },
		{ k: 'vote_window_sec', label: '연장 질문 시점', unit: '초 전', hint: '만료 몇 초 전에 물을지' },
		{ k: 'max_rounds', label: '연장 횟수 상한', unit: '회', hint: '0 = 무제한' },
		{ k: 'rematch_cooldown_days', label: '재매칭 금지', unit: '일', hint: '대화한 상대와 다시 만나지 않는 기간' },
		{ k: 'auto_suspend_reports', label: '자동 정지 기준', unit: '명', hint: '30일 안에 서로 다른 신고자 수' },
		{ k: 'max_open_rooms', label: '동시 대화 수', unit: '개', hint: '한 사람이 한꺼번에 열어 둘 수 있는 대화' }
	] as const;
</script>

<h1>운영 설정</h1>

{#if form?.done}<p class="ok">{form.done}</p>{/if}
{#if form?.error}<p class="err">{form.error}</p>{/if}

<section class="kill" class:off={!s.is_open}>
	<div>
		<b>{s.is_open ? '서비스 운영 중' : '서비스 닫힘'}</b>
		<span>
			{s.is_open
				? '닫으면 새 대화가 시작되지 않아요. 진행 중인 대화는 끝까지 유지됩니다.'
				: '학생들은 홈 화면에서 "지금은 열려 있지 않아요"를 보게 됩니다.'}
		</span>
	</div>
	<form method="POST" action="?/toggle" use:enhance>
		<input type="hidden" name="open" value={String(!s.is_open)} />
		<button class={s.is_open ? 'btn danger-btn' : 'btn'}>{s.is_open ? '서비스 닫기' : '서비스 열기'}</button>
	</form>
</section>

<form method="POST" action="?/save" use:enhance class="form">
	<label class="row notice">
		<span class="label">공지<small>홈 화면 상단에 표시</small></span>
		<input class="field" name="notice" value={s.notice} maxlength="300" placeholder="(없음)" disabled={!isAdmin} />
	</label>
	{#each FIELDS as f (f.k)}
		<label class="row">
			<span class="label">{f.label}<small>{f.hint}</small></span>
			<span class="val">
				<input class="field num" type="number" name={f.k} value={s[f.k]} disabled={!isAdmin} />
				<span class="unit">{f.unit}</span>
			</span>
		</label>
	{/each}
	{#if isAdmin}
		<button class="btn save">저장</button>
	{:else}
		<p class="muted small">운영 수치는 관리자만 바꿀 수 있어요. (서비스 열고 닫기는 운영진도 가능)</p>
	{/if}
</form>

<style>
	h1 {
		margin: 0 0 16px;
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.03em;
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
	.kill {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		margin-bottom: 24px;
		max-width: 720px;
	}
	.kill div {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.kill b {
		font-size: 16px;
		color: var(--accent);
	}
	.kill.off b {
		color: var(--danger);
	}
	.kill span {
		font-size: 13px;
		color: var(--text-2);
	}
	.kill .btn {
		width: auto;
		padding: 0 16px;
		white-space: nowrap;
	}
	.danger-btn {
		background: var(--danger);
	}
	.form {
		max-width: 720px;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 12px 0;
		border-top: 1px solid var(--line);
	}
	.label {
		display: flex;
		flex-direction: column;
		font-size: 14px;
		font-weight: 600;
	}
	.label small {
		font-size: 12px;
		font-weight: 400;
		color: var(--text-2);
	}
	.val {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.val .field {
		width: 90px;
		text-align: right;
	}
	.unit {
		width: 36px;
		font-size: 13px;
		color: var(--text-2);
	}
	.notice .field {
		max-width: 420px;
	}
	.save {
		width: auto;
		margin-top: 16px;
		padding: 0 24px;
	}
	.small {
		font-size: 12px;
	}
</style>
