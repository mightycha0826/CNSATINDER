<script lang="ts">
	/**
	 * 업적 화면 본문 (Phase 31) — /me/achievements 와 개발용 미리보기(/dev/achievements)가 같이 쓴다.
	 * 위: 금 · 은 · 동 개수와 대표 업적(대화 상대에게 보이는 3개). 아래: 분류 탭 + 메달 격자.
	 * 메달을 누르면 등급 기준과 "대표 업적으로 걸기".
	 */
	import Badge from './Badge.svelte';
	import Sheet from './Sheet.svelte';
	import {
		CATEGORIES,
		TIER_NAME,
		progress,
		progressText,
		tierLine,
		type Achievement,
		type Category,
		type MyAchievements
	} from '$lib/achievements';

	let { data, onfeature }: { data: MyAchievements; onfeature: (codes: string[]) => Promise<boolean> } = $props();

	let cat = $state<Category | 'all'>('all');
	let open = $state<Achievement | null>(null);
	let busy = $state(false);

	const earned = $derived(data.items.filter((a) => a.tier > 0));
	const count = (t: 1 | 2 | 3) => data.items.filter((a) => a.tier === t).length;
	const shown = $derived(cat === 'all' ? data.items : data.items.filter((a) => a.category === cat));
	const featuredCodes = $derived(data.featured.map((b) => b.code));

	async function toggleFeature(a: Achievement) {
		if (busy) return;
		// 고른 것이 없으면(자동) 지금 보이는 대표 업적에서 시작한다
		const base = data.chosen.length ? [...data.chosen] : [...featuredCodes];
		const next = base.includes(a.code) ? base.filter((c) => c !== a.code) : [a.code, ...base].slice(0, 3);
		busy = true;
		const ok = await onfeature(next);
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
		<span>대화 상대에게 보여요</span>
	</div>
	<div class="feat-row">
		{#each [0, 1, 2] as i (i)}
			{@const b = data.featured[i]}
			<div class="slot">
				{#if b}
					<Badge icon={b.icon} tier={b.tier} title={b.title} size={60} label shine />
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
				<Badge icon={a.icon} tier={a.tier} title={a.title} size={52} label shine={a.new} />
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
		<div class="detail">
			<Badge icon={a.icon} tier={a.tier} title={a.title} size={88} label shine />
			<h3>{a.title}</h3>
			<p class="muted">{a.description} · {progressText(a)}</p>
			<ol class="tiers">
				{#each [1, 2, 3] as const as t (t)}
					<li class:done={a.tier >= t}>
						<span class="dot {t === 3 ? 'g' : t === 2 ? 's' : 'b'}"></span>
						<b>{TIER_NAME[t]}</b>
						<span class="num">{tierLine(a, t)}</span>
						{#if a.tier >= t}<span class="check" aria-label="달성">✓</span>{/if}
					</li>
				{/each}
			</ol>
			{#if a.tier > 0}
				<button class="btn" onclick={() => toggleFeature(a)} disabled={busy}>
					{featuredCodes.includes(a.code) ? '대표 업적에서 내리기' : '대표 업적으로 걸기'}
				</button>
			{:else}
				<p class="muted small">아직 잠겨 있어요 · 동 등급부터 대표로 걸 수 있어요</p>
			{/if}
		</div>
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
	.feat-head span {
		font-size: 12px;
		color: var(--text-2);
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

	.cats {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.cats button {
		flex: none;
		padding: 7px 14px;
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

	.detail {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 18px var(--pad) 10px;
		text-align: center;
	}
	.detail h3 {
		margin: 6px 0 0;
		font-size: 20px;
	}
	.detail p {
		margin: 0;
	}
	.tiers {
		width: 100%;
		max-width: 320px;
		margin: 8px 0 10px;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.tiers li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-radius: 14px;
		background: var(--field);
		font-size: 14px;
		opacity: 0.6;
	}
	.tiers li.done {
		opacity: 1;
	}
	.tiers .dot {
		box-shadow: none;
	}
	.tiers .num {
		margin-left: auto;
		color: var(--text-2);
	}
	.check {
		color: var(--accent);
		font-weight: 800;
	}
	.detail .btn {
		width: 100%;
		max-width: 320px;
	}
</style>
