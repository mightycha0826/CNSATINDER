<script lang="ts">
	import { fmtTime } from '$lib/adminTypes';
	import Sid from '$lib/admin/Sid.svelte';

	let { data } = $props();
	const admin = $derived(data.staff?.role === 'admin');

	const TABS = [
		{ v: 'all', label: '전체' },
		{ v: 'restricted', label: '이용 제한' },
		{ v: 'staff', label: '운영진' }
	];
	const href = (filter: string) => `?filter=${filter}${data.q ? `&q=${encodeURIComponent(data.q)}` : ''}`;
	const restricted = (u: { status: string; suspended_until: string | null }) =>
		u.status !== 'active' || (!!u.suspended_until && Date.parse(u.suspended_until) > Date.now());
</script>

<header class="a-head">
	<div>
		<h1 class="a-h1">사용자</h1>
		<p class="a-sub">
			익명 이름 · ID 앞자리{admin ? ' · 학교 이메일' : ''}로 검색
			{#if admin}<span class="muted">(이메일 검색은 활동 기록에 남음)</span>{/if}
		</p>
	</div>
	<form class="search" method="GET">
		<input type="hidden" name="filter" value={data.filter} />
		<input
			class="field"
			name="q"
			value={data.q}
			placeholder={admin ? '익명 이름, ID, 이메일' : '익명 이름, ID 앞자리'}
			autocomplete="off"
		/>
		<button class="btn">검색</button>
	</form>
</header>

{#if data.error}<p class="a-err">{data.error}</p>{/if}

<nav class="a-tabs">
	{#each TABS as t (t.v)}
		<a href={href(t.v)} class:on={data.filter === t.v}>{t.label}</a>
	{/each}
</nav>

{#if data.users.length === 0}
	<p class="a-empty">{data.q ? '검색 결과 없음' : '해당하는 계정 없음'}</p>
{:else}
	<table class="a-table">
		<thead>
			<tr>
				<th>익명 이름</th>
				<th>ID</th>
				<th>상태</th>
				<th class="r">경고</th>
				<th class="r" title="기각 제외, 채팅 + 편지">받은 신고</th>
				<th>최근 접속</th>
				<th>가입</th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as u (u.id)}
				<tr>
					<td>
						<a href="/admin/users/{u.id}"><b>{u.nickname ?? '(이름 없음)'}</b></a><Sid label={data.students[u.id]} />
						{#if u.staff_role}<span class="pill acc">{u.staff_role === 'admin' ? '관리자' : '운영진'}</span>{/if}
						{#if !u.onboarded}<span class="pill">가입 중</span>{/if}
					</td>
					<td class="mono">{u.id.slice(0, 8)}</td>
					<td>
						{#if u.status === 'banned'}<span class="pill red">영구정지</span>
						{:else if restricted(u)}<span class="pill red">정지</span>
						{:else}<span class="muted">정상</span>{/if}
					</td>
					<td class="r num" class:danger={u.strikes > 0}>{u.strikes}</td>
					<td class="r num" class:danger={u.reports_received >= 2}>{u.reports_received}</td>
					<td class="num muted">
						{#if u.online}<span class="dot"></span>접속 중{:else if u.last_seen}{fmtTime(u.last_seen)}{:else}—{/if}
					</td>
					<td class="num muted">{fmtTime(u.created_at)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if data.users.length >= 100}<p class="a-hint">최근 가입순 100명까지 표시. 검색어를 좁혀 주세요.</p>{/if}
{/if}

<style>
	.search {
		display: flex;
		gap: 6px;
		width: min(100%, 380px);
	}
	.search .btn {
		width: auto;
		padding: 0 16px;
		flex-shrink: 0;
	}
	@media (max-width: 720px) {
		th:nth-child(2),
		td:nth-child(2),
		th:nth-child(7),
		td:nth-child(7) {
			display: none;
		}
	}
</style>
