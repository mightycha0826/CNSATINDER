<script lang="ts">
	/**
	 * 운영 화면 확인창 — ask() 가 띄운다. 운영 레이아웃에 하나만 둔다.
	 * 열리면 "취소"에 포커스 (열람 기록 · 전교생 공지처럼 되돌릴 수 없는 조치가 많아서 Enter 한 번에 실행되지 않게).
	 * Esc · 바깥 누르기 = 취소.
	 */
	import { focustrap } from '$lib/focustrap';
	import { ASK } from './ask.svelte';
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && ASK.cur?.resolve(false)} />

{#if ASK.cur}
	{@const a = ASK.cur}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="scrim" role="presentation" onclick={() => a.resolve(false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="box"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="ask-msg"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			use:focustrap={'.cancel'}
		>
			<p id="ask-msg">{a.message}</p>
			<div class="acts">
				<button class="btn-ghost a-sm cancel" onclick={() => a.resolve(false)}>취소</button>
				<button class="btn a-sm" onclick={() => a.resolve(true)}>{a.ok}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 70;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgb(14 6 9 / 0.45);
		animation: fade 0.16s ease-out;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	.box {
		width: 100%;
		max-width: 420px;
		padding: 22px 22px 16px;
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-2);
		outline: none;
		animation: pop 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.1);
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
	}
	p {
		margin: 0 0 18px;
		font-size: 15px;
		line-height: 1.6;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.acts {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
