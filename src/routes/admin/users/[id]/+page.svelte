<script lang="ts">
	import { enhance } from '$app/forms';
	import { ACTION_LABEL, CLOSE_LABEL, REASON_LABEL, STATUS_LABEL, fmtTime, type UserLetterRow } from '$lib/adminTypes';
	import SanctionForm from '$lib/admin/SanctionForm.svelte';
	import Sid from '$lib/admin/Sid.svelte';

	let { data, form } = $props();
	const d = $derived(data.d);
	const p = $derived(d.profile);
	const admin = $derived(data.staff?.role === 'admin');

	// 액션 결과는 다음 액션을 하면 사라지므로 따로 들고 있는다
	let email = $state<string | null>(null);
	let name = $state<string | null>(null);
	let letters = $state<UserLetterRow[] | null>(null);
	$effect(() => {
		if (form && 'email' in form && form.email) {
			email = form.email;
			name = 'name' in form ? (form.name ?? null) : null;
		}
		if (form && 'letters' in form && form.letters) letters = form.letters;
	});

	const GENDER: Record<string, string> = { m: '남', f: '여', x: '밝히지 않음', any: '상관없음' };
	const suspended = $derived(!!p.suspended_until && Date.parse(p.suspended_until) > Date.now());

	function confirmIdentity(e: SubmitEvent) {
		if (!confirm('이 계정의 학교 이메일을 확인합니다. 열람 기록이 남습니다. 계속할까요?')) e.preventDefault();
	}
	function confirmLetters(e: SubmitEvent) {
		if (!confirm('이 계정이 쓴 편지·댓글을 확인합니다. 열람 기록이 남습니다. 계속할까요?')) e.preventDefault();
	}
</script>

<a class="a-back" href="/admin/users">← 사용자 목록</a>

