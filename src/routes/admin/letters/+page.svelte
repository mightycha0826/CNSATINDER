<script lang="ts">
	import ReportList from '$lib/admin/ReportList.svelte';

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

<ReportList kind="letter" reports={data.reports} status={data.status} />
