<script lang="ts">
	import { REASON_LABEL, REPORT_TABS, STATUS_LABEL, fmtTime, shortId } from '$lib/adminTypes';

	let { data } = $props();
</script>

<section class="a-stats">
	<div class="a-stat" class:hot={data.stats.open_letter_reports > 0}>
		<b class="num">{data.stats.open_letter_reports}</b><span>미처리 편지 신고</span>
	</div>
	<div class="a-stat"><b class="num">{data.stats.letters_24h}</b><span>24시간 편지</span></div>
	<div class="a-stat"><b class="num">{data.stats.open_reports}</b><span>미처리 채팅 신고</span></div>
	<div class="a-stat"><b class="num">{data.stats.restricted_users}</b><span>이용 제한 계정</span></div>
</section>

{#if data.staff?.role === 'admin'}
	<form class="find" method="GET" action="/admin/posts">
		<input class="field" name="n" placeholder="편지 번호 또는 편지 주소 (/letters/123)" autocomplete="off" />
		<button class="btn-ghost a-sm">작성자 확인</button>
	</form>
{/if}

<nav class="a-tabs">
	{#each REPORT_TABS as t (t.v)}
		<a href="?status={t.v}" class:on={data.status === t.v}>{t.label}</a>
	{/each}
</nav>

{#if data.reports.length === 0}
	<p class="a-empty">{data.status === 'open' ? '처리할 편지 신고가 없어요.' : '해당하는 신고가 없어요.'}</p>
{:else}
	<div class="a-scroll">
		<table class="a-table">
			<thead>
				<tr>
					<th>접수</th>
					<th>대상</th>
					<th>사유</th>
					<th>신고한 글</th>
					<th>작성자</th>
					<th class="r" title="최근 30일, 서로 다른 신고자 수">누적</th>
					<th>상태</th>
				</tr>
			</thead>
			<tbody>
				{#each data.reports as r (r.id)}
					<tr>
						<td class="num muted">{fmtTime(r.created_at)}</td>
						<td>{r.target_type === 'letter' ? '편지' : '댓글'}</td>
						<td>
							<span class="a-reason">{REASON_LABEL[r.reason] ?? r.reason}</span>
							{#if r.source === 'auto'}<span class="pill auto" title="AI 자동 감지">자동</span>{/if}
						</td>
						<td class="clip"><a href="/admin/letters/{r.id}">{r.preview || '(내용 없음)'}</a></td>
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
	.find {
		display: flex;
		gap: 6px;
		margin-bottom: 16px;
		max-width: 480px;
	}
	.find .a-sm {
		height: auto;
		flex-shrink: 0;
	}
	@media (max-width: 720px) {
		th:nth-child(5),
		td:nth-child(5),
		th:nth-child(6),
		td:nth-child(6) {
			display: none;
		}
	}
</style>