<header class="a-head">
	<div>
		<h1 class="a-h1">
			{p.nickname ?? '(이름 없음)'}<Sid label={data.students[p.id]} />
			{#if d.staff_role}<span class="pill acc">{d.staff_role === 'admin' ? '관리자' : '운영진'}</span>{/if}
			{#if p.status === 'banned'}<span class="pill red">영구정지</span>
			{:else if p.status === 'suspended'}<span class="pill red">정지 (검토 대기)</span>
			{:else if suspended}<span class="pill red">{fmtTime(p.suspended_until!)}까지 정지</span>{/if}
		</h1>
		<p class="a-sub">
			{#if d.online}<span class="dot"></span>접속 중{:else if d.last_seen}최근 접속 {fmtTime(d.last_seen)}{/if}
			· 가입 {fmtTime(p.created_at)} · <span class="mono">{p.id}</span>
		</p>
	</div>
</header>

{#if form && 'done' in form && form.done}<p class="a-ok">{form.done}</p>{/if}
{#if form && 'error' in form && form.error}<p class="a-err">{form.error}</p>{/if}

<div class="a-grid">
	<div class="a-col">
		<section>
			<h2 class="a-h2">프로필</h2>
			<div class="a-card">
				<dl class="a-dl">
					<dt>성별 / 찾는 상대</dt>
					<dd>{GENDER[p.gender]} / {GENDER[p.want]}</dd>
					<dt>MBTI</dt>
					<dd>{p.mbti ?? '—'}</dd>
					<dt>관심사</dt>
					<dd>{p.interests.length ? p.interests.join(', ') : '—'}</dd>
					<dt>소개</dt>
					<dd>{p.bio || '—'}</dd>
					<dt>학교 인증 / 가입 완료</dt>
					<dd>{p.verified ? '완료' : '미완료'} / {p.onboarded ? '완료' : '미완료'}</dd>
				</dl>
			</div>
		</section>

		<section>
			<h2 class="a-h2">받은 신고 <span class="muted">{d.chat_reports.length + d.letter_reports.length}건</span></h2>
			{#if d.chat_reports.length + d.letter_reports.length === 0}
				<p class="a-warn">받은 신고 없음</p>
			{:else}
				<ul class="a-list a-card">
					{#each d.chat_reports as r (r.id)}
						<li>
							<a href="/admin/reports/{r.id}">{fmtTime(r.created_at)} · 채팅 · {REASON_LABEL[r.reason] ?? r.reason}</a>
							<span class="st st-{r.status}">{STATUS_LABEL[r.status]}</span>
						</li>
					{/each}
					{#each d.letter_reports as r (r.id)}
						<li>
							<a href="/admin/letters/{r.id}">
								{fmtTime(r.created_at)} · {r.target_type === 'letter' ? '편지' : '댓글'} · {REASON_LABEL[r.reason] ?? r.reason}
							</a>
							<span class="st st-{r.status}">{STATUS_LABEL[r.status]}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section>
			<h2 class="a-h2">제재 이력</h2>
			{#if d.history.length === 0}
				<p class="a-warn">제재 이력 없음</p>
			{:else}
				<ul class="a-list a-card">
					{#each d.history as h, i (i)}
						<li>
							<span>
								<b>{ACTION_LABEL[h.action] ?? h.action}</b>
								{#if h.detail?.days}{h.detail.days}일{/if}
								{#if h.detail?.note}<span class="muted"> · {h.detail.note}</span>{/if}
							</span>
							<span class="muted num">{fmtTime(h.created_at)}{h.staff_id ? '' : ' · 자동'}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if admin && data.rooms}
			<section>
				<h2 class="a-h2">대화 <span class="muted">{data.rooms.length}개</span></h2>
				{#if data.rooms.length === 0}
					<p class="a-warn">대화 기록 없음</p>
				{:else}
					<table class="a-table">
						<thead>
							<tr><th>시작</th><th>방 안 이름</th><th>상대</th><th class="r">메시지</th><th>상태</th></tr>
						</thead>
						<tbody>
							{#each data.rooms as r (r.id)}
								<tr>
									<td class="num muted"><a href="/admin/rooms/{r.id}">{fmtTime(r.created_at)}</a></td>
									<td>{r.alias}</td>
									<td>
										{#if r.partner_id}<a href="/admin/users/{r.partner_id}">{r.partner_nickname ?? r.partner_id.slice(0, 8)}</a><Sid label={data.students[r.partner_id]} />{:else}—{/if}
									</td>
									<td class="r num">{r.message_count}</td>
									<td>
										{#if r.live}<span class="pill acc">진행 중</span>
										{:else}<span class="muted">{CLOSE_LABEL[r.close_reason ?? ''] ?? '종료'}</span>{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<p class="a-hint">대화 내용은 끝나고 24시간 뒤 서버에서 지워집니다 (신고된 대화는 신고 사본으로 남음).</p>
				{/if}
			</section>

			<section>
				<h2 class="a-h2">편지 · 댓글</h2>
				{#if letters}
					{#if letters.length === 0}
						<p class="a-warn">쓴 편지·댓글 없음</p>
					{:else}
						<table class="a-table">
							<thead>
								<tr><th>편지</th><th>이 편지에서의 이름</th><th>역할</th><th class="r">댓글</th></tr>
							</thead>
							<tbody>
								{#each letters as l (l.letter_id)}
									<tr>
										<td class="clip">
											<a href="/admin/posts/{l.letter_id}">#{l.letter_id} {l.preview}</a>
											{#if l.status === 'removed'}<span class="pill red">내려짐</span>{/if}
										</td>
										<td>{l.alias}</td>
										<td>{l.is_author ? '작성자' : '댓글'}</td>
										<td class="r num">{l.my_comments}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				{:else}
					<div class="a-card">
						<p class="a-hint" style="margin-top:0">
							편지 {d.counts.letters}통 · 댓글 {d.counts.comments}개. 어떤 글인지 보려면 열람 기록이 남습니다.
						</p>
						<form method="POST" action="?/letters" use:enhance onsubmit={confirmLetters}>
							<button class="btn-ghost sm">편지 · 댓글 보기</button>
						</form>
					</div>
				{/if}
			</section>
		{/if}
	</div>

	<aside class="a-aside">
		<section class="a-card">
			<h2 class="a-h2">활동</h2>
			<dl class="a-dl">
				<dt>경고 누적</dt>
				<dd class="num" class:danger={p.strikes > 0}>{p.strikes}회</dd>
				<dt>대화</dt>
				<dd class="num">{d.counts.rooms}개 (진행 중 {d.counts.open_rooms})</dd>
				<dt>편지 / 댓글</dt>
				<dd class="num">{d.counts.letters} / {d.counts.comments}</dd>
				<dt>낸 신고</dt>
				<dd class="num">{d.counts.reports_filed}건</dd>
				<dt>기각된 신고</dt>
				<dd class="num" class:danger={d.counts.reports_dismissed >= 2}>{d.counts.reports_dismissed}건</dd>
			</dl>
		</section>

		<section class="a-card">
			<h2 class="a-h2">조치</h2>
			{#if d.staff_role && !admin}
				<p class="a-hint">운영진 계정은 관리자만 조치할 수 있습니다.</p>
			{:else}
				<SanctionForm isAdmin={admin} banned={p.status === 'banned'} />
			{/if}
		</section>

		{#if admin}
			<section class="a-card">
				<h2 class="a-h2">학교 이메일</h2>
				{#if email}
					<p class="mono email">{email}{#if name} <span class="rname">({name})</span>{/if}</p>
					<p class="a-hint">이 열람은 활동 기록에 남습니다.</p>
				{:else}
					<p class="a-hint">열람하면 누가 언제 봤는지 기록됩니다.</p>
					<form method="POST" action="?/identity" use:enhance onsubmit={confirmIdentity}>
						<button class="btn-ghost sm">이메일 확인</button>
					</form>
				{/if}
			</section>
		{/if}
	</aside>
</div>

<style>
	.sm {
		margin-top: 8px;
		height: 36px;
		font-size: 13px;
	}
	.email {
		margin: 0;
		font-size: 14px;
	}
	.a-h1 .pill {
		font-size: 12px;
		vertical-align: 4px;
	}
</style>
