<script lang="ts">
	/**
	 * 익명편지 탭 (Phase 23 이름 편지) — 위: 학생 찾기, 아래: 받은 편지 · 보낸 편지.
	 * 찾은 학생을 누르면 편지 쓰기로. 받은 편지에서 보낸 사람은 가명으로만 보인다.
	 * 편지 줄을 길게 누르면(마우스는 오른쪽 클릭) 신고 · 차단 · 나가기 (LetterMenu).
	 */
	import { goto } from '$app/navigation';
	import Avatar from '$lib/ui/Avatar.svelte';
	import TopbarMe from '$lib/ui/TopbarMe.svelte';
	import { S, errMsg, toast } from '$lib/state.svelte';
	import { ago } from '$lib/time';
	import { whileVisible } from '$lib/visible';
	import { fetchInbox, searchPeople, type DmItem, type DmPerson } from '$lib/letters/api';
	import { DM, LIST, countUnread } from '$lib/letters/unread.svelte';
	import LetterMenu from '$lib/letters/LetterMenu.svelte';
	import { longpress } from '$lib/longpress';

	// ── 찾기 ──
	let q = $state('');
	let results = $state<DmPerson[] | null>(null);
	let searching = $state(false);
	$effect(() => {
		const term = q.trim();
		if (term.length < 2) {
			results = null;
			return;
		}
		searching = true;
		const t = setTimeout(async () => {
			try {
				const r = await searchPeople(term);
				if (q.trim() === term) results = r;
			} catch (e) {
				toast(errMsg(e));
			} finally {
				searching = false;
			}
		}, 250);
		return () => clearTimeout(t);
	});

	function pick(p: DmPerson) {
		// 기록(history)에는 복사본만 넣을 수 있다 — $state 프록시를 그대로 넣으면 브라우저가 거부한다
		void goto('/letters/new', { state: { to: $state.snapshot(p) } });
	}

	// ── 목록 ──
	let items = $state<DmItem[]>([]);
	let loaded = $state(false);
	let skew = $state(0);
	// 보고 있던 탭은 LIST 에 — 편지를 열었다 뒤로 와도 그대로 (보낸 편지에서 들어갔으면 보낸 편지로)
	const tab = $derived(LIST.tab);
	async function load() {
		try {
			const r = await fetchInbox();
			items = r.threads;
			skew = Date.parse(r.server_now) - Date.now();
			DM.unread = countUnread(r.threads);
		} catch {
			/* 다음 번에 */
		} finally {
			loaded = true;
		}
	}
	$effect(() => {
		void load();
		return whileVisible(() => void load(), 30_000);
	});

	const list = $derived(items.filter((i) => i.role === tab));
	// 길게 누른 편지 — 메뉴를 띄운다. 나가기 · 차단 · 신고를 하면 목록에서 사라지므로 다시 읽는다
	let menuFor = $state<DmItem | null>(null);
	const unreadOf = (r: 'received' | 'sent') => items.filter((i) => i.role === r).reduce((n, i) => n + i.unread, 0);
	const gradeText = (g: number | null) => (g ? `${g}학년` : '');
</script>

<div class="topbar">
	<span class="title">익명편지</span>
	<TopbarMe />
</div>

