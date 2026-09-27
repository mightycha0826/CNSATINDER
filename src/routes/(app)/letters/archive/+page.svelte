<script lang="ts">
	/**
	 * 편지 보관함 (Phase 35) — 편지함 아래 서류 더미를 누르면. 지금까지 받은 편지 · 보낸 편지를 한 줄씩 읽기 쉽게.
	 * 한 줄 = 작은 봉투(받은 편지는 보낸 사람 성별 색 테두리) · 누구 · 날짜 · 상태(안 읽음 · 읽음 · 답장 옴).
	 * 누르면 그 편지를 연다. 길게 누르면 신고 · 차단 · 나가기 (LetterMenu).
	 */
	import { goto } from '$app/navigation';
	import BackButton from '$lib/ui/BackButton.svelte';
	import LetterMenu from '$lib/letters/LetterMenu.svelte';
	import { anonName, borderOf, fromLabel, toLabel, type Box, type MailItem } from '$lib/letters/api';
	import { BOX, dropThread, loadMore, refreshMailbox } from '$lib/letters/mailbox.svelte';
	import { LIST } from '$lib/letters/unread.svelte';
	import { longpress } from '$lib/longpress';
	import { S } from '$lib/state.svelte';

	$effect(() => refreshMailbox());

	const tab = $derived(LIST.tab);
	const list = $derived(BOX[tab]);
	let menuFor = $state<{ it: MailItem; box: Box } | null>(null);
	let busy = $state(false);

	const myName = $derived(S.me?.name ?? '나');
	const who = (it: MailItem, box: Box) => (box === 'received' ? fromLabel(it) : toLabel(it));
	const status = (it: MailItem, box: Box) =>
		it.removed ? '내려진 편지' : box === 'received' ? (it.opened ? '' : '안 읽음') : it.replied ? '답장 옴' : it.opened ? '읽음' : '전해짐';

	const when = (iso: string) => {
		const d = new Date(iso);
		const today = new Date();
		const same = d.toDateString() === today.toDateString();
		return same
			? d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
			: d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
	};

	async function more() {
		if (busy) return;
		busy = true;
		await loadMore(tab);
		busy = false;
	}
</script>

<div class="topbar">
	<BackButton href="/letters" history />
	<span class="title">편지 보관함</span>
</div>

