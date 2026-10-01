<script lang="ts">
	/**
	 * 업적 전체 (Phase 31) — 내 프로필의 "명성" 카드에서 들어온다. 보고 나면 "새 업적" 표시를 지운다.
	 * 대표 업적은 교복 — 메달을 끌어 놓으면 바로 바뀌어 보이고 서버에 저장, 안 되면 되돌린다 (Phase 69).
	 * CNSA 뱃지를 가졌고 이 기기에서 CNSA 뱃지 안내를 아직 못 봤으면 한 번 띄운다 (Phase 84 — 축하에서 "업적 보러 가기"로 왔을 때).
	 */
	import BackButton from '$lib/ui/BackButton.svelte';
	import AchievementsView from '$lib/ui/AchievementsView.svelte';
	import { featuredError, featuredOf, fetchMyAchievements, markAchievementsSeen, setFeaturedBadges, slotsOf, type MyAchievements } from '$lib/achievements';
	import { S, errMsg, toast } from '$lib/state.svelte';
	import { maybeOpenBadgeTour, openBadgeTour } from '$lib/badgeTour.svelte';

	let data = $state<MyAchievements | null>(null);
	let failed = $state(false);

	$effect(() => {
		fetchMyAchievements()
			.then((d) => {
				data = d;
				if (d.items.some((a) => a.new)) setTimeout(() => void markAchievementsSeen().catch(() => {}), 1500);
				const cnsa = d.items.some((a) => a.category === 'cnsa' && a.tier > 0);
				setTimeout(() => maybeOpenBadgeTour(cnsa), 700);
			})
			.catch(() => (failed = true));
	});

	async function feature(codes: string[], quiet = false) {
		const prev = data;
		// 교복은 바로 바꿔 보인다 (남는 칸은 서버가 채워 준다)
		if (data) data = { ...data, featured: featuredOf(data.items, codes), chosen: codes };
		try {
			const r = await setFeaturedBadges(codes);
			if (r.status !== 'ok') {
				data = prev;
				toast(featuredError(r.status, slotsOf(prev)));
				return false;
			}
			if (data) data = { ...data, featured: r.featured ?? data.featured, chosen: codes };
			if (!quiet) toast('대표 업적을 바꿨어요');
			return true;
		} catch (e) {
			data = prev;
			toast(errMsg(e));
			return false;
		}
	}
</script>

<div class="topbar">
	<BackButton href="/me" history />
	<span class="title">업적</span>
</div>

<div class="page ach">
	{#if data}
		<AchievementsView {data} onfeature={feature} neck={S.profile?.gender === 'f' ? 'ribbon' : 'tie'} onguide={openBadgeTour} submitHref="/me/achievements/submit" />
	{:else if failed}
		<p class="muted center">업적을 불러오지 못했어요</p>
	{:else}
		<!-- 요약 카드 · 업적 칸 자리 (AchievementsView 의 .summary · .grid 와 같은 모양) -->
		<p class="sr-only">불러오는 중…</p>
		<i class="skeleton summary" aria-hidden="true"></i>
		<div class="grid" aria-hidden="true">
			{#each [0, 1, 2, 3] as i (i)}<i class="skeleton card"></i>{/each}
		</div>
	{/if}
</div>

<style>
	.ach {
		gap: 14px;
		padding-top: 12px;
	}
	.center {
		margin: 40px auto;
		text-align: center;
	}
	.summary {
		height: 88px;
		border-radius: var(--r-card);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 10px;
	}
	.card {
		height: 176px;
		border-radius: 20px;
	}
</style>
