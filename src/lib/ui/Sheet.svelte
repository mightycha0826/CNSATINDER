<script lang="ts">
	/**
	 * 아래에서 올라오는 시트 — 대화방·편지 메뉴, 신고·차단 확인, 알림 권한 안내가 같이 쓴다.
	 * onclose 가 있으면 바깥을 누르거나 · Esc · 안드로이드 뒤로가기 · 손잡이를 아래로 끌어 닫힌다.
	 * 없으면(꼭 골라야 하는 안내) 버튼으로만 닫히고 뒤로가기 기록도 쌓지 않는다 (docs/UX-GUIDELINES.md G5.1).
	 *
	 * 안에 넣는 공용 모양: .item (한 줄 버튼, .danger) · .warn (확인 문구, .left)
	 */
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { focustrap } from '$lib/focustrap';
	import { backClose } from '$lib/overlay.svelte';
	import { reducedMotion } from '$lib/motion';

	let { onclose, label, children }: { onclose?: () => void; label?: string; children: Snippet } = $props();

	// svelte-ignore state_referenced_locally — 닫을 수 있는 시트인지는 열릴 때 한 번 정해진다
	if (onclose) backClose(() => onclose?.());

	// ── 끌어서 닫기 — 손잡이 · 시트 윗부분을 아래로. 80px 넘게 또는 빠르게 튕기면 닫고, 아니면 스프링으로 제자리 ──
	let sheetEl: HTMLDivElement | undefined = $state();
	let dy = $state(0);
	let dragging = $state(false);
	let start = { y: 0, t: 0, id: -1 };
	function down(e: PointerEvent) {
		// 손잡이 띠(.grab)에서 시작한 끌기만 — 시트 안의 스크롤 · 버튼과 헷갈리지 않게
		if (!onclose || e.button !== 0 || !sheetEl || !(e.target as Element).closest('.grab')) return;
		start = { y: e.clientY, t: performance.now(), id: e.pointerId };
		dragging = true;
		sheetEl.setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!dragging || e.pointerId !== start.id) return;
		const d = e.clientY - start.y;
		dy = d > 0 ? d : d / 4; // 위로는 살짝만 (고무줄)
	}
	function up(e: PointerEvent) {
		if (!dragging || e.pointerId !== start.id) return;
		dragging = false;
		const v = dy / Math.max(1, performance.now() - start.t);
		if (dy > 80 || (dy > 24 && v > 0.6)) onclose?.();
		else dy = 0;
	}

	/** 사라질 때 — 시트는 아래로 미끄러지고(끌던 자리에서 이어서) 바탕은 흐려진다 (G7.1) */
	function slideOut(node: Element) {
		const from = dy;
		const h = node.getBoundingClientRect().height;
		return {
			duration: reducedMotion() ? 0 : 200,
			css: (t: number) => `transform: translateY(${from + (1 - t) * (h - from)}px)`
		};
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose?.()} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="scrim" role="presentation" onclick={() => onclose?.()} out:fade={{ duration: reducedMotion() ? 0 : 200 }}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="sheet"
		class:dragging
		role="dialog"
		aria-modal="true"
		aria-label={label}
		tabindex="-1"
		bind:this={sheetEl}
		style:transform={dy ? `translateY(${dy}px)` : null}
		onclick={(e) => e.stopPropagation()}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		use:focustrap
		out:slideOut
	>
		{#if onclose}<div class="grab" aria-hidden="true"></div>{/if}
		{@render children()}
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		background: rgb(14 6 9 / 0.48);
		-webkit-backdrop-filter: blur(3px);
		backdrop-filter: blur(3px);
		animation: fade 0.2s ease-out;
	}
	/* 아래에서 튀어 오르는 둥근 판 — 위에 손잡이 */
	.sheet {
		position: relative;
		width: 100%;
		max-width: 520px;
		max-height: 92dvh;
		overflow-y: auto;
		padding: 22px 0 calc(10px + env(safe-area-inset-bottom));
		border-radius: 28px 28px 0 0;
		background: var(--surface);
		box-shadow: var(--shadow-2);
		outline: none;
		animation: rise 0.34s cubic-bezier(0.2, 0.9, 0.3, 1.04);
		/* 끌기를 놓으면 스프링으로 제자리 (끄는 동안은 손가락을 바로 따라간다) */
		transition: transform 0.36s var(--ease-spring);
		touch-action: pan-y;
	}
	.sheet.dragging {
		transition: none;
	}
	/* 손잡이 띠 — 윗 여백 전체. 여기서만 끌어 닫는다(브라우저 스크롤이 가로채지 않게 touch-action: none) */
	.grab {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 22px;
		touch-action: none;
		cursor: grab;
	}
	.sheet::before {
		content: '';
		position: absolute;
		top: 8px;
		left: 50%;
		width: 40px;
		height: 5px;
		margin-left: -20px;
		border-radius: 999px;
		background: var(--line);
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes rise {
		from {
			transform: translateY(100%);
		}
	}
	.sheet :global(.item) {
		display: block;
		width: 100%;
		height: 54px;
		font-size: 16px;
		font-weight: 600;
		border-top: 1px solid var(--line);
		transition: background 0.15s;
	}
	.sheet :global(.item:active:not(:disabled)) {
		background: var(--field);
	}
	.sheet :global(.item:first-child),
	.grab + :global(.item) {
		border-top: 0;
	}
	.sheet :global(.item.danger) {
		color: var(--danger);
		font-weight: 600;
	}
	.sheet :global(.item:disabled) {
		opacity: 0.4;
	}
	.sheet :global(.warn) {
		margin: 8px var(--pad) 12px;
		text-align: center;
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-2);
	}
	.sheet :global(.warn.left) {
		text-align: left;
		margin: 0 0 12px;
	}
	.sheet :global(.warn strong) {
		color: var(--text);
		font-weight: 600;
	}
</style>
