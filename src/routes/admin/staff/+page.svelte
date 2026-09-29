<script lang="ts">
	/**
	 * 운영진 관리 (Phase 50, 최고 관리자만) — 학번으로 지정, 줄마다 역할 · 표시 이름 바꾸기 · 빼기.
	 * 결과는 누른 버튼 자체에(ack). 빼기는 확인창을 거친다. 최고 관리자 줄은 잠겨 있다.
	 */
	import { enhance } from '$app/forms';
	import { ack, confirmed } from '$lib/admin/confirm';
	import { ROLE_COLOR, ROLE_LABEL, type StaffRole } from '$lib/adminRoles';
	import { agoText } from '$lib/time';

	let { data } = $props();
	const ROLES: StaffRole[] = ['moderator', 'developer', 'admin'];
	const HINT: Record<StaffRole, string> = {
		moderator: '신고 처리 · 제재 · 사용자 · 개인 공지 · 업적 · 문의',
		developer: '운영 설정(수치 · AI · 금칙어 · 잠금) · 문의 · 활동 기록 — 학생 조치 · 신원은 못 봄',
		admin: '전부 — 학생 신원(이메일 · 학번 이름) · 전체 대화 · 공지 올리기까지'
	};
	const now = Date.now();
	const askRemove = confirmed((f) => `${f.get('no')} 을(를) 운영진에서 뺄까요? 바로 운영 화면에 들어올 수 없게 돼요.`);
	const askAdmin = confirmed((f) =>
		f.get('role') === 'admin' ? `${f.get('no')} 에게 관리자 권한을 줄까요? 학생 신원까지 볼 수 있게 돼요.` : `${f.get('no')} 을(를) ${ROLE_LABEL[f.get('role') as StaffRole]}(으)로 정할까요?`
	, { keep: false });
</script>

<header class="a-head">
	<div>
		<h1 class="a-h1">운영진 관리</h1>
		<p class="a-sub">최고 관리자만 볼 수 있어요. 학번으로 운영자 · 개발자 · 관리자를 정하고, 바꾸고, 뺄 수 있어요. 바꾼 내용은 활동 기록에 남아요.</p>
	</div>
</header>

<section class="a-card add">
	<h2 class="a-h2">운영진 지정</h2>
	<form method="POST" action="?/save" use:enhance={askAdmin}>
		<input type="hidden" name="add" value="1" />
		<label class="f no">
			<span>학번</span>
			<input class="field num" name="no" placeholder="예: 20101" inputmode="numeric" autocomplete="off" required maxlength="40" />
		</label>
		<label class="f">
			<span>역할</span>
			<select class="field" name="role" required>
				{#each ROLES as r (r)}<option value={r}>{ROLE_LABEL[r]}</option>{/each}
			</select>
		</label>
		<label class="f grow">
			<span>표시 이름 <small>(현황 판에 보임 · 비우면 앱 닉네임)</small></span>
			<input class="field" name="name" maxlength="20" autocomplete="off" placeholder="예: 홍길동" />
		</label>
		<button class="btn go">지정</button>
	</form>
	<ul class="legend">
		{#each ROLES as r (r)}
			<li><b style:color={ROLE_COLOR[r]}>{ROLE_LABEL[r]}</b> {HINT[r]}</li>
		{/each}
	</ul>
</section>

<h2 class="a-h2 list-h">운영진 <span class="muted">{data.list.length}명</span></h2>
<ul class="rows">
	{#each data.list as s (s.id)}
		<li class="a-card row" class:owner={s.owner}>
			<span class="av" style:background={ROLE_COLOR[s.role]} aria-hidden="true">{[...(s.display_name ?? s.nickname ?? '?')][0]}</span>
			<span class="who">
				<b>{s.display_name ?? s.nickname ?? '이름 없음'}{#if s.owner}<span class="crown">최고 관리자</span>{/if}</b>
				<small class="muted"><span class="num">{s.no ?? '탈퇴'}</span> · {s.nickname ?? ''} · {s.last_seen ? `${agoText(s.last_seen, now)} 접속` : '아직 접속 안 함'}</small>
			</span>
			{#if s.owner}
				<span class="locked muted">바꿀 수 없음</span>
			{:else if s.no}
				<form class="edit" method="POST" action="?/save" use:enhance={ack({ keep: true })}>
					<input type="hidden" name="no" value={s.no} />
					<select class="field" name="role" value={s.role} aria-label="{s.no} 역할">
						{#each ROLES as r (r)}<option value={r}>{ROLE_LABEL[r]}</option>{/each}
					</select>
					<input class="field" name="name" value={s.display_name ?? ''} maxlength="20" placeholder="표시 이름" aria-label="{s.no} 표시 이름" />
					<button class="btn-ghost a-sm save">저장</button>
				</form>
				<form method="POST" action="?/remove" use:enhance={askRemove}>
					<input type="hidden" name="no" value={s.no} />
					<button class="btn-ghost a-sm out">빼기</button>
				</form>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.add form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 10px;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		font-weight: 700;
		color: var(--text-2);
	}
	.f small {
		font-weight: 500;
	}
	.f .field {
		height: 42px;
		font-size: 14px;
	}
	.no .field {
		width: 120px;
	}
	.grow {
		flex: 1 1 200px;
	}
	.go {
		width: auto;
		height: 42px;
		padding: 0 22px;
	}
	.legend {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 14px 0 0;
		padding: 12px 0 0;
		border-top: 1px solid var(--line);
		list-style: none;
		font-size: 12px;
		color: var(--text-2);
	}
	.legend b {
		display: inline-block;
		width: 44px;
	}
	.list-h {
		margin: 24px 0 10px;
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.row.owner {
		box-shadow: inset 3px 0 0 #f59e0b;
	}
	.av {
		display: grid;
		place-items: center;
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		color: #fff;
		font-weight: 800;
	}
	.who {
		display: flex;
		flex: 1 1 180px;
		flex-direction: column;
		min-width: 0;
	}
	.who small {
		font-size: 12px;
	}
	.crown {
		margin-left: 6px;
		padding: 1px 7px;
		border-radius: 999px;
		background: color-mix(in srgb, #f59e0b 18%, transparent);
		color: #b45309;
		font-size: 11px;
		font-weight: 800;
	}
	.locked {
		font-size: 12px;
	}
	.edit {
		display: flex;
		gap: 6px;
	}
	.edit .field {
		width: auto;
		height: 34px;
		padding: 0 10px;
		font-size: 13px;
	}
	.edit input.field {
		width: 130px;
	}
	.out {
		color: var(--danger);
	}
</style>
