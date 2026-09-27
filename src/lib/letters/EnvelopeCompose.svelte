<script lang="ts">
	/**
	 * 편지 쓰기 연출 (Phase 32) — 새 편지 · 답장이 같이 쓴다.
	 *   들어올 때: 봉투가 올라와 덮개가 열리고 → 편지지가 솟아올라 → 화면 가득 펼쳐지며 편지 쓰는 칸이 된다 (봉투는 아래로 비켜 앉는다).
	 *   보낼 때: 편지지가 접혀 봉투로 들어가고 → 덮개가 닫히고 → 밀랍 봉인이 찍히고 → 봉투를 뒤집어 주소 면(소인 "보냄") → 날아간다.
	 * 보내기가 실패하면 쓰던 편지지로 돌아온다. 동작 줄이기면 연출 없이 바로 쓰고, 보내면 바로 끝난다.
	 */
	import { onDestroy } from 'svelte';
	import Envelope from './Envelope.svelte';
	import LetterEditor from './LetterEditor.svelte';
	import type { LetterFmt } from './rich';
	import { envWidth, play } from './stage';
	import { paperDate, stampDate } from './api';

	let {
		to,
		toSub = '',
		from,
		placeholder,
		onsend,
		ondone
	}: {
		to: string;
		toSub?: string;
		from: string;
		placeholder: string;
		/** 서버에 보낸다 — 됐으면 true (연출을 이어 간다), 안 됐으면 false (편지지로 돌아온다 · 이유는 부르는 쪽이 알린다) */
		onsend: (body: string, fmt: LetterFmt | null) => Promise<boolean>;
		/** 봉투가 날아간 뒤 */
		ondone: () => void;
	} = $props();

	const MAX = 1000;
	let body = $state('');
	let fmt = $state<LetterFmt | null>(null);
	const len = $derived(Array.from(body).length);

	type Phase = 'enter' | 'opened' | 'rising' | 'write' | 'fold' | 'tuck' | 'close' | 'seal' | 'flip' | 'fly';
	let phase = $state<Phase>('enter');
	let vw = $state(390);
	const w = $derived(envWidth(vw, 320));
	const now = new Date().toISOString();

	let stop = play([
		[250, () => (phase = 'opened')],
		[750, () => (phase = 'rising')],
		[1350, () => (phase = 'write')]
	]);
	onDestroy(() => stop());

	const writing = $derived(phase === 'write');
	const sending = $derived(!['enter', 'opened', 'rising', 'write'].includes(phase));
	const ready = $derived(writing && len > 0 && len <= MAX);

	async function send() {
		if (!ready) return;
		phase = 'fold';
		const ok = await onsend(body, fmt);
		if (!ok) {
			phase = 'write';
			return;
		}
		stop = play([
			[150, () => (phase = 'tuck')],
			[750, () => (phase = 'close')],
			[1250, () => (phase = 'seal')],
			[1850, () => (phase = 'flip')],
			[2650, () => (phase = 'fly')],
			[3250, ondone]
		]);
	}

	// 봉투 상태 — 단계마다
	const side = $derived(phase === 'flip' || phase === 'fly' ? 'front' : 'back');
	const open = $derived(['opened', 'rising', 'write', 'fold', 'tuck'].includes(phase));
	const paperPos = $derived(phase === 'rising' || phase === 'fold' ? 'out' : phase === 'write' ? 'out' : 'in');
	const sealed = $derived(['seal', 'flip', 'fly'].includes(phase));
</script>

<svelte:window bind:innerWidth={vw} />

