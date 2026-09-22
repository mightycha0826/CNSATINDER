<script lang="ts">
	import { CLOSE_LABEL, fmtTime } from '$lib/adminTypes';

	let { data } = $props();
</script>

<header class="a-head">
	<div>
		<h1 class="a-h1">전체 대화</h1>
		<p class="a-sub">대화를 열면 활동 기록에 남습니다. 끝난 대화 내용은 24시간 뒤 서버에서 지워집니다.</p>
	</div>
</header>

<nav class="a-tabs">
	<a href="?filter=live" class:on={data.filter === 'live'}>진행 중</a>
	<a href="?filter=all" class:on={data.filter === 'all'}>최근 전체</a>
</nav>

{#if data.rooms.length === 0}
	<p class="a-empty">{data.filter === 'live' ? '진행 중인 대화 없음' : '대화 없음'}</p>
{:else}
	<table class="a-table">
		<thead>
			<tr><th>시작</th><th>참여자</th><th class="r">메시지</th><th class="r">연장</th><th>상태</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.rooms as r (r.id)}
				<tr>
					<td class="num muted">{fmtTime(r.created_at)}</td>
					<td>
						{#each r.members ?? [] as m, i (m.seat)}
							{#if i > 0}<span class="muted"> · </span>{/if}
							<a href="/admin/users/{m.user_id}">{m.nickname ?? m.user_id.slice(0, 8)}</a>
						{/each}
					</td>
					<td class="r num">{r.message_count}</td>
					<td class="r num muted">{r.round - 1}</td>
					<td>
						{#if r.live}<span class="pill acc">{r.status === 'pending' ? '입장 대기' : '진행 중'}</span>
						{:else}<span class="muted">{CLOSE_LABEL[r.close_reason ?? ''] ?? '종료'}</span>{/if}
					</td>
					<td class="r"><a class="open" href="/admin/rooms/{r.id}">열기 →</a></td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.open {
		color: var(--accent) !important;
		font-weight: 600;
		font-size: 13px;
		white-space: nowrap;
	}
</style>
