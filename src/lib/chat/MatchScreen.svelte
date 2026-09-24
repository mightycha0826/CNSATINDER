<script lang="ts">
	/**
	 * 연결 순간 — 새로 매칭된 방에 처음 들어올 때 1.6초 동안 "○○님과 연결됐어요".
	 * 바로 대화방으로 튀어 들어가면 시작이 흐릿해서, 짧게 숨 고를 틈을 준다. 누르면 바로 닫힌다.
	 */
	import Avatar from '$lib/ui/Avatar.svelte';

	let { alias, minutes, ondone }: { alias: string; minutes: number; ondone: () => void } = $props();

	$effect(() => {
		const t = setTimeout(ondone, 1600);
		return () => clearTimeout(t);
	});
</script>

<!-- 어디를 눌러도 닫힌다 (1.6초 뒤 저절로도) -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div class="match" role="status" aria-live="polite" onclick={ondone}>
	<div class="ring"><Avatar name={alias} size={96} /></div>
	<p class="title"><b>{alias}</b>님과 연결됐어요</p>
	<p class="sub num">{minutes}:00 · 둘 다 원하면 이어져요</p>
</div>

<style>
	.match {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		background: color-mix(in srgb, var(--bg) 94%, transparent);
		backdrop-filter: blur(6px);
		animation: in 0.2s ease-out, out 0.3s ease-in 1.3s forwards;
	}
	.ring {
		padding: 4px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--g-orange), var(--g-coral) 50%, var(--g-pink));
		animation: pop 0.45s cubic-bezier(0.2, 1.4, 0.4, 1);
	}
	.ring :global(.av) {
		border: 3px solid var(--bg);
	}
	.title {
		margin: 8px 0 0;
		font-size: 18px;
	}
	.sub {
		margin: 0;
		font-size: 13px;
		color: var(--text-2);
	}
	@keyframes in {
		from {
			opacity: 0;
		}
	}
	@keyframes out {
		to {
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			transform: scale(0.6);
		}
	}
</style>
