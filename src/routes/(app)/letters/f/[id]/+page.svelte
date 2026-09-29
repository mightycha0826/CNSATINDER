<script lang="ts">
	/**
	 * 편지 폴더 한 개 (Phase 47) — 보관함의 폴더 서랍에서. 받은 · 보낸 편지가 섞여서 최근 것부터 (봉투는 편지마다 제 모양).
	 * 봉투마다 "받은 편지" · "보낸 편지" 딱지, 둘 다 들어 있으면 위에 전체 · 받은 편지 · 보낸 편지 나눠 보기(편지 수는 서버가 센 것, Phase 47-3).
	 * 누르면 편지를 연다. 고르기 → "폴더에서 빼기"(보관함으로) · "다른 폴더로". ⋯ → 이름 바꾸기 · 폴더 지우기(편지는 보관함으로).
	 */
	import { page } from '$app/state';
	import BackButton from '$lib/ui/BackButton.svelte';
	import MoreButton from '$lib/ui/MoreButton.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import MailStack from '$lib/letters/MailStack.svelte';
	import FolderPicker from '$lib/letters/FolderPicker.svelte';
	import SelectBar from '$lib/letters/SelectBar.svelte';
	import { BOX, PAGE, refreshMailbox } from '$lib/letters/mailbox.svelte';
	import { FOLDER_MAX, deleteFolder, fetchFolder, folderError, renameFolder, takeFromFolder, type Box, type MailItem } from '$lib/letters/api';
	import { backClose, historySettled, navigateFromOverlay } from '$lib/overlay.svelte';
	import { errMsg, toast } from '$lib/state.svelte';

	const id = $derived(Number(page.params.id));
	let name = $state('');
	let items = $state<MailItem[]>([]);
	let loaded = $state(false);
	let gone = $state(false);
	let more = $state(false);
	let busy = $state(false);

	// 받은 · 보낸 편지 수 (폴더 전체 — 아직 안 불러온 쪽까지) · 나눠 보기
	let counts = $state({ received: 0, sent: 0 });
	let kind = $state<'all' | Box>('all');
	const mixed = $derived(counts.received > 0 && counts.sent > 0);
	const view = $derived(mixed ? kind : 'all');
	const shown = $derived(view === 'all' ? items : items.filter((x) => x.box === view));
	const KINDS = [
		['all', '전체'],
		['received', '받은 편지'],
		['sent', '보낸 편지']
	] as const;
	const countOf = (k: 'all' | Box) => (k === 'all' ? counts.received + counts.sent : counts[k]);
	/** 목록에서 빠진 편지 — 수도 같이 줄인다 */
	function drop(out: (x: MailItem) => boolean) {
		for (const x of items) if (out(x)) counts[x.box === 'sent' ? 'sent' : 'received']--;
		items = items.filter((x) => !out(x));
	}

	async function load() {
		kind = 'all';
		try {
			const r = await fetchFolder(id);
			if (!r.folder) {
				gone = true;
				return;
			}
			name = r.folder.name;
			items = r.letters;
			more = r.letters.length === PAGE;
			const n = (b: Box) => r.letters.filter((x) => x.box === b).length;
			counts = { received: r.folder.received ?? n('received'), sent: r.folder.sent ?? n('sent') };
		} catch (e) {
			toast(errMsg(e));
		} finally {
			loaded = true;
		}
	}
	$effect(() => {
		void id;
		void load();
	});
	async function loadMore() {
		const last = items.at(-1);
		if (!last || busy) return;
		busy = true;
		const r = await fetchFolder(id, last.id).catch(() => null);
		if (r) {
			items = [...items, ...r.letters];
			more = r.letters.length === PAGE;
		}
		busy = false;
	}

	// ── 고르기 ──
	let selecting = $state(false);
	let picked = $state<number[]>([]);
	let moving = $state(false);
	backClose(() => stopSelect(), { open: () => selecting });
	function stopSelect() {
		selecting = false;
		picked = [];
		moving = false;
	}
	const toggle = (it: MailItem) => (picked = picked.includes(it.id) ? picked.filter((x) => x !== it.id) : [...picked, it.id]);
	/** 폴더에서 나간 편지 — 목록에서 빼고, 보관함 목록 · 폴더 수를 새로 */
	function leave(ids: number[]) {
		const out = new Set(ids);
		drop((x) => out.has(x.id));
		refreshMailbox();
	}
	async function takeOut() {
		const ids = picked;
		try {
			const r = await takeFromFolder(ids);
			const err = folderError(r);
			if (err) return toast(err);
			stopSelect();
			leave(ids);
			toast(`${ids.length}통을 보관함으로 돌려놨어요`);
		} catch (e) {
			toast(errMsg(e));
		}
	}
	async function moved(to: string) {
		const ids = picked;
		moving = false;
		await historySettled(); // 폴더 시트의 뒤로가기 칸이 걷힌 뒤에 고르기를 끝낸다
		stopSelect();
		leave(ids);
		toast(to ? `'${to}' 폴더로 ${ids.length}통을 옮겼어요` : '옮겼어요');
	}

	// ── ⋯ 메뉴: 이름 바꾸기 · 지우기 ──
	let menu = $state<null | 'menu' | 'rename' | 'delete'>(null);
	let draft = $state('');
	let acting = $state(false);
	async function rename() {
		const nm = draft.trim().replace(/\s+/g, ' ');
		if (!nm || acting) return;
		acting = true;
		try {
			const r = await renameFolder(id, nm);
			const err = folderError(r);
			if (err) return toast(err);
			name = nm;
			const f = BOX.folders.find((x) => x.id === id);
			if (f) f.name = nm;
			menu = null;
			toast('폴더 이름을 바꿨어요');
		} catch (e) {
			toast(errMsg(e));
		} finally {
			acting = false;
		}
	}
	async function remove() {
		if (acting) return;
		acting = true;
		try {
			const r = await deleteFolder(id);
			const err = folderError(r);
			if (err) return toast(err);
			BOX.folders = BOX.folders.filter((x) => x.id !== id);
			refreshMailbox();
			toast(`'${name}' 폴더를 지웠어요 · 편지는 보관함으로 돌아갔어요`);
			// 메뉴 시트를 닫으며 이동 — 시트의 뒤로가기 칸과 이동이 서로 취소하지 않게 (G5.2)
			void navigateFromOverlay('/letters/archive', { replaceState: true });
			menu = null;
		} catch (e) {
			toast(errMsg(e));
		} finally {
			acting = false;
		}
	}
