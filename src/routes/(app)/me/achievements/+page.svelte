<script lang="ts">
	/** 업적 전체 (Phase 31) — 내 프로필의 "명성" 카드에서 들어온다. 보고 나면 "새 업적" 표시를 지운다. */
	import BackButton from '$lib/ui/BackButton.svelte';
	import AchievementsView from '$lib/ui/AchievementsView.svelte';
	import { fetchMyAchievements, markAchievementsSeen, setFeaturedBadges, type MyAchievements } from '$lib/achievements';
	import { errMsg, toast } from '$lib/state.svelte';

	let data = $state<MyAchievements | null>(null);
	let failed = $state(false);

	$effect(() => {
		fetchMyAchievements()
			.then((d) => {
				data = d;
				if (d.items.some((a) => a.new)) setTimeout(() => void markAchievementsSeen().catch(() => {}), 1500);
			})
			.catch(() => (failed = true));
	});

	async function feature(codes: string[]) {
		try {
			const r = await setFeaturedBadges(codes);
			if (r.status !== 'ok') {
				toast(r.status === 'too_many' ? '대표 업적은 3개까지예요' : '아직 딴 업적이 아니에요');
				return false;
			}
			if (data) data = { ...data, featured: r.featured ?? data.featured, chosen: codes };
			toast('대표 업적을 바꿨어요');
			return true;
		} catch (e) {
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
		<AchievementsView {data} onfeature={feature} />
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