<div class="compose" data-phase={phase}>
	<div class="desk" aria-hidden="true"></div>

	<div class="sheet-wrap" class:shown={writing || phase === 'fold'} aria-hidden={!writing}>
		<LetterEditor bind:body bind:fmt {placeholder}>
			{#snippet before()}
				<div class="lp-head">
					<p class="lp-to">To. {to}{#if toSub}<small>{toSub}</small>{/if}</p>
					<time class="lp-date">{paperDate(now)}</time>
				</div>
			{/snippet}
			{#snippet after()}
				<p class="lp-from">From. {from}</p>
			{/snippet}
		</LetterEditor>
		<div class="foot">
			<span class="num" class:over={len > MAX}>{len > MAX ? `${len - MAX}자 넘음 · ` : ''}{len}/{MAX}</span>
			<button class="btn send" onclick={send} disabled={!ready}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-3-7-7-1z" fill="currentColor" /></svg>
				봉투에 넣어 보내기
			</button>
		</div>
	</div>

	<div class="env-wrap" style:--w="{w}px">
		<Envelope
			{to}
			{toSub}
			{from}
			date={stampDate(now)}
			{side}
			{open}
			paper={paperPos}
			{sealed}
			stamping={phase === 'seal'}
			postmark="보냄"
			{w}
		/>
	</div>

	{#if sending}<p class="status" aria-live="polite">{phase === 'fly' ? '편지가 출발했어요' : '봉투에 담는 중…'}</p>{/if}
</div>

<style>
	.compose {
		position: relative;
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: calc(100dvh - var(--header-h) - var(--safe-top));
		/* clip — hidden 이면 이 칸이 스크롤 상자가 되어 서식 막대(sticky)가 어긋난다 */
		overflow-x: clip;
	}
	.desk {
		position: fixed;
		inset: 0;
		background: var(--desk);
		pointer-events: none;
	}

	/* ── 봉투 자리: 들어올 때는 가운데, 쓰는 동안은 아래에 반쯤 걸쳐, 보낼 때 다시 가운데로 · 날아간다 ──
	   화면(뷰포트)에 붙인다 — 편지가 길어 쪽이 길어져도 봉투는 늘 화면 아래 · 가운데에 */
	.env-wrap {
		position: fixed;
		perspective: 1400px;
		left: 50%;
		top: 50%;
		width: var(--w);
		margin-left: calc(var(--w) / -2);
		margin-top: calc(var(--w) * -0.31);
		transition:
			transform 0.6s cubic-bezier(0.3, 0.7, 0.2, 1),
			opacity 0.4s;
		z-index: 2;
	}
	[data-phase='enter'] .env-wrap {
		animation: rise-in 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
	}
	@keyframes rise-in {
		from {
			transform: translateY(60vh) rotate(-8deg);
		}
	}
	[data-phase='write'] .env-wrap {
		transform: translateY(calc(50dvh - 30px)) scale(0.72);
		opacity: 0.9;
		pointer-events: none;
	}
	[data-phase='fly'] .env-wrap {
		transform: translate(18vw, -110vh) rotate(-14deg) scale(0.7);
		transition-duration: 0.6s;
		transition-timing-function: cubic-bezier(0.6, 0, 0.8, 0.4);
	}

	/* ── 편지지(쓰는 칸) — 봉투에서 솟아올라 펼쳐진다 ── */
	.sheet-wrap {
		position: relative;
		z-index: 3;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px var(--pad) calc(96px + env(safe-area-inset-bottom));
		opacity: 0;
		transform: translateY(40%) scale(0.55);
		transform-origin: 50% 100%;
		transition:
			transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1),
			opacity 0.35s;
		pointer-events: none;
	}
	.sheet-wrap.shown {
		opacity: 1;
		transform: none;
		pointer-events: auto;
	}
	/* 보낼 때 — 접히면서 봉투 쪽으로 작아진다 */
	[data-phase='fold'] .sheet-wrap {
		opacity: 0;
		transform: translateY(35%) scale(0.35, 0.2);
		pointer-events: none;
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 12px;
		color: var(--text-2);
	}
	.over {
		color: var(--danger);
	}
	.send {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: auto;
		padding: 0 18px;
	}
	.send svg {
		width: 16px;
		height: 16px;
	}
	.status {
		position: fixed;
		left: 0;
		right: 0;
		bottom: calc(22% - 20px);
		margin: 0;
		text-align: center;
		font-size: 14px;
		font-weight: 700;
		color: var(--text-2);
		z-index: 2;
	}
</style>
