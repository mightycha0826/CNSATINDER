<script lang="ts">
	/**
	 * 익명편지 탭 = 편지함 (Phase 32) — 받은 편지 · 보낸 편지를 따로. 편지 한 통 = 봉투 한 장.
	 * 받은 편지는 덮개 쪽(안 연 편지는 밀랍 봉인), 보낸 편지는 주소 쪽(우표 · 소인 · 읽음/답장 옴).
	 * 오른쪽 아래 버튼으로 새 편지. 봉투를 길게 누르면 신고 · 차단 · 나가기 (LetterMenu).
	 */
	import { goto } from '$app/navigation';
	import TopbarMe from '$lib/ui/TopbarMe.svelte';
	import MailboxItem from '$lib/letters/MailboxItem.svelte';
	import LetterMenu from '$lib/letters/LetterMenu.svelte';
	import { anonName, fetchMailbox, fromLabel, toLabel, type Box, type MailItem } from '$lib/letters/api';
	import { DM, LIST, refreshUnread } from '$lib/letters/unread.svelte';
	import { envWidth } from '$lib/letters/stage';
	import { whileVisible } from '$lib/visible';
	import { S } from '$lib/state.svelte';

	const PAGE = 30;
	let boxes = $state<Record<Box, MailItem[]>>({ received: [], sent: [] });
	let loaded = $state<Record<Box, boolean>>({ received: false, sent: false });
	let more = $state<Record<Box, boolean>>({ received: false, sent: false });
	const tab = $derived(LIST.tab);
	const list = $derived(boxes[tab]);
	let vw = $state(390);
	const w = $derived(envWidth(vw, 340, 56));

	async function load(box: Box) {
		try {
			const r = await fetchMailbox(box);
			boxes[box] = r;
			more[box] = r.length === PAGE;
		} catch {
			/* 다음 번에 */
		} finally {
			loaded[box] = true;
		}
	}
	async function loadMore() {
		const box = tab;
		const last = boxes[box].at(-1);
		if (!last) return;
		const r = await fetchMailbox(box, last.id).catch(() => [] as MailItem[]);
		boxes[box] = [...boxes[box], ...r];
		more[box] = r.length === PAGE;
	}
	$effect(() => {
		const refresh = () => {
			void load('received');
			void load('sent');
			void refreshUnread();
		};
		refresh();
		return whileVisible(refresh, 30_000);
	});

	// 받은 편지의 To. 는 나 — 모르는 사람의 편지면 내 이름, 내 편지에 온 답장이면 (나는 익명이었으니) 익명의 나
	const myName = $derived(S.me?.name ?? '나');
	const meFor = (it: MailItem) =>
		tab === 'received' ? (it.from_name ? anonName(S.profile?.gender) : myName) : it.to_name ? anonName(S.profile?.gender) : myName;
	// 봉투를 살짝씩 비뚤게 — 책상 위에 쌓인 편지처럼
	const tilt = (i: number) => [-1.6, 1.2, -0.6, 1.8, -1.2, 0.8][i % 6];

	let menuFor = $state<MailItem | null>(null);
	const recv = $derived(boxes.received.filter((i) => !i.opened).length);
</script>

<svelte:window bind:innerWidth={vw} />

<div class="topbar">
	<span class="title">익명편지</span>
	<TopbarMe />
</div>

