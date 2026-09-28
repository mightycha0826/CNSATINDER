<script lang="ts">
	/**
	 * 아래에서 올라오는 시트 — 대화방·편지 메뉴, 신고·차단 확인, 알림 권한 안내가 같이 쓴다.
	 * onclose 가 있으면 바깥을 누르거나 Esc 로 닫힌다. 없으면(꼭 골라야 하는 안내) 버튼으로만 닫힌다.
	 *
	 * 안에 넣는 공용 모양: .item (한 줄 버튼, .danger) · .warn (확인 문구, .left)
	 */
	import type { Snippet } from 'svelte';
	import { focustrap } from '$lib/focustrap';

	let { onclose, label, children }: { onclose?: () => void; label?: string; children: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose?.()} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="scrim" role="presentation" onclick={() => onclose?.()}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="sheet" role="dialog" aria-modal="true" aria-label={label} tabindex="-1" onclick={(e) => e.stopPropagation()} use:focustrap>
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
	.sheet :global(.item:first-child) {
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
