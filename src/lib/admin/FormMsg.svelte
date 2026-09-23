<script lang="ts">
	/** 폼 액션 결과 한 줄 — { done } 이면 초록, { error } 면 빨강 */
	let { form }: { form: unknown } = $props();
	const f = $derived((form ?? {}) as { done?: string; error?: string });
</script>

{#if f.done}<p class="a-ok">{f.done}</p>{/if}
{#if f.error}<p class="a-err">{f.error}</p>{/if}
