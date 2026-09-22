<script lang="ts">
	import { REASON_LABEL, STATUS_LABEL } from '$lib/adminTypes';

	let { data } = $props();

	const TABS = [
		{ v: 'open', label: '미처리' },
		{ v: 'reviewing', label: '검토 중' },
		{ v: 'actioned', label: '조치 완료' },
		{ v: 'dismissed', label: '기각' },
		{ v: 'all', label: '전체' }
	];

	const fmt = (s: string) =>
		new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	/** 사용자 id 앞 6자리 — 같은 사람인지 알아보는 용도. 신원이 아니다. */
	const short = (id: string) => id.slice(0, 6);
</script>

<section class="stats">
	<div class="stat" class:hot={data.stats.open_letter_reports > 0}>
		<b class="num">{data.stats.open_letter_reports}</b><span>미처리 편지 신고</span>
	</div>
	<div class="stat"><b class="num">{data.stats.letters_24h}</b><span>24시간 편지</span></div>
	<div class="stat"><b class="num">{data.stats.open_reports}</b><span>미처리 채팅 신고</span></div>
	<div class="stat"><b class="num">{data.stats.restricted_users}</b><span>이용 제한 계정</span></div>
</section>

{#if data.staff?.role === 'admin'}
	<form class="find" method="GET" action="/admin/posts">
		<input class="field" name="n" placeholder="편지 번호 또는 편지 주소 (/letters/123)" autocomplete="off" />
		<button class="btn-ghost">작성자 확인</button>
	</form>
{/if}

<nav class="tabs">
	{#each TABS as t (t.v)}
		<a href="?status={t.v}" class:on={data.status === t.v}>{t.label}</a>
	{/each}
</nav>

{#if data.reports.length === 0}
	<p class="empty muted">{data.status === 'open' ? '처리할 편지 신고가 없어요.' : '해당하는 신고가 없어요.'}</p>
{:else}
	<table>
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
					<td class="num muted">{fmt(r.created_at)}</td>
					<td>{r.target_type === 'letter' ? '편지' : '댓글'}</td>
					<td><span class="reason">{REASON_LABEL[r.reason] ?? r.reason}</span></td>
					<td class="note"><a href="/admin/letters/{r.id}">{r.preview || '(내용 없음)'}</a></td>
					<td class="mono">
						{short(r.reported_id)}
						{#if r.reported_status && r.reported_status !== 'active'}
							<span class="tag danger">{r.reported_status === 'banned' ? '영구정지' : '정지'}</span>
						{/if}
					</td>
					<td class="r num" class:danger={r.reported_30d >= 2}>{r.reported_30d}</td>
					<td><span class="st st-{r.status}">{STATUS_LABEL[r.status]}</span></td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.find {
		display: flex;
		gap: 6px;
		margin-bottom: 16px;
		max-width: 480px;
	}
	.find .btn-ghost {
		width: auto;
		padding: 0 14px;
		flex-shrink: 0;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		overflow: hidden;
		margin-bottom: 20px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 14px;
		border-right: 1px solid var(--line);
	}
	.stat b {
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}
	.stat span {
		font-size: 12px;
		color: var(--text-2);
	}
	.stat.hot b {
		color: var(--danger);
	}
	.tabs {
		display: flex;
		gap: 2px;
		border-bottom: 1px solid var(--line);
		margin-bottom: 4px;
	}
	.tabs a {
		padding: 10px 12px;
		margin-bottom: -1px;
		color: var(--text-2);
		font-size: 14px;
		font-weight: 600;
		border-bottom: 2px solid transparent;
	}
	.tabs a.on {
		color: var(--text);
		border-bottom-color: var(--text);
	}
	.empty {
		padding: 40px 0;
		text-align: center;
		font-size: 14px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	th {
		padding: 10px 8px;
		text-align: left;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-2);
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}
	td {
		padding: 11px 8px;
		border-bottom: 1px solid var(--line);
		vertical-align: middle;
	}
	tr:hover td {
		background: var(--surface);
	}
	.r {
		text-align: right;
	}
	.note {
		max-width: 380px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.note a {
		color: var(--text);
	}
	.note a:hover {
		text-decoration: underline;
	}
	.mono {
		font-family: ui-monospace, 'SF Mono', Consolas, monospace;
		font-size: 13px;
		white-space: nowrap;
	}
	.reason {
		font-weight: 600;
		white-space: nowrap;
	}
	.danger {
		color: var(--danger);
		font-weight: 700;
	}
	.tag {
		margin-left: 6px;
		font-family: var(--sans);
		font-size: 11px;
	}
	.st {
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
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
