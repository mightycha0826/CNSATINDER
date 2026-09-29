<script lang="ts">
	/**
	 * 폼 액션 결과 — Phase 48 부터 결과는 누른 버튼 자체에 뜬다(lib/admin/confirm.ts ack).
	 * 여기는 자바스크립트 없이 제출했을 때(enhance 가 안 붙은 경우)만 쓰이는 예비 한 줄.
	 */
	import { browser } from '$app/environment';
	let { form }: { form: unknown } = $props();
	const f = $derived((form ?? {}) as { done?: string; error?: string });
</script>

{#if !browser}
	{#if f.done}<p class="a-ok">{f.done}</p>{/if}
	{#if f.error}<p class="a-err">{f.error}</p>{/if}
{/if}