<div class="page mailbox">
	<div class="seg" role="tablist" aria-label="편지함">
		<button role="tab" class:on={tab === 'received'} aria-selected={tab === 'received'} onclick={() => (LIST.tab = 'received')}>
			받은 편지{#if DM.unread || recv}<span class="count num" aria-label="안 읽은 편지 {DM.unread || recv}통">{DM.unread || recv}</span>{/if}
		</button>
		<button role="tab" class:on={tab === 'sent'} aria-selected={tab === 'sent'} onclick={() => (LIST.tab = 'sent')}>보낸 편지</button>
		<span class="thumb" class:right={tab === 'sent'} aria-hidden="true"></span>
	</div>

	{#if !loaded[tab]}
		<p class="muted center">편지함을 여는 중…</p>
	{:else if list.length === 0}
		<div class="empty">
			<svg viewBox="0 0 120 90" aria-hidden="true">
				<rect x="10" y="22" width="100" height="62" rx="6" fill="var(--env-paper)" stroke="var(--line)" />
				<path d="M10 28l50 32 50-32" fill="none" stroke="var(--line)" stroke-width="2" />
				<circle cx="60" cy="58" r="9" fill="#d92c55" opacity=".85" />
				<path d="M60 62s-4-2.4-4-5.4a2.2 2.2 0 0 1 4-1.3 2.2 2.2 0 0 1 4 1.3c0 3-4 5.4-4 5.4z" fill="#fff" opacity=".8" />
			</svg>
			<p>{tab === 'received' ? '아직 받은 편지가 없어요' : '아직 보낸 편지가 없어요'}</p>
			<small class="muted">{tab === 'received' ? '편지가 오면 여기에 봉인된 채로 도착해요' : '마음을 전하고 싶은 친구에게 첫 편지를 써 보세요'}</small>
		</div>
	{:else}
		<ul class="stack">
			{#each list as it, i (it.id)}
				<li>
					<MailboxItem
						item={it}
						box={tab}
						me={meFor(it)}
						{w}
						tilt={tilt(i)}
						onopen={() => goto(`/letters/m/${it.id}`)}
						onmenu={() => (menuFor = it)}
					/>
				</li>
			{/each}
		</ul>
		{#if more[tab]}<button class="more" onclick={loadMore}>지난 편지 더 보기</button>{/if}
	{/if}
</div>

<a class="fab" href="/letters/new" aria-label="편지 쓰기">
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
		<path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2" />
	</svg>
	<span>편지 쓰기</span>
</a>

{#if menuFor}
	<LetterMenu
		thread={{ id: menuFor.thread_id, recipient: tab === 'received' ? !menuFor.from_name : !menuFor.to_name }}
		title={tab === 'received' ? fromLabel(menuFor) : toLabel(menuFor)}
		onclose={() => (menuFor = null)}
		ondone={() => {
			const t = menuFor?.thread_id;
			menuFor = null;
			boxes = { received: boxes.received.filter((x) => x.thread_id !== t), sent: boxes.sent.filter((x) => x.thread_id !== t) };
			void load('received');
			void load('sent');
		}}
	/>
{/if}

<style>
	.mailbox {
		gap: 18px;
		padding-top: 12px;
		padding-bottom: 110px;
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
	.seg button {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 38px;
		border-radius: 999px;
		font-size: 14px;
		font-weight: 700;
		color: var(--text-2);
		transition: color 0.2s;
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
		transition: transform 0.3s cubic-bezier(0.3, 0.7, 0.2, 1.1);
	}
	.thumb.right {
		transform: translateX(100%);
	}
	.count {
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: var(--accent-fill);
		color: var(--on-accent);
		font-size: 11px;
		line-height: 18px;
	}
	.center {
		margin: 40px 0;
		text-align: center;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 26px;
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		margin-top: 36px;
		text-align: center;
	}
	.empty svg {
		width: 140px;
		margin-bottom: 8px;
	}
	.empty p {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
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
	.fab {
		position: fixed;
		right: max(16px, calc(50% - 260px + 16px));
		bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px);
		z-index: 20;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 52px;
		padding: 0 20px 0 16px;
		border-radius: 999px;
		background: var(--accent-fill);
		color: var(--on-accent);
		font-size: 15px;
		font-weight: 800;
		text-decoration: none;
		box-shadow: 0 10px 24px -6px rgb(240 57 110 / 0.55);
		transition: transform 0.15s;
	}
	.fab:active {
		transform: scale(0.95);
	}
	.fab svg {
		width: 22px;
		height: 22px;
	}
</style>
