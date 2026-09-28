<script lang="ts">
	/**
	 * 편지로 답장 (Phase 32) — 받은 편지 한 통에. 봉투 연출은 새 편지와 같다 (EnvelopeCompose).
	 *  · 모르는 사람의 편지에 답장: To. 익명의 ○학생 · From. 내 이름 (그 사람은 이미 내 이름을 안다)
	 *  · 내 편지에 온 답장에 다시 답장: To. 그 사람 이름 · From. 익명의 나 — 서명을 적을 수 있다 (지난번 서명을 미리 채움, Phase 35)
	 * 보내면 보낸 편지함으로.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BackButton from '$lib/ui/BackButton.svelte';
	import EnvelopeCompose from '$lib/letters/EnvelopeCompose.svelte';
	import type { LetterFmt } from '$lib/letters/rich';
	import { anonName, fromLabel, openLetter, replyToLetter, sendError, type Letter } from '$lib/letters/api';
	import { LIST } from '$lib/letters/unread.svelte';
	import { S, errMsg, toast } from '$lib/state.svelte';

	const id = $derived(Number(page.params.id));
	const back = $derived(`/letters/m/${id}`);
	let letter = $state<Letter | null>(null);
	let gone = $state(false);

	$effect(() => {
		const target = id;
		void (async () => {
			try {
				const r = await openLetter(target);
				if (r.status !== 'ok' || r.role !== 'received' || !r.can_reply) gone = true;
				else letter = r;
			} catch (e) {
				toast(errMsg(e));
			}
		})();
	});

	// 내가 익명 쪽(이름으로 보낸 사람의 답장에 다시 답장)이면 서명을 적을 수 있다
	const anonSide = $derived(!!letter?.from_name);
	const from = $derived(anonSide ? anonName(S.profile?.gender) : (S.me?.name ?? '나'));

	async function send(body: string, fmt: LetterFmt | null, nick: string | null) {
		if (!letter) return false;
		try {
			const r = await replyToLetter(letter.id, body, fmt, nick);
			const err = sendError(r);
			if (err) {
				toast(err);
				return false;
			}
			return true;
		} catch (e) {
			toast(errMsg(e));
			return false;
		}
	}
	function done() {
		LIST.tab = 'sent';
		toast('답장을 보냈어요');
		void goto('/letters', { replaceState: true });
	}
</script>

<div class="topbar">
	<BackButton href={back} history />
	<span class="title">답장 쓰기</span>
</div>

{#if gone}
	<div class="page"><p class="muted center">답장할 수 없는 편지예요</p></div>
{:else if letter}
	<EnvelopeCompose
		to={fromLabel(letter)}
		{from}
		nickable={anonSide}
		nick={letter.my_nick ?? ''}
		placeholder={'받은 편지에 답장을 적어 보세요.\n답장도 봉투에 담겨 전해져요.'}
		draft="re:{letter.id}"
		onsend={send}
		ondone={done}
	/>
{/if}

<style>
	.center {
		margin: 48px auto;
		text-align: center;
	}
</style>
