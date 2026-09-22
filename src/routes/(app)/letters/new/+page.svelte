<script lang="ts">
	import { goto } from '$app/navigation';
	import { postLetter } from '$lib/letters/api';
	import { S, errMsg, toast } from '$lib/state.svelte';
	import { waitText } from '$lib/time';

	/** 편지 쓰기 — 올리면 바로 공개 피드에 뜨고, 답장할 사람이 배정되기를 기다린다. */
	let body = $state('');
	let busy = $state(false);
	let area: HTMLTextAreaElement | undefined = $state();

	const max = $derived(S.settings?.letter_max_len ?? 500);
	const len = $derived(body.trim().length);
	const ready = $derived(len > 0 && len <= max && !busy);

	$effect(() => {
		area?.focus();
	});

	async function submit() {
		if (!ready) return;
		busy = true;
		try {
			const r = await postLetter(body);
			if (r.status === 'ok') {
				toast('편지 올림');
				void goto(`/letters/${r.letter_id}`, { replaceState: true });
				return;
			}
			if (r.status === 'rate_limited') toast(`편지는 조금 쉬었다 쓸 수 있어요 · ${waitText(r.retry_after_ms)}`);
			else if (r.status === 'service_closed') toast(r.notice || '지금은 열려 있지 않아요');
			else toast('지금은 편지를 쓸 수 없는 계정입니다');
		} catch (e) {
			toast(errMsg(e));
		} finally {
			busy = false;
		}
	}
</script>

<div class="topbar">
	<button class="back" onclick={() => history.length > 1 ? history.back() : goto('/letters')} aria-label="뒤로">
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>
	<span class="title">편지 쓰기</span>
	<button class="post btn-text" onclick={submit} disabled={!ready}>{busy ? '올리는 중…' : '올리기'}</button>
</div>

<div class="page compose">
	<textarea
		bind:this={area}
		bind:value={body}
		maxlength={max}
		placeholder="아무에게나 하고 싶은 이야기를 적어 보세요.&#10;답장해 줄 사람이 한 명 배정되고, 누구나 댓글을 달 수 있어요."
	></textarea>
	<div class="foot">
		<span class="muted">모두에게 공개 · 이 편지에서만 쓰는 새 익명 이름</span>
		<span class="num" class:over={len > max}>{len}/{max}</span>
	</div>
	<ul class="rules muted">
		<li>이름·학번·반·SNS 아이디는 적지 않기</li>
		<li>특정한 사람을 알아볼 수 있게 쓰지 않기</li>
	</ul>
</div>

<style>
	.back {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		margin-left: -4px;
	}
	.back svg {
		width: 24px;
		height: 24px;
	}
	.post {
		margin-left: auto;
		font-size: 15px;
	}

	.compose {
		gap: 10px;
		padding-top: 12px;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	textarea {
		flex: 1;
		min-height: 45dvh;
		padding: 4px 0;
		border: 0;
		outline: none;
		resize: none;
		background: none;
		font-size: 16px;
		line-height: 1.7;
	}
	textarea::placeholder {
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
