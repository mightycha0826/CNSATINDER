<script lang="ts">
	/**
	 * 남의 업적 메달 자세히 (Phase 44) — 대화 상대의 대표 업적을 누르면 어떻게 얻는지 · 등급 기준 (업적 화면과 같은 BadgeDetail).
	 * 설명 · 기준은 업적 카탈로그에서 (앱을 켠 동안 한 번만 받는다, lib/achievements.ts fetchCatalog).
	 */
	import Sheet from './Sheet.svelte';
	import BadgeDetail from './BadgeDetail.svelte';
	import { BADGE_SHEET, closeBadge } from '$lib/badgeSheet.svelte';
	import { fetchCatalog, type AchievementDef } from '$lib/achievements';

	let defs = $state<Map<string, AchievementDef> | null>(null);
	let failed = $state(false);
	$effect(() => {
		if (!BADGE_SHEET.cur || defs) return;
		failed = false;
		fetchCatalog().then(
			(m) => (defs = m),
			() => (failed = true)
		);
	});
</script>

{#if BADGE_SHEET.cur}
	{@const b = BADGE_SHEET.cur}
	<Sheet onclose={closeBadge} label={b.title}>
		<BadgeDetail badge={b} def={defs?.get(b.code) ?? null} loading={!defs && !failed} />
	</Sheet>
{/if}
