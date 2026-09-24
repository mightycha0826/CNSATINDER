<script lang="ts">
	import { REASON_LABEL, REPORT_TABS, STATUS_LABEL, fmtTime, shortId } from '$lib/adminTypes';

	let { data } = $props();
</script>

<section class="a-stats">
	<div class="a-stat" class:hot={data.stats.open_reports > 0}>
		<b class="num">{data.stats.open_reports}</b><span>미처리 신고</span>
	</div>
	<div class="a-stat"><b class="num">{data.stats.reviewing}</b><span>검토 중</span></div>
	<div class="a-stat"><b class="num">{data.stats.active_rooms}</b><span>진행 중 대화</span></div>
	<div class="a-stat"><b class="num">{data.stats.seeking_now}</b><span>상대 찾는 중</span></div>
	<div class="a-stat"><b class="num">{data.stats.rooms_24h}</b><span>24시간 대화</span></div>
	<div class="a-stat"><b class="num">{data.stats.restricted_users}</b><span>이용 제한 계정</span></div>
	<a class="a-stat state" class:off={!data.stats.is_open} href="/admin/settings">
		<b>{data.stats.is_open ? '운영 중' : '닫힘'}</b><span>서비스 상태</span>
	</a>
</section>

<nav class="a-tabs">
	{#each REPORT_TABS as t (t.v)}
		<a href="?status={t.v}" class:on={data.status === t.v}>{t.label}</a>
	{/each}
</nav>

{#if data.reports.length === 0}
	<p class="a-empty">{data.status === 'open' ? '처리할 신고가 없어요.' : '해당하는 신고가 없어요.'}</p>
{:else}
	<div class="a-scroll">
		<table class="a-table">
			<thead>
				<tr>
					<th>접수</th>
					<th>사유</th>
					<th>신고 내용</th>
					<th class="r">대화</th>
					<th>대상</th>
					<th class="r" title="최근 30일, 서로 다른 신고자 수">누적</th>
					<th>상태</th>
				</tr>
			</thead>
			<tbody>
				{#each data.reports as r (r.id)}
					<tr>
						<td class="num muted">{fmtTime(r.created_at)}</td>
						<td>
							<span class="a-reason">{REASON_LABEL[r.reason] ?? r.reason}</span>
							{#if r.source === 'auto'}<span class="pill auto" title="AI 자동 감지">자동</span>{/if}
						</td>
						<td class="clip"><a href="/admin/reports/{r.id}">{r.note || '(메모 없음)'}</a></td>
						<td class="r num muted">{r.evidence_count}</td>
						<td class="mono">
							{shortId(r.reported_id)}
							{#if r.reported_status && r.reported_status !== 'active'}
								<span class="pill red">{r.reported_status === 'banned' ? '영구정지' : '정지'}</span>
							{/if}
						</td>
						<td class="r num" class:danger={r.reported_30d >= 2}>{r.reported_30d}</td>
						<td><span class="st st-{r.status}">{STATUS_LABEL[r.status]}</span></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.state b {
		font-size: 15px;
		line-height: 1.8;
		color: var(--accent);
	}
	.state.off b {
		color: var(--danger);
	}
	@media (max-width: 720px) {
		th:nth-child(4),
		td:nth-child(4),
		th:nth-child(6),
		td:nth-child(6) {
			display: none;
		}
	}
</style>
