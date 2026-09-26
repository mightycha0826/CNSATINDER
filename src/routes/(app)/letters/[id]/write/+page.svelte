<script lang="ts">
	/**
	 * 편지로 답장 (또는 한 통 더) — 편지 화면에서 "편지로 답장하기"를 누르면 온다. 편지지 모양은 새 편지 쓰기와 같다.
	 *  · 받은 편지에 답장: To. 가명 · From. 내 이름 (보낸 사람은 이미 내 이름을 안다)
	 *  · 보낸 쪽이 한 통 더: To. 받는 사람 이름 · From. 내 가명
	 * 보내면 편지 화면으로 돌아간다.
	 */
	import { page } from '$app/state';
	import { goBack } from '$lib/nav';
	import BackButton from '$lib/ui/BackButton.svelte';
	import LetterEditor from '$lib/letters/LetterEditor.svelte';
	import type { LetterFmt } from '$lib/letters/rich';
	import { errMsg, toast } from '$lib/state.svelte';
	import { fetchThread, paperNames, sendError, sendLetterReply, type DmThread } from '$lib/letters/api';

	const id = $derived(Number(page.params.id));
	let t = $state<DmThread | null>(null);
	let gone = $state(false);
	$effect(() => {
		void id;
		void (async () => {
			try {
				const r = await fetchThread(id);
				if (r.status !== 'ok') gone = true;
				else t = r;
			} catch (e) {
				toast(errMsg(e));
			}
		})();
	});
	const names = $derived(t ? paperNames(t, { mine: true }) : null);
	const back = $derived(`/letters/${id}`);

	const MAX = 1000;
	let body = $state('');
	let fmt = $state<LetterFmt | null>(null);
	let busy = $state(false);
	const len = $derived(Array.from(body).length);
	const ready = $derived(!!t && len > 0 && len <= MAX && !busy);

	async function send() {
		if (!ready || !t) return;
		busy = true;
		try {
			const r = await sendLetterReply(t.id, body, fmt);
			const err = sendError(r);
			if (err) return void toast(err);
			toast('편지를 보냈어요');
			goBack(back);
		} catch (e) {
			toast(errMsg(e));
		} finally {
			busy = false;
		}
	}
</script>

<div class="topbar">
	<BackButton href={back} history />
	<span class="title">{t?.role === 'received' ? '편지로 답장하기' : '편지 쓰기'}</span>
	<button class="post btn-text" onclick={send} disabled={!ready}>{busy ? '보내는 중…' : '보내기'}</button>
</div>

{#if gone}
	<p class="muted empty">편지를 찾을 수 없어요.</p>
{:else if t && names}
	<div class="page compose">
		<LetterEditor bind:body bind:fmt placeholder={`${names.to}에게 답장을 적어 보세요.`}>
			{#snippet before()}
				<p class="lp-to to">To. {names.to}</p>
			{/snippet}
			{#snippet after()}
				<p class="lp-from">From. {names.from}</p>
			{/snippet}
		</LetterEditor>
		<div class="foot">
			<span class="muted">
				{t.role === 'received' ? '상대는 이미 내 이름을 알아요 · 상대 이름은 끝까지 가명이에요' : '받는 사람에게는 가명으로 보여요'}
			</span>
			<span class="num" class:over={len > MAX}>{len > MAX ? `${len - MAX}자 넘음 · ` : ''}{len}/{MAX}</span>
		</div>
	</div>
{:else}
	<p class="muted empty">불러오는 중…</p>
{/if}

<style>
	.post {
		margin-left: auto;
		font-size: 15px;
	}
	.compose {
		gap: 10px;
		padding-top: 0;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	.foot {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding-top: 4px;
		font-size: 12px;
	}
	.over {
		color: var(--danger);
	}
	.empty {
		margin: 48px 0;
		text-align: center;
	}
</style>
