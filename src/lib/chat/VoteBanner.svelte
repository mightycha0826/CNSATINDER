<script lang="ts" module>
	/** 공통 질문 차례 (Phase 29) — 이름표 대신 그 방의 질문 자체가 label 이다 */
	export const isQuestion = (k: string | null | undefined) => k === 'q1' || k === 'q2';
</script>

<script lang="ts">
	/**
	 * 연장 · 고정 투표 띠 (마감 직전에만 뜬다).
	 *   연장 차례: "10분 더 얘기할까요?" — 연장하면 공개될 것(학년 · 공통 질문 답 · 디플로마 · 동아리), 적는 차례면 적는 칸
	 *   고정 차례(동아리 다음, Phase 29): "이 채팅을 고정하시겠습니까?"
	 * 표를 던지는 일 · 적은 값 확인은 ChatView(vote) 가 한다.
	 */
	import Banner from './Banner.svelte';
	import type { RoomSnap } from './types';

	let {
		snap,
		pinNext,
		voting,
		hintDraft = $bindable(''),
		onvote
	}: {
		snap: RoomSnap;
		pinNext: boolean;
		voting: boolean;
		hintDraft?: string;
		onvote: (agree: boolean) => void;
	} = $props();

	const nextHint = $derived(snap.next_hint ?? null);
	const view = $derived.by(() => {
		if (snap.my_vote === true)
			return { title: '상대의 대답을 기다리는 중', sub: pinNext ? '둘 다 원해야 고정돼요' : `둘 다 원해야 ${snap.extend_minutes}분 이어져요`, want: false };
		const want = snap.partner_vote === true;
		if (pinNext)
			return { title: '이 채팅을 고정하시겠습니까?', sub: want ? '상대가 고정을 원해요' : '둘 다 고정하면 맨 위에 남고 사라지지 않아요', want };
		const sub = want
			? '상대가 연장을 원해요'
			: isQuestion(nextHint?.kind)
				? '답을 적고 연장하면 서로의 답 공개'
				: nextHint
					? `연장하면 서로의 ${nextHint.label} 공개`
					: '둘 다 원해야 이어져요';
		return { title: `${snap.extend_minutes}분 더 얘기할까요?`, sub, want };
	});
	const asking = $derived(snap.my_vote !== true);
</script>

<Banner title={view.title} sub={view.sub} want={view.want}>
	{#if asking && nextHint?.typed && !pinNext}
		{@const q = isQuestion(nextHint.kind)}
		{#if q}<p class="question">Q. {nextHint.label}</p>{/if}
		<input
			class="hint-in"
			bind:value={hintDraft}
			maxlength={q ? 30 : 20}
			placeholder={q ? '내 답' : `내 ${nextHint.label}`}
			aria-label={q ? `공통 질문 ${nextHint.label} — 내 답` : `내 ${nextHint.label}`}
		/>
	{/if}
	{#snippet actions()}
		{#if asking}
			<button class="no" onclick={() => onvote(false)} disabled={voting}>그만하기</button>
			<button class="yes" onclick={() => onvote(true)} disabled={voting}>{pinNext ? '고정하기' : '더 얘기하기'}</button>
		{/if}
	{/snippet}
</Banner>

<style>
	/* 공통 질문 — 띠 아래 한 줄 전체, 적는 칸 바로 위 */
	.question {
		order: 3;
		flex-basis: 100%;
		margin: -4px 0 -6px;
		font-size: 14px;
		font-weight: 700;
	}
	/* 디플로마 · 동아리 · 공통 질문 답 적는 칸 — 띠 아래 한 줄 전체 */
	.hint-in {
		order: 3;
		flex-basis: 100%;
		width: 100%;
		margin-top: -2px;
		padding: 10px 14px;
		border: 1.5px solid transparent;
		border-radius: 12px;
		background: var(--field);
		color: var(--text);
		font-size: 14px;
		outline: none;
	}
	.hint-in:focus {
		border-color: color-mix(in srgb, var(--accent) 60%, transparent);
		background: var(--bg);
	}
</style>
