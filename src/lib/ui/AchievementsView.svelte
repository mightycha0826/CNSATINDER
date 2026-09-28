<script lang="ts">
	/**
	 * 업적 화면 본문 (Phase 31) — /me/achievements 와 개발용 미리보기(/dev/achievements)가 같이 쓴다.
	 * 위: 금 · 은 · 동 개수와 대표 업적(대화 상대에게 보이는 3개). 아래: 분류 탭 + 메달 격자.
	 * 메달을 누르면 어떻게 얻는지 · 등급 기준(BadgeDetail — 대화 상대 · 프로필의 메달을 눌렀을 때와 같은 모양)과 "대표 업적으로 걸기".
	 */
	import Badge from './Badge.svelte';
	import BadgeDetail from './BadgeDetail.svelte';
	import Sheet from './Sheet.svelte';
	import {
		CATEGORIES,
		progress,
		progressText,
		toggledFeatured,
		type Achievement,
		type Category,
		type MyAchievements
	} from '$lib/achievements';

	let { data, onfeature }: { data: MyAchievements; onfeature: (codes: string[]) => Promise<boolean> } = $props();

	let cat = $state<Category | 'all'>('all');
	let open = $state<Achievement | null>(null);
	let busy = $state(false);

	const earned = $derived(data.items.filter((a) => a.tier > 0));
	// 특별 업적(운영진이 주는 것)은 금 · 은 · 동에 세지 않는다
	const count = (t: 1 | 2 | 3) => data.items.filter((a) => a.tier === t && !a.granted).length;
	const shown = $derived(cat === 'all' ? data.items : data.items.filter((a) => a.category === cat));
	const featuredCodes = $derived(data.featured.map((b) => b.code));

	async function toggleFeature(a: Achievement) {
		if (busy) return;
		busy = true;
		const ok = await onfeature(toggledFeatured(data, a.code));
		busy = false;
		if (ok) open = null;
	}
</script>

<section class="summary" aria-label="업적 요약">
	<div class="big">
		<strong class="num">{earned.length}</strong><span class="num">/ {data.items.length}</span>
		<small>모은 업적</small>
	</div>
	<ul class="metals">
		<li><span class="dot g"></span>금 <b class="num">{count(3)}</b></li>
		<li><span class="dot s"></span>은 <b class="num">{count(2)}</b></li>
		<li><span class="dot b"></span>동 <b class="num">{count(1)}</b></li>
	</ul>
</section>

