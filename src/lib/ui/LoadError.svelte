<script lang="ts">
	/**
	 * 목록을 불러오지 못했을 때 (docs/UX-GUIDELINES.md G4) — 원인 한 줄 + 다시 시도.
	 *   <LoadError title="편지함을 불러오지 못했어요" onretry={…} />
	 * 네트워크 오류를 "없어요"로 보여 주지 않는다. 오프라인이면 원인을 그렇게 말한다(전역 알약과 같은 말).
	 */
	let { title, onretry }: { title: string; onretry: () => unknown } = $props();
	let busy = $state(false);

	async function retry() {
		if (busy) return;
		busy = true;
		try {
			await onretry();
		} finally {
			busy = false;
		}
	}
</script>

<div class="load-error" role="alert">
	<p>{title}</p>
	<small class="muted">{typeof navigator !== 'undefined' && !navigator.onLine ? '오프라인이에요 · 연결되면 다시 눌러 주세요' : '연결을 확인하고 다시 시도해 주세요'}</small>
	<button class="btn-ghost retry" onclick={retry} aria-busy={busy}>다시 시도</button>
</div>

<style>
	.load-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		margin: 12px 16px;
		padding: 22px 16px;
		border-radius: var(--r-card);
		background: color-mix(in srgb, var(--surface) 70%, transparent);
		box-shadow: var(--shadow-1);
		text-align: center;
	}
	p {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
	}
	small {
		font-size: 12px;
	}
	.retry {
		margin-top: 10px;
		min-height: 44px;
		padding: 0 22px;
	}
</style>
