<script lang="ts">
	/**
	 * 편지 쓰기 — 익명편지 탭에서 찾은 학생에게. 받는 사람은 검색에서 고른 값(page.state.to)으로만 온다.
	 * 새로고침하면 사라지므로 다시 찾게 한다. 받는 사람에게 내 이름은 보이지 않는다.
	 * 편지지 모양 — To. 받는 사람 · 서식 편집기(굵게 · 형광펜 · 글자색 · 크기 · 정렬) · From. 익명.
	 * 본문은 순수 텍스트, 서식은 fmt 로 따로 보낸다. 받는 사람은 "편지로 답장하기 / 채팅하기" 중에 고른다.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BackButton from '$lib/ui/BackButton.svelte';
	import LetterEditor from '$lib/letters/LetterEditor.svelte';
	import type { LetterFmt } from '$lib/letters/rich';
	import { errMsg, toast } from '$lib/state.svelte';
	import { sendError, sendLetter } from '$lib/letters/api';

	const to = $derived(page.state.to);
	$effect(() => {
		if (!to) void goto('/letters', { replaceState: true });
	});

	const MAX = 1000;
	let body = $state('');
	let fmt = $state<LetterFmt | null>(null);
	let busy = $state(false);
	// 서버와 같은 셈 — 편집기가 앞뒤 공백을 잘라 둔 본문의 글자(code point) 수, 줄바꿈도 한 글자
	const len = $derived(Array.from(body).length);
	const ready = $derived(!!to && len > 0 && len <= MAX && !busy);

	async function send() {
		if (!ready || !to) return;
		busy = true;
		try {
			const r = await sendLetter(to.id, body, fmt);
			const err = sendError(r);
			if (err) {
				toast(err);
				if (r.status === 'wait_reply' && r.thread_id) void goto(`/letters/${r.thread_id}`, { replaceState: true });
				return;
			}
			if (r.status === 'ok') {
				toast('편지를 보냈어요');
				void goto(`/letters/${r.thread_id}`, { replaceState: true });
			}
		} catch (e) {
			toast(errMsg(e));
		} finally {
			busy = false;
		}
	}
</script>

<div class="topbar">
	<BackButton href="/letters" history />
	<span class="title">편지 쓰기</span>
	<button class="post btn-text" onclick={send} disabled={!ready}>{busy ? '보내는 중…' : '보내기'}</button>
</div>

{#if to}
	<div class="page compose">
		<!-- 편지지: To. 받는 사람 · 내용 · From. 익명 (보내면 이 편지에만 쓰는 가명이 붙는다) -->
		<LetterEditor bind:body bind:fmt placeholder={`${to.name}님에게 하고 싶은 말을 적어 보세요.\n내 이름은 보이지 않아요.`}>
			{#snippet before()}
				<p class="lp-to to">To. {to.name}{#if to.grade}<small>{to.grade}학년</small>{/if}</p>
			{/snippet}
			{#snippet after()}
				<p class="lp-from">From. 익명<small>보내면 가명이 붙어요</small></p>
			{/snippet}
		</LetterEditor>

		<div class="foot">
			<span class="muted">받는 사람에게는 내 이름 대신 가명으로 보여요</span>
			<span class="num" class:over={len > MAX}>{len > MAX ? `${len - MAX}자 넘음 · ` : ''}{len}/{MAX}</span>
		</div>
		<ul class="rules muted">
			<li>받는 사람은 편지로 답장하거나 채팅으로 이어갈 수 있어요. 답이 오기 전에는 3통까지 보낼 수 있고, 받는 사람은 언제든 나가거나 신고할 수 있어요.</li>
			<li>괴롭힘으로 신고되면 운영진은 누가 보냈는지 확인할 수 있어요 (확인할 때마다 기록이 남아요).</li>
			<li>전화번호 · 학번 · SNS 아이디는 적을 수 없어요.</li>
		</ul>
	</div>
{/if}

<style>
	.post {
		margin-left: auto;
		font-size: 15px;
	}
	.compose {
		gap: 10px;
		padding-top: 14px;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	.foot {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
		font-size: 12px;
	}
	.over {
		color: var(--danger);
	}
	.rules {
		margin: 0;
		padding-left: 18px;
		font-size: 12px;
		line-height: 1.7;
	}
</style>