<section class="featured" aria-labelledby="feat-h">
	<div class="feat-head">
		<h2 id="feat-h">대표 업적</h2>
	</div>
	<div class="feat-row">
		{#each [0, 1, 2] as i (i)}
			{@const b = data.featured[i]}
			<div class="slot">
				{#if b}
					<Badge code={b.code} icon={b.icon} tier={b.tier} title={b.title} size={60} label shine />
					<span class="slot-name">{b.title}</span>
				{:else}
					<span class="empty" aria-hidden="true">+</span>
					<span class="slot-name muted">비어 있음</span>
				{/if}
			</div>
		{/each}
	</div>
</section>

<nav class="cats" aria-label="분류">
	{#each CATEGORIES as c (c.k)}
		<button class:on={cat === c.k} aria-pressed={cat === c.k} onclick={() => (cat = c.k)}>{c.label}</button>
	{/each}
</nav>

<ul class="grid">
	{#each shown as a (a.code)}
		<li>
			<button class="card" class:locked={a.tier === 0} onclick={() => (open = a)}>
				{#if a.new}<span class="new" aria-label="새 업적">NEW</span>{/if}
				<Badge code={a.code} icon={a.icon} tier={a.tier} title={a.title} size={52} label shine={a.new} />
				<span class="name">{a.title}</span>
				<span class="desc">{a.description}</span>
				<span class="bar" aria-hidden="true"><i style:width="{progress(a) * 100}%"></i></span>
				<span class="prog num">{progressText(a)}</span>
			</button>
		</li>
	{/each}
</ul>

{#if open}
	{@const a = open}
	<Sheet onclose={() => (open = null)} label={a.title}>
		<BadgeDetail badge={a} def={a} sub={a.granted ? '' : progressText(a)}>
			{#if a.tier > 0}
				<button aria-busy={busy} class="btn feat" onclick={() => toggleFeature(a)} disabled={busy}>
					{featuredCodes.includes(a.code) ? '대표 업적에서 내리기' : '대표 업적으로 걸기'}
				</button>
			{:else}
				<p class="muted small locked-note">아직 잠겨 있어요</p>
			{/if}
		</BadgeDetail>
	</Sheet>
{/if}

<style>
	.summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 18px 20px;
		border-radius: var(--r-card);
		background: var(--accent-fill-deep);
		color: var(--on-accent);
	}
	.big {
		display: flex;
		align-items: baseline;
		gap: 4px;
		flex-wrap: wrap;
	}
	.big strong {
		font-size: 34px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}
	.big span {
		font-size: 16px;
		font-weight: 600;
		opacity: 0.85;
	}
	.big small {
		flex-basis: 100%;
		font-size: 12px;
		opacity: 0.85;
	}
	.metals {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 13px;
		font-weight: 600;
	}
	.metals li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.metals b {
		min-width: 18px;
		text-align: right;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		box-shadow: 0 0 0 1.5px rgb(255 255 255 / 0.7);
	}
	.dot.g {
		background: #f2c14e;
	}
	.dot.s {
		background: #cfd6de;
	}
	.dot.b {
		background: #c98a55;
	}

	.featured {
		padding: 16px;
		border-radius: var(--r-card);
		background: var(--surface);
		border: 1px solid var(--line);
	}
	.feat-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 12px;
	}
	.feat-head h2 {
		margin: 0;
		font-size: 15px;
	}
	.feat-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	.slot-name {
		font-size: 12px;
		font-weight: 600;
		text-align: center;
	}
	.empty {
		display: grid;
		place-items: center;
		width: 60px;
		height: 60px;
		border-radius: 50%;
		border: 2px dashed var(--line);
		color: var(--text-2);
		font-size: 22px;
	}

	/* 위아래 여백은 칸(36)의 누름 영역 44 가 잘리지 않게 */
	.cats {
		display: flex;
		gap: 8px;
		padding: 4px 0;
		margin: -4px 0;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.cats button::after {
		content: '';
		position: absolute;
		inset: -4px min(-4px, calc(50% - 22px));
	}
	.cats button:active {
		transform: scale(0.95);
	}
	.cats button {
		position: relative;
		flex: none;
		min-height: 36px;
		padding: 0 16px;
		transition: transform 0.15s;
		border-radius: 999px;
		background: var(--field);
		font-size: 13px;
		font-weight: 700;
	}
	.cats button.on {
		background: var(--text);
		color: var(--bg);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.card {
		position: relative;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 16px 12px 14px;
		border-radius: 20px;
		background: var(--surface);
		border: 1px solid var(--line);
		text-align: center;
		transition: transform 0.15s ease-out;
	}
	.card:active {
		transform: scale(0.97);
	}
	.name {
		margin-top: 4px;
		font-size: 14px;
		font-weight: 700;
	}
	.locked .name {
		color: var(--text-2);
	}
	.desc {
		font-size: 11px;
		color: var(--text-2);
		line-height: 1.35;
	}
	.bar {
		width: 100%;
		height: 5px;
		margin-top: 4px;
		border-radius: 999px;
		background: var(--field);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--accent-fill-deep);
	}
	.prog {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-2);
	}
	.new {
		position: absolute;
		top: 10px;
		right: 10px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--accent-fill-deep);
		color: var(--on-accent);
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.04em;
	}

	/* 자세히(BadgeDetail) 아래 — 대표 업적 걸기 */
	.feat {
		width: 100%;
		max-width: 320px;
	}
	.locked-note {
		margin: 0;
	}
</style>