</script>

<div class="topbar">
	<BackButton href="/letters/archive" history />
	<span class="title fname">{selecting ? '편지 고르기' : name || '폴더'}</span>
	{#if selecting}
		<button class="btn-text push" onclick={stopSelect}>취소</button>
	{:else if !gone && loaded}
		{#if items.length}<button class="btn-text push" onclick={() => (selecting = true)}>고르기</button>{/if}
		<MoreButton onclick={() => (menu = 'menu')} label="폴더 메뉴" push={!items.length} />
	{/if}
</div>

<div class="page folder" class:selecting>
	{#if gone}
		<p class="muted center">폴더를 찾을 수 없어요</p>
	{:else if loaded && items.length === 0}
		<div class="empty">
			<span class="icon" aria-hidden="true"></span>
			<p>폴더가 비어 있어요</p>
			<a class="btn-text" href="/letters/archive">보관함에서 편지 골라 넣기</a>
		</div>
	{:else}
		{#if mixed}
			<!-- 받은 · 보낸 편지가 섞인 폴더 — 나눠 보기 (Phase 47-3) -->
			<div class="seg" role="tablist" aria-label="폴더 편지 나눠 보기" style:--i={KINDS.findIndex(([k]) => k === view)}>
				{#each KINDS as [k, label] (k)}
					<button role="tab" class:on={view === k} aria-selected={view === k} aria-label="{label} {countOf(k)}통" onclick={() => (kind = k)}>{label}<span class="n num">{countOf(k)}</span></button>
				{/each}
				<span class="thumb" aria-hidden="true"></span>
			</div>
		{/if}
		<!-- 나눠 보기를 바꾸면 봉투가 다시 한 통씩 내려앉는다 -->
		{#key view}
			<MailStack
				items={shown}
				box="received"
				loading={!loaded}
				ghosts={2}
				{selecting}
				{picked}
				showBox
				ontoggle={toggle}
				ondrop={(t) => drop((x) => x.thread_id === t)}
			/>
		{/key}
		{#if loaded && !shown.length && items.length}
			<p class="muted center">불러온 편지 중에는 {view === 'sent' ? '보낸' : '받은'} 편지가 없어요</p>
		{/if}
		{#if more}<button class="more" onclick={loadMore} disabled={busy}>{busy ? '가져오는 중…' : '지난 편지 더 보기'}</button>{/if}
	{/if}
</div>

{#if selecting}
	<SelectBar count={picked.length}>
		<button class="plain" onclick={takeOut} disabled={!picked.length}>폴더에서 빼기</button>
		<button class="go" onclick={() => (moving = true)} disabled={!picked.length}>다른 폴더로</button>
	</SelectBar>
{/if}
{#if moving}
	<FolderPicker ids={picked} folders={BOX.folders} exclude={id} onclose={() => (moving = false)} ondone={moved} />
{/if}

{#if menu}
	<Sheet onclose={() => (menu = null)} label="폴더 메뉴">
		{#if menu === 'menu'}
			<p class="ask">{name}</p>
			<button class="item" onclick={() => ((draft = name), (menu = 'rename'))}>이름 바꾸기</button>
			<button class="item danger" onclick={() => (menu = 'delete')}>폴더 지우기</button>
			<button class="item cancel" onclick={() => (menu = null)}>취소</button>
		{:else if menu === 'rename'}
			<p class="ask">폴더 이름 바꾸기</p>
			<form
				class="rename"
				onsubmit={(e) => {
					e.preventDefault();
					void rename();
				}}
			>
				<input class="field" bind:value={draft} maxlength={FOLDER_MAX} aria-label="새 폴더 이름" autocomplete="off" enterkeyhint="done" />
				<button class="item" type="submit" disabled={!draft.trim() || acting} aria-busy={acting}>바꾸기</button>
			</form>
			<button class="item" onclick={() => (menu = 'menu')}>돌아가기</button>
		{:else}
			<p class="ask">'{name}' 폴더를 지울까요?</p>
			<p class="warn">편지는 지워지지 않고 보관함(받은 편지 · 보낸 편지)으로 돌아가요.</p>
			<button class="item danger" onclick={remove} disabled={acting} aria-busy={acting}>폴더 지우기</button>
			<button class="item" onclick={() => (menu = 'menu')}>돌아가기</button>
		{/if}
	</Sheet>
{/if}

<style>
	.folder {
		gap: 16px;
		padding-top: 14px;
		padding-bottom: calc(40px + env(safe-area-inset-bottom));
		background: var(--desk);
	}
	.folder.selecting {
		padding-bottom: calc(110px + env(safe-area-inset-bottom));
	}
	.fname {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.push {
		margin-left: auto;
		margin-right: -6px;
	}
	.center {
		margin: 48px 0;
		text-align: center;
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		margin-top: 56px;
		text-align: center;
	}
	.empty p {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
	}
	/* 빈 마닐라 폴더 */
	.icon {
		position: relative;
		width: 72px;
		height: 50px;
		margin-bottom: 8px;
		border-radius: 3px 8px 8px 8px;
		background: linear-gradient(180deg, #f1d49a, #e4bf78);
		box-shadow: 0 6px 14px -6px rgb(70 40 10 / 0.45);
	}
	.icon::before {
		content: '';
		position: absolute;
		top: -6px;
		left: 0;
		width: 30px;
		height: 9px;
		border-radius: 4px 6px 0 0;
		background: #f1d49a;
	}
	/* 세 칸 분할 버튼 (보관함의 두 칸과 같은 모양) — 고른 쪽 아래로 흰 알약이 미끄러진다 */
	.seg {
		position: relative;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 4px;
		border-radius: 999px;
		background: var(--field);
	}
	.seg button {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-width: 0;
		height: 38px;
		padding: 0 4px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 700;
		white-space: nowrap;
		color: var(--text-2);
		transition: color 0.25s;
	}
	/* 보이는 칸은 38, 누름은 둘레 여백까지 44 (G1) */
	.seg button::after {
		content: '';
		position: absolute;
		inset: -4px 0;
	}
	.seg button:active {
		opacity: 0.6;
	}
	.seg button.on {
		color: var(--text);
	}
	.seg .n {
		font-size: 12px;
		font-weight: 800;
		opacity: 0.75;
	}
	.thumb {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 4px;
		width: calc((100% - 8px) / 3);
		border-radius: 999px;
		background: var(--bg);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.1);
		transform: translateX(calc(var(--i, 0) * 100%));
		transition: transform 0.35s cubic-bezier(0.3, 0.8, 0.25, 1.05);
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
	.ask {
		margin: 4px 0 10px;
		overflow: hidden;
		font-size: 17px;
		font-weight: 800;
		text-align: center;
		text-overflow: ellipsis;
	}
	.rename {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 4px;
	}
	.rename .field {
		width: auto;
		margin: 0 var(--pad);
		font-size: 16px;
	}
</style>
