<script lang="ts">
	/**
	 * 편지 쓰기 — 익명편지 탭에서 찾은 학생에게. 받는 사람은 검색에서 고른 값(page.state.to)으로만 온다.
	 * 새로고침하면 사라지므로 다시 찾게 한다. 받는 사람에게 내 이름은 보이지 않는다.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '$lib/ui/Avatar.svelte';
	import BackButton from '$lib/ui/BackButton.svelte';
	import { errMsg, toast } from '$lib/state.svelte';
	import { sendError, sendLetter } from '$lib/letters/api';

	const to = $derived(page.state.to);
	$effect(() => {
		if (!to) void goto('/letters', { replaceState: true });
	});

	const MAX = 1000;
	let body = $state('');
	let busy = $state(false);
	const len = $derived(body.trim().length);
	const ready = $derived(!!to && len > 0 && len <= MAX && !busy);

	async function send() {
		if (!ready || !to) return;
		busy = true;
		try {
			const r = await sendLetter(to.id, body.trim());
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
		<div class="to">
			<span class="muted label">받는 사람</span>
			<Avatar name={to.name} size={32} />
			<b>{to.name}</b>
			{#if to.grade}<span class="muted">{to.grade}학년</span>{/if}
		</div>

		<textarea
			class="body selectable"
			bind:value={body}
			maxlength={MAX + 100}
			placeholder={`${to.name}님에게 하고 싶은 말을 적어 보세요.\n내 이름은 보이지 않아요.`}
			aria-label="편지 내용"
		></textarea>

		<div class="foot">
			<span class="muted">받는 사람에게는 익명 이름으로 보여요</span>
			<span class="num" class:over={len > MAX}>{len}/{MAX}</span>
		</div>
		<ul class="rules muted">
			<li>상대가 답하기 전에는 3개까지 보낼 수 있어요. 받는 사람은 언제든 대화를 끝내거나 신고할 수 있어요.</li>
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
		gap: 12px;
		padding-top: 14px;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	.to {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--line);
		font-size: 15px;
	}
	.to .label {
		font-size: 13px;
		margin-right: 4px;
	}
	.body {
		min-height: 220px;
		padding: 0;
		border: 0;
		outline: none;
		resize: none;
		background: none;
		font-size: 16px;
		line-height: 1.6;
	}
	.body::placeholder {
		color: var(--text-2);
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
