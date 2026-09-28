<script lang="ts">
	/**
	 * 익명편지 전체 틀 (Phase 44) — 잠겨 있으면(가입한 학생이 모일 때까지) 편지함 · 쓰기 · 보관함 · 편지 대신 잠금 화면.
	 * 잠금 여부는 운영 설정 + 실시간 가입 인원 (lib/letters/gate.svelte.ts). 서버도 같은 규칙으로 쓰기 · 찾기를 막는다.
	 */
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import TopbarMe from '$lib/ui/TopbarMe.svelte';
	import BackButton from '$lib/ui/BackButton.svelte';
	import LettersGate from '$lib/letters/LettersGate.svelte';
	import { gateOn, lettersState, watchSignups } from '$lib/letters/gate.svelte';

	let { children } = $props();

	const lock = $derived(lettersState());
	const root = $derived(page.url.pathname === '/letters');

	// 잠금이 켜져 있는 동안만 가입 인원을 지켜본다 (열리면 멈춘다). 읽는 중 → 잠김으로 바뀔 때 다시 구독하지 않게 켜짐/꺼짐만 본다
	const watching = $derived(gateOn() && lock !== 'open');
	$effect(() => {
		if (!watching) return;
		return untrack(watchSignups);
	});
</script>

{#if lock === 'open'}
	{@render children()}
{:else}
	<div class="topbar">
		{#if root}
			<span class="title display">익명편지</span>
			<TopbarMe />
		{:else}
			<BackButton href="/letters" history />
			<span class="title">익명편지</span>
		{/if}
	</div>
	<div class="page locked">
		<LettersGate checking={lock === 'checking'} />
	</div>
{/if}

<style>
	.locked {
		background: var(--desk);
		padding-bottom: 24px;
	}
</style>