<div class="page archive">
	<div class="seg" role="tablist" aria-label="보관함">
		<button role="tab" class:on={tab === 'received'} aria-selected={tab === 'received'} onclick={() => (LIST.tab = 'received')}>받은 편지</button>
		<button role="tab" class:on={tab === 'sent'} aria-selected={tab === 'sent'} onclick={() => (LIST.tab = 'sent')}>보낸 편지</button>
		<span class="thumb" class:right={tab === 'sent'} aria-hidden="true"></span>
	</div>

	{#if !BOX.loaded[tab] && list.length === 0}
		<ul class="rows" aria-label="불러오는 중">
			{#each [0, 1, 2, 3] as i (i)}<li class="row skel"><i></i><span><b></b><em></em></span></li>{/each}
		</ul>
	{:else if list.length === 0}
		<p class="muted center">{tab === 'received' ? '아직 받은 편지가 없어요' : '아직 보낸 편지가 없어요'}</p>
	{:else}
		<ul class="rows">
			{#each list as it (it.id)}
				{@const st = status(it, tab)}
				<li>
					<button class="row" onclick={() => goto(`/letters/m/${it.id}`)} use:longpress={() => (menuFor = { it, box: tab })}>
						<span class="mini b-{borderOf(it, tab)}" class:sealed={tab === 'received' && !it.opened} aria-hidden="true"><i></i></span>
						<span class="mid">
							<span class="name" class:bold={tab === 'received' && !it.opened}>
								{tab === 'received' ? 'From.' : 'To.'} {who(it, tab)}
								{#if tab === 'sent' && it.to_grade}<small>{it.to_grade}학년</small>{/if}
							</span>
							<span class="sub">
								{it.is_reply ? '답장' : '편지'} · {tab === 'received'
									? `To. ${it.from_name ? (it.my_nick ?? anonName(S.profile?.gender)) : myName}`
									: `From. ${it.to_name ? (it.my_nick ?? anonName(S.profile?.gender)) : myName}`}
							</span>
						</span>
						<span class="right">
							<time class="num">{when(it.created_at)}</time>
							{#if st}<span class="st" class:new={st === '안 읽음'} class:replied={st === '답장 옴'}>{st}</span>{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if BOX.more[tab]}<button class="more" onclick={more} disabled={busy}>{busy ? '가져오는 중…' : '지난 편지 더 보기'}</button>{/if}
	{/if}
</div>

{#if menuFor}
	<LetterMenu
		thread={{ id: menuFor.it.thread_id, recipient: menuFor.box === 'received' ? !menuFor.it.from_name : !menuFor.it.to_name }}
		title={who(menuFor.it, menuFor.box)}
		onclose={() => (menuFor = null)}
		ondone={() => {
			const t = menuFor?.it.thread_id;
			menuFor = null;
			if (t != null) dropThread(t);
		}}
	/>
{/if}

<style>
	.archive {
		gap: 14px;
		padding-top: 12px;
		padding-bottom: calc(28px + env(safe-area-inset-bottom));
	}
	/* 두 칸 분할 버튼 — 고른 쪽 아래로 흰 알약이 미끄러진다 */
	.seg {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 1fr;
		padding: 4px;
		border-radius: 999px;
		background: var(--field);
	}
	.seg button {
		position: relative;
		z-index: 1;
		height: 38px;
		border-radius: 999px;
		font-size: 14px;
		font-weight: 700;
		color: var(--text-2);
		transition: color 0.25s;
	}
	.seg button.on {
		color: var(--text);
	}
	.thumb {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 4px;
		width: calc(50% - 4px);
		border-radius: 999px;
		background: var(--bg);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.1);
		transition: transform 0.35s cubic-bezier(0.3, 0.8, 0.25, 1.05);
	}
	.thumb.right {
		transform: translateX(100%);
	}
	.rows {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
		border-radius: var(--r-card);
		background: var(--surface);
		box-shadow: var(--shadow-1);
		overflow: hidden;
		animation: fade-up 0.35s ease-out both;
	}
	@keyframes fade-up {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	.rows li + li .row,
	.rows li.row + li.row {
		border-top: 1px solid var(--cell-line);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 68px;
		padding: 10px 14px;
		text-align: left;
		transition: background 0.2s;
	}
	.row:active {
		background: var(--field);
	}
	/* 작은 봉투 — 항공우편 줄무늬 테두리 (받은 편지는 보낸 사람 성별 색) */
	.mini {
		--s1: var(--g-orange);
		--s2: var(--g-pink);
		position: relative;
		flex: none;
		width: 46px;
		height: 30px;
		padding: 3px;
		border-radius: 3px;
		background: repeating-linear-gradient(-45deg, var(--s1) 0 4px, var(--env-paper) 4px 6px, var(--s2) 6px 10px, var(--env-paper) 10px 12px);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
	}
	.mini i {
		display: block;
		width: 100%;
		height: 100%;
		background:
			linear-gradient(to bottom right, transparent calc(50% - 0.6px), rgb(80 60 40 / 0.3) 50%, transparent calc(50% + 0.6px)) left top / 50% 70% no-repeat,
			linear-gradient(to bottom left, transparent calc(50% - 0.6px), rgb(80 60 40 / 0.3) 50%, transparent calc(50% + 0.6px)) right top / 50% 70% no-repeat,
			var(--env-paper);
	}
	.mini.b-f {
		--s1: #d8313b;
		--s2: #9d1830;
	}
	.mini.b-m {
		--s1: #2f6fd6;
		--s2: #173f8c;
	}
	/* 안 연 편지 — 가운데 밀랍 점 */
	.mini.sealed::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 58%;
		width: 9px;
		height: 9px;
		margin: -4.5px 0 0 -4.5px;
		border-radius: 50%;
		background: radial-gradient(circle at 35% 30%, #e2455f, #b8142f 55%, #6d0718);
	}
	.mid {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name.bold {
		font-weight: 800;
	}
	.name small {
		margin-left: 4px;
		font-size: 12px;
		color: var(--text-2);
	}
	.sub {
		font-size: 12.5px;
		color: var(--text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.right {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
		font-size: 12px;
		color: var(--text-2);
	}
	.st {
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--field);
		font-size: 11px;
		font-weight: 700;
	}
	.st.new {
		background: var(--accent-fill-deep);
		color: var(--on-accent);
	}
	.st.replied {
		color: var(--accent);
	}
	.skel i {
		flex: none;
		width: 46px;
		height: 30px;
		border-radius: 3px;
		background: var(--field);
	}
	.skel span {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.skel b,
	.skel em {
		height: 10px;
		width: 55%;
		border-radius: 5px;
		background: var(--field);
		animation: pulse 1.2s ease-in-out infinite;
	}
	.skel em {
		width: 35%;
	}
	@keyframes pulse {
		50% {
			opacity: 0.5;
		}
	}
	.center {
		margin: 40px 0;
		text-align: center;
	}
	.more {
		align-self: center;
		height: 38px;
		padding: 0 16px;
		border-radius: 999px;
		background: var(--field);
		font-size: 13px;
		font-weight: 700;
	}
</style>
