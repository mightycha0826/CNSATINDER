<script lang="ts">
	/** 비밀번호 + 확인 입력. 규칙: 8자 이상, 영문과 숫자 섞기 (state.PASSWORD_RULE) */
	import { PASSWORD_RULE } from '$lib/state.svelte';

	let {
		value = $bindable(''),
		valid = $bindable(false),
		placeholder = '비밀번호'
	}: { value?: string; valid?: boolean; placeholder?: string } = $props();

	let confirm = $state('');
	const strong = $derived(PASSWORD_RULE.test(value));
	const same = $derived(value.length > 0 && value === confirm);

	$effect(() => {
		valid = strong && same;
	});
</script>

<input class="field" type="password" autocomplete="new-password" {placeholder} bind:value />
<input class="field" type="password" autocomplete="new-password" placeholder="한 번 더" bind:value={confirm} />
<p class="rule" class:ok={strong} class:bad={value.length > 0 && !strong}>
	8자 이상, 영문과 숫자를 섞어 주세요{#if confirm && !same} · <span class="bad">두 칸이 달라요</span>{/if}
</p>

<style>
	.rule {
		margin: -2px 0 0;
		font-size: 12px;
		color: var(--text-2);
	}
	.rule.ok {
		color: var(--text);
	}
	.bad {
		color: var(--danger);
	}
</style>