<div class="page letters">
	<label class="search">
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8" />
			<path d="M16 16l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
		</svg>
		<input
			type="search"
			bind:value={q}
			placeholder="이름으로 찾아서 익명 편지 보내기"
			aria-label="편지 받을 학생 찾기"
			autocomplete="off"
			enterkeyhint="search"
		/>
	</label>

	{#if results !== null}
		<section class="results" aria-label="찾은 학생">
			{#if results.length === 0}
				<p class="muted empty">{searching ? '찾는 중…' : '찾는 사람이 없어요. 편지 받기를 꺼 둔 사람은 나오지 않아요.'}</p>
			{:else}
				{#each results as p (p.id)}
					<button class="person" onclick={() => pick(p)}>
						<Avatar name={p.name} size={40} />
						<span class="who">
							<b>{p.name}</b>
							<small class="muted">{gradeText(p.grade)}{p.checked ? '' : `${p.grade ? ' · ' : ''}직접 적은 이름`}</small>
						</span>
						<span class="go">편지 쓰기</span>
					</button>
				{/each}
			{/if}
		</section>
	{:else}

		<div class="tabs" role="tablist">
			<button role="tab" class:on={tab === 'received'} aria-selected={tab === 'received'} onclick={() => (LIST.tab = 'received')}>
				받은 편지{#if unreadOf('received')}<span class="dot" aria-label="안 읽은 편지 있음"></span>{/if}
			</button>
			<button role="tab" class:on={tab === 'sent'} aria-selected={tab === 'sent'} onclick={() => (LIST.tab = 'sent')}>
				보낸 편지{#if unreadOf('sent')}<span class="dot" aria-label="안 읽은 답장 있음"></span>{/if}
			</button>
		</div>

		{#if !loaded}
			<p class="muted empty">불러오는 중…</p>
		{:else if list.length === 0}
			<p class="muted empty">
				{tab === 'received' ? '아직 받은 편지가 없어요.' : '위에서 이름을 찾아 첫 편지를 보내 보세요.'}
			</p>
		{:else}
			<ul class="threads">
				{#each list as t (t.id)}
					<li>
						<button class="thread" class:unread={t.unread > 0} onclick={() => goto(`/letters/${t.id}`)} use:longpress={() => (menuFor = t)}>
							{#if t.role === 'received'}
								<span class="anon" aria-hidden="true">?</span>
							{:else}
								<Avatar name={t.title} size={48} />
							{/if}
							<span class="body">
								<span class="line1">
									<b>{t.title}</b>
									{#if t.role === 'sent' && t.grade}<small class="muted">{t.grade}학년</small>{/if}
									{#if t.status === 'closed'}<small class="muted ended">끝남</small>{/if}
								</span>
								<span class="line2 muted">{t.last_body ?? ''}</span>
							</span>
							<span class="meta">
								<small class="muted num">{ago(t.last_at, S.now + skew)}</small>
								{#if t.unread}<span class="badge num">{t.unread}</span>{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

{#if menuFor}
	<LetterMenu
		thread={menuFor}
		title={menuFor.title}
		onclose={() => (menuFor = null)}
		ondone={() => {
			const id = menuFor?.id;
			menuFor = null;
			items = items.filter((i) => i.id !== id); // 바로 지우고, 서버 목록으로 맞춘다
			void load();
		}}
	/>
{/if}

<style>
	.letters {
		padding-top: 12px;
		padding-bottom: 24px;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 42px;
		padding: 0 14px;
		border-radius: 12px;
		background: var(--field);
		color: var(--text-2);
	}
	.search svg {
		flex: none;
		width: 18px;
		height: 18px;
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: none;
		background: none;
		color: var(--text);
		font-size: 15px;
	}
	.search input::placeholder {
		color: var(--text-2);
	}
	.empty {
		margin: 32px 0;
		text-align: center;
		font-size: 14px;
	}

	.results {
		display: flex;
		flex-direction: column;
		margin-top: 8px;
	}
	.person {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 2px;
		text-align: left;
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.who b {
		font-size: 15px;
		font-weight: 600;
	}
	.who small {
		font-size: 12px;
	}
	.go {
		flex: none;
		padding: 7px 12px;
		border-radius: 8px;
		background: var(--accent-fill);
		color: var(--on-accent);
		font-size: 13px;
		font-weight: 600;
	}

	.tabs {
		display: flex;
		gap: 6px;
		margin: 14px 0 4px;
	}
	.tabs button {
		position: relative;
		padding: 7px 14px;
		border-radius: 999px;
		background: var(--field);
		font-size: 14px;
		font-weight: 500;
	}
	.tabs button.on {
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
	}
	.dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		margin-left: 5px;
		border-radius: 50%;
		background: #ff3040;
		vertical-align: 2px;
	}

	.threads {
		margin: 4px 0 0;
		padding: 0;
		list-style: none;
	}
	.thread {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 10px 0;
		text-align: left;
	}
	.anon {
		flex: none;
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: var(--bubble-fill);
		color: #fff;
		font-size: 20px;
		font-weight: 800;
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.line1 {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
	}
	.line1 b {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 15px;
		font-weight: 500;
	}
	.thread.unread .line1 b {
		font-weight: 700;
	}
	.line1 small {
		flex: none;
		font-size: 12px;
	}
	.ended {
		padding: 0 6px;
		border-radius: 999px;
		background: var(--field);
	}
	.line2 {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 14px;
	}
	.thread.unread .line2 {
		color: var(--text);
		font-weight: 500;
	}
	.meta {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.meta small {
		font-size: 12px;
	}
	.badge {
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 10px;
		background: #ff3040;
		color: #fff;
		font-size: 12px;
		font-weight: 700;
		line-height: 20px;
		text-align: center;
	}
</style>
