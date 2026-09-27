<script lang="ts">
	/**
	 * 편지함의 봉투 한 장 (Phase 32).
	 *   받은 편지 — 덮개 쪽(뒷면): 안 연 편지는 밀랍 봉인이 그대로 · 은은히 빛난다 / 연 편지는 봉인이 없다. From. · 날짜
	 *   보낸 편지 — 주소 쪽(앞면): To. · 우표 · 소인(날짜) · 스티커(읽음 · 답장 옴)
	 * 누르면 그 편지를 연다. 길게 누르면(마우스는 오른쪽 클릭) 신고 · 차단 · 나가기.
	 */
	import Envelope from './Envelope.svelte';
	import { fromLabel, stampDate, toLabel, type Box, type MailItem } from './api';
	import { longpress } from '../longpress';

	let {
		item,
		box,
		me,
		w,
		tilt = 0,
		onopen,
		onmenu
	}: { item: MailItem; box: Box; me: string; w: number; tilt?: number; onopen: () => void; onmenu: () => void } = $props();

	const received = $derived(box === 'received');
	const who = $derived(received ? fromLabel(item) : toLabel(item));
	const sticker = $derived(received ? '' : item.replied ? '답장 옴' : item.opened ? '읽음' : '');
	const label = $derived(
		received
			? `${who}에게서 온 ${item.is_reply ? '답장' : '편지'}${item.opened ? '' : ', 안 읽음'}`
			: `${who}에게 보낸 ${item.is_reply ? '답장' : '편지'}${item.replied ? ', 답장 옴' : item.opened ? ', 읽음' : ''}`
	);
</script>

<button class="item" class:unread={received && !item.opened} style:--tilt="{tilt}deg" onclick={onopen} use:longpress={onmenu} aria-label={label}>
	<Envelope
		to={received ? me : who}
		toSub={!received && item.to_grade ? `${item.to_grade}학년` : ''}
		from={received ? who : me}
		date={stampDate(item.created_at)}
		side={received ? 'back' : 'front'}
		sealed={received && !item.opened}
		glow={received && !item.opened}
		{sticker}
		{w}
	/>
	{#if item.is_reply}<span class="tag">답장</span>{/if}
	{#if received && !item.opened}<span class="new">새 편지</span>{/if}
	{#if item.removed}<span class="tag removed">내려진 편지</span>{/if}
</button>

<style>
	.item {
		position: relative;
		display: block;
		margin: 0 auto;
		perspective: 1200px;
		transform: rotate(var(--tilt));
		transition: transform 0.2s cubic-bezier(0.3, 0.7, 0.3, 1.3);
	}
	.item:active {
		transform: rotate(0deg) scale(0.97);
	}
	.item.unread {
		animation: nudge 3.2s ease-in-out infinite;
	}
	@keyframes nudge {
		0%,
		86%,
		100% {
			transform: rotate(var(--tilt));
		}
		90% {
			transform: rotate(calc(var(--tilt) - 2deg));
		}
		95% {
			transform: rotate(calc(var(--tilt) + 2deg));
		}
	}
	.tag,
	.new {
		position: absolute;
		top: -8px;
		padding: 3px 9px;
		border-radius: 999px;
		font-size: 11px;
		font-weight: 800;
		box-shadow: 0 2px 6px rgb(0 0 0 / 0.15);
	}
	.new {
		right: -4px;
		background: var(--accent-fill);
		color: var(--on-accent);
	}
	.tag {
		left: -4px;
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--line);
	}
	.tag.removed {
		top: auto;
		bottom: -8px;
		color: var(--danger);
	}
</style>
