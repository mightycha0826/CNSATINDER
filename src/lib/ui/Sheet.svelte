<script lang="ts">
	/**
	 * 아래에서 올라오는 시트 — 대화방·편지 메뉴, 신고·차단 확인, 알림 권한 안내가 같이 쓴다.
	 * onclose 가 있으면 바깥을 누르거나 Esc 로 닫힌다. 없으면(꼭 골라야 하는 안내) 버튼으로만 닫힌다.
	 *
	 * 안에 넣는 공용 모양: .item (한 줄 버튼, .danger) · .warn (확인 문구, .left)
	 */
	import type { Snippet } from 'svelte';

	let { onclose, label, children }: { onclose?: () => void; label?: string; children: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose?.()} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="scrim" role="presentation" onclick={() => onclose?.()}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="sheet" role="dialog" aria-modal="true" aria-label={label} tabindex="-1" onclick={(e) => e.stopPropagation()}>
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
		background: rgb(0 0 0 / 0.45);
	}
	.sheet {
		width: 100%;
		max-width: 520px;
		padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
		border-radius: 12px 12px 0 0;
		background: var(--bg);
		outline: none;
	}
	.sheet :global(.item) {
		display: block;
		width: 100%;
		height: 50px;
		font-size: 15px;
		border-top: 1px solid var(--line);
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
