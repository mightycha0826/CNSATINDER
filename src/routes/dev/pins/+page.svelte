<script lang="ts">
	/**
	 * 개발용 미리보기 (Phase 84) — Landy 뱃지(아이콘 모양 핀) 전부를 크게: 등급(동 · 은 · 금 · 잠김)마다 한 줄.
	 * ?size=숫자 로 크기를 바꾼다. 로그인 없이 (개발 서버에서만).
	 */
	import { page } from '$app/state';
	import Badge from '$lib/ui/Badge.svelte';
	import { BADGE_ICONS } from '$lib/ui/badgeIcons';
	import type { Tier } from '$lib/achievements';

	const size = $derived(Number(page.url.searchParams.get('size')) || 80);
	const codes = Object.keys(BADGE_ICONS);
	const TIERS: Tier[] = [3, 2, 1, 0];
</script>

<div class="pins">
	{#each TIERS as t (t)}
		<section data-tier={t}>
			{#each codes as c (c)}
				<figure>
					<Badge code={c} tier={t} title={c} {size} />
					<figcaption>{c}</figcaption>
				</figure>
			{/each}
		</section>
	{/each}
</div>

<style>
	.pins {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 16px;
		background: var(--bg);
	}
	section {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
	}
	figure {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		margin: 0;
		width: 92px;
	}
	figcaption {
		font-size: 10px;
		color: var(--text-2);
	}
</style>
