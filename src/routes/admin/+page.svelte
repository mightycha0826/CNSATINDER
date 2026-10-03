<script lang="ts">
	import ReportList from '$lib/admin/ReportList.svelte';

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

<ReportList kind="chat" reports={data.reports} status={data.status} />

<style>
	.state b {
		font-size: 15px;
		line-height: 1.8;
		color: var(--accent);
	}
	.state.off b {
		color: var(--danger);
	}
</style>
