<script lang="ts">
	/**
	 * 공감 고르기 줄 — 말풍선 위(자리가 없으면 아래)에 뜬다. 바깥을 누르거나 Esc 로 닫힌다.
	 * react = false 면(끝난 대화 · 시스템 안내) "복사"만.
	 */
	import { REACTIONS, type ReactionKey } from './types';

	let {
		at,
		react,
		current,
		onpick,
		oncopy,
		onclose
	}: {
		at: { top: number; left: number | null; right: number | null };
		react: boolean;
		current?: ReactionKey;
		onpick: (k: ReactionKey) => void;
		oncopy: () => void;
		onclose: () => void;
	} = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="rx-scrim" role="presentation" onpointerdown={onclose}></div>
<div
	class="rx-pick"
	role="menu"
	aria-label="공감"
	style:top="{at.top}px"
	style:left={at.left != null ? `${at.left}px` : null}
	style:right={at.right != null ? `${at.right}px` : null}
>
	{#if react}
		{#each REACTIONS as r (r.k)}
			<button class="rx" class:on={current === r.k} role="menuitem" aria-label={r.label} onclick={() => onpick(r.k)}>
				{r.e}
			</button>
		{/each}
		<span class="sep" aria-hidden="true"></span>
	{/if}
	<button class="copy" role="menuitem" onclick={oncopy}>복사</button>
</div>

<style>
	.rx-scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
	}
	.rx-pick {
		position: fixed;
		z-index: 41;
		display: flex;
		align-items: center;
		gap: 2px;
		max-width: calc(100vw - 16px);
		height: 48px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--bg);
		box-shadow: 0 4px 20px rgb(0 0 0 / 0.18), 0 0 0 1px var(--line);
		animation: rx-in 0.14s ease-out;
	}
	@keyframes rx-in {
		from {
			opacity: 0;
			transform: scale(0.9);
		}
	}
	.rx {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		font-size: 24px;
		line-height: 1;
		transition: transform 0.1s;
	}
	.rx:active {
		transform: scale(1.25);
	}
	.rx.on {
		background: var(--field);
	}
	.sep {
		width: 1px;
		height: 24px;
		margin: 0 4px;
		background: var(--line);
	}
	.copy {
		padding: 0 10px;
		height: 36px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}
</style>
