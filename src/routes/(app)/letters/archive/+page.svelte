<script lang="ts">
	/**
	 * 편지 보관함 (Phase 35 · 37) — 편지함 아래 서류 더미를 누르면. 지금까지 받은 편지 · 보낸 편지.
	 * 편지함처럼 큰 봉투가 한 장씩 비스듬히 놓여 있다 (Phase 37 — 예전엔 작은 봉투 한 줄씩).
	 *   받은 편지 = 덮개 쪽(보낸 사람 성별 색 테두리 · 안 연 편지는 봉인) / 보낸 편지 = 주소 쪽(To. · 우표 · 소인 · 읽음/답장 옴 스티커).
	 * 누르면 그 편지를 연다. 길게 누르면(마우스는 오른쪽 클릭) 봉투 메뉴 — 열기 · 답장 · 버리기 · 차단 · 신고 (LetterMenu).
	 */
	import BackButton from '$lib/ui/BackButton.svelte';
	import MailStack from '$lib/letters/MailStack.svelte';
	import { BOX, loadMore, refreshMailbox } from '$lib/letters/mailbox.svelte';
	import { LIST } from '$lib/letters/unread.svelte';

	$effect(() => refreshMailbox());

	const tab = $derived(LIST.tab);
	const list = $derived(BOX[tab]);
	let busy = $state(false);

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

	{#if BOX.loaded[tab] && list.length === 0}
		<p class="muted center">{tab === 'received' ? '아직 받은 편지가 없어요' : '아직 보낸 편지가 없어요'}</p>
	{:else}
		<!-- 탭을 바꾸면 봉투가 다시 한 통씩 내려앉는다 -->
		{#key tab}
			<MailStack items={list} box={tab} loading={!BOX.loaded[tab] && list.length === 0} ghosts={2} />
		{/key}
		{#if BOX.more[tab]}<button class="more" onclick={more} disabled={busy}>{busy ? '가져오는 중…' : '지난 편지 더 보기'}</button>{/if}
	{/if}
</div>

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
