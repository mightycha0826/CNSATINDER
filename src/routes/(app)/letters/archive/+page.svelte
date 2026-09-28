<script lang="ts">
	/**
	 * 편지 보관함 (Phase 35 · 37) — 편지함 아래 서류 더미를 누르면. 지금까지 받은 편지 · 보낸 편지.
	 * 편지함처럼 큰 봉투가 한 장씩 비스듬히 놓여 있다 (Phase 37 — 예전엔 작은 봉투 한 줄씩).
	 *   받은 편지 = 덮개 쪽(보낸 사람 성별 색 테두리 · 안 연 편지는 봉인) / 보낸 편지 = 주소 쪽(To. · 우표 · 소인 · 읽음/답장 옴 스티커).
	 * 누르면 그 편지를 연다. 길게 누르면 신고 · 차단 · 나가기 (LetterMenu).
	 */
	import { goto } from '$app/navigation';
	import BackButton from '$lib/ui/BackButton.svelte';
	import LetterMenu from '$lib/letters/LetterMenu.svelte';
	import MailboxItem from '$lib/letters/MailboxItem.svelte';
	import { anonName, fromLabel, toLabel, type Box, type MailItem } from '$lib/letters/api';
	import { BOX, dropThread, loadMore, refreshMailbox } from '$lib/letters/mailbox.svelte';
	import { LIST } from '$lib/letters/unread.svelte';
	import { envWidth } from '$lib/letters/stage';
	import { S } from '$lib/state.svelte';

	$effect(() => refreshMailbox());

	let vw = $state(390);
	const w = $derived(envWidth(vw, 340, 56));

	const tab = $derived(LIST.tab);
	const list = $derived(BOX[tab]);
	let menuFor = $state<{ it: MailItem; box: Box } | null>(null);
	let busy = $state(false);

	// 봉투에 적힌 나 — 받은 편지의 To. / 보낸 편지의 From.
	//   모르는 사람과 주고받은 편지면 내 이름, 내가 익명으로 보낸 편지(와 그 답장)면 내 서명 · 익명의 나
	const myName = $derived(S.me?.name ?? '나');
	const anonMe = (it: MailItem) => it.my_nick ?? anonName(S.profile?.gender);
	const meFor = (it: MailItem, box: Box) => ((box === 'received' ? it.from_name : it.to_name) ? anonMe(it) : myName);
	const who = (it: MailItem, box: Box) => (box === 'received' ? fromLabel(it) : toLabel(it));
	// 봉투를 살짝씩 비뚤게 — 편지함과 같은 느낌
	const tilt = (i: number) => [-1.6, 1.2, -0.6, 1.8, -1.2, 0.8][i % 6];

	async function more() {
		if (busy) return;
		busy = true;
		await loadMore(tab);
		busy = false;
	}
</script>

<svelte:window bind:innerWidth={vw} />

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
		<div class="ghost" style:--w="{w}px" aria-label="불러오는 중"></div>
		<div class="ghost" style:--w="{w}px" aria-hidden="true"></div>
	{:else if list.length === 0}
		<p class="muted center">{tab === 'received' ? '아직 받은 편지가 없어요' : '아직 보낸 편지가 없어요'}</p>
	{:else}
		{#key tab}
			<ul class="stack">
				{#each list as it, i (it.id)}
					<li class="arrive" style:--i={Math.min(i, 8)}>
						<MailboxItem
							item={it}
							box={tab}
							me={meFor(it, tab)}
							{w}
							tilt={tilt(i)}
							onopen={() => goto(`/letters/m/${it.id}`)}
							onmenu={() => (menuFor = { it, box: tab })}
						/>
					</li>
				{/each}
			</ul>
		{/key}
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
		gap: 16px;
		padding-top: 12px;
		padding-bottom: calc(40px + env(safe-area-inset-bottom));
		background: var(--desk);
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
	/* 보이는 칸은 38, 누름은 둘레 여백까지 44 (G1) */
	.seg button::after {
		content: '';
		position: absolute;
		inset: -4px 0;
	}
	.seg button:active {
		opacity: 0.6;
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
	/* 큰 봉투 목록 — 편지함(/letters)의 새 편지와 같은 모양 */
	.stack {
		display: flex;
		flex-direction: column;
		gap: 26px;
		margin: 10px 0 4px;
		padding: 0;
		list-style: none;
	}
	/* 탭을 바꾸거나 들어오면 한 통씩 조금 늦게 내려앉는다 */
	.arrive {
		animation: arrive 0.55s calc(var(--i) * 60ms) cubic-bezier(0.2, 0.9, 0.3, 1.08) both;
	}
	@keyframes arrive {
		from {
			opacity: 0;
			transform: translateY(-16px) rotate(-2deg);
		}
	}
	.ghost {
		align-self: center;
		width: var(--w);
		height: calc(var(--w) * 0.62);
		margin-top: 10px;
		border-radius: 8px;
		background: linear-gradient(100deg, var(--field) 30%, var(--surface) 50%, var(--field) 70%) 0 0 / 300% 100%;
		animation: shimmer 1.4s ease-in-out infinite;
	}
	@keyframes shimmer {
		from {
			background-position: 100% 0;
		}
		to {
			background-position: 0 0;
		}
	}
	.center {
		margin: 40px 0;
		text-align: center;
	}
	.more:active:not(:disabled) {
		transform: scale(0.96);
	}
	.more {
		align-self: center;
		height: 38px;
		margin-top: 6px;
		padding: 0 16px;
		border-radius: 999px;
		background: var(--field);
		font-size: 13px;
		font-weight: 700;
	}
</style>
