<script lang="ts">
	/**
	 * 편지 쓰기 연출 (Phase 32 · 35) — 새 편지 · 답장이 같이 쓴다.
	 *   들어올 때: 봉투가 올라와 덮개가 열리고 → 편지지가 솟아올라 → 화면 가득 펼쳐지며 편지 쓰는 칸이 된다 (봉투는 아래로 내려가 숨는다).
	 *   보낼 때: 편지지가 접혀 봉투로 들어가고 → 덮개가 닫히고 → 밀랍 봉인이 찍히고 → 봉투를 뒤집어 주소 면(소인 "보냄") → 날아간다.
	 * 쓰는 동안에는 봉투를 화면에서 치운다 — 휴대폰 키보드가 올라와 화면이 줄어도 편지지 · 보내기 단추를 가리지 않게 (Phase 35).
	 * 보내기 단추 줄은 화면 아래(키보드 위)에 붙는다.
	 * nickable 이면 From. 칸에 서명(닉네임)을 직접 적는다 — 비우면 anon("익명의 ○학생") 그대로.
	 * 보내기가 실패하면 쓰던 편지지로 돌아온다. 동작 줄이기면 연출 없이 바로 쓰고, 보내면 바로 끝난다.
	 * draft(초안 이름)를 주면 쓰는 대로 이 기기에 자동 저장하고, 다시 들어오면 이어 쓴다 — 보내면 지운다 (lib/draft.ts, G5.5).
	 */
	import { onDestroy, onMount } from 'svelte';
	import { toast } from '$lib/state.svelte';
	import { letterDrafts } from './draft';
	import Envelope from './Envelope.svelte';
	import LetterEditor from './LetterEditor.svelte';
	import type { LetterFmt } from './rich';
	import { envWidth, play } from './stage';
	import { NICK_MAX, paperDate, stampDate } from './api';

	let {
		to,
		toSub = '',
		from,
		nickable = false,
		nick: nickInit = '',
		placeholder,
		draft,
		onsend,
		ondone
	}: {
		to: string;
		toSub?: string;
		/** 서명을 안 적었을 때(또는 적을 수 없을 때)의 From. */
		from: string;
		/** 익명 쪽이면 서명을 적을 수 있다 */
		nickable?: boolean;
		/** 미리 채울 서명 (지난번에 쓴 것) */
		nick?: string;
		placeholder: string;
		/** 자동 초안 이름 — 새 편지는 `to:<받는 사람 id>`, 답장은 `re:<편지 id>` */
		draft?: string;
		/** 서버에 보낸다 — 됐으면 true (연출을 이어 간다), 안 됐으면 false (편지지로 돌아온다 · 이유는 부르는 쪽이 알린다) */
		onsend: (body: string, fmt: LetterFmt | null, nick: string | null) => Promise<boolean>;
		/** 봉투가 날아간 뒤 */
		ondone: () => void;
	} = $props();

	const MAX = 1000;
	// 초안 이름은 열릴 때 한 번 정한다 — 부르는 쪽의 값(to.id)은 닫히는 순간 이미 비었을 수 있다
	// svelte-ignore state_referenced_locally
	const key = draft;
	const saved = key ? letterDrafts.load(key) : null;
	let body = $state(saved?.body ?? '');
	let fmt = $state<LetterFmt | null>(saved?.fmt ?? null);
	// svelte-ignore state_referenced_locally
	let nick = $state(saved?.nick || nickInit);
	onMount(() => {
		if (saved?.body) toast('쓰던 편지를 이어서 써요');
	});

	// 쓰는 대로 저장 — 0.5초 쉬면. 보내는 중 · 보낸 뒤에는 저장하지 않는다(보내면 지운다)
	let sent = false;
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	/** 바뀐 것이 있으면 지금 저장 */
	const flush = () => {
		if (!saveTimer) return;
		clearTimeout(saveTimer);
		saveTimer = null;
		if (key && !sent) letterDrafts.save(key, { body, fmt, nick: nickable ? nick : '' });
	};
	let first = true;
	$effect(() => {
		void [body, fmt, nick];
		if (first) return void (first = false); // 연 그대로는 저장하지 않는다
		if (!key || sent) return;
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(flush, 500);
	});
	onDestroy(flush);
	const len = $derived(Array.from(body).length);
	const signed = $derived(nickable && nick.trim() ? nick.trim().replace(/\s+/g, ' ') : from);

	type Phase = 'enter' | 'opened' | 'rising' | 'write' | 'fold' | 'tuck' | 'close' | 'seal' | 'flip' | 'fly';
	let phase = $state<Phase>('enter');
	let vw = $state(390);
	const w = $derived(envWidth(vw, 320));
	const now = new Date().toISOString();

	let stop = play([
		[280, () => (phase = 'opened')],
		[900, () => (phase = 'rising')],
		[1550, () => (phase = 'write')]
	]);
	onDestroy(() => stop());

	const writing = $derived(phase === 'write');
	const sending = $derived(!['enter', 'opened', 'rising', 'write'].includes(phase));
	const ready = $derived(writing && len > 0 && len <= MAX);

	async function send() {
		if (!ready) return;
		(document.activeElement as HTMLElement | null)?.blur(); // 키보드를 내리고 연출을 보여 준다
		phase = 'fold';
		const ok = await onsend(body, fmt, nickable ? nick.trim() || null : null);
		if (!ok) {
			phase = 'write';
			return;
		}
		sent = true;
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = null;
		if (key) letterDrafts.drop(key);
		stop = play([
			[200, () => (phase = 'tuck')],
			[900, () => (phase = 'close')],
			[1550, () => (phase = 'seal')],
			[2250, () => (phase = 'flip')],
			[3150, () => (phase = 'fly')],
			[3850, ondone]
		]);
	}

	// 봉투 상태 — 단계마다
	const side = $derived(phase === 'flip' || phase === 'fly' ? 'front' : 'back');
	const open = $derived(['opened', 'rising', 'write', 'fold', 'tuck'].includes(phase));
	const paperPos = $derived(phase === 'rising' || phase === 'fold' || phase === 'write' ? 'out' : 'in');
	const sealed = $derived(['seal', 'flip', 'fly'].includes(phase));

	// iOS 는 키보드가 올라와도 화면(레이아웃)이 줄지 않는다 — 키보드 높이만큼 보내기 줄을 올린다
	let kb = $state(0);
	$effect(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const sync = () => (kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
		sync();
		vv.addEventListener('resize', sync);
		vv.addEventListener('scroll', sync);
		return () => {
			vv.removeEventListener('resize', sync);
			vv.removeEventListener('scroll', sync);
		};
	});
</script>

<!-- 앱을 내리거나 닫을 때도 쓰던 것을 바로 저장 -->
<svelte:window bind:innerWidth={vw} onpagehide={flush} />
<svelte:document onvisibilitychange={() => document.visibilityState === 'hidden' && flush()} />

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
				{#if nickable}
					<label class="lp-from sign">
						<span>From.</span>
						<input
							class="nick"
							bind:value={nick}
							maxlength={NICK_MAX}
							placeholder={from}
							aria-label="서명 — 받는 사람에게 보일 이름 (비우면 {from})"
							autocomplete="off"
							enterkeyhint="done"
						/>
					</label>
					<p class="sign-hint">서명을 비우면 <b>{from}</b>(으)로 보여요 · 연락처나 실명은 적지 마세요</p>
				{:else}
					<p class="lp-from">From. {from}</p>
				{/if}
			{/snippet}
		</LetterEditor>
		<div class="foot" style:--kb="{kb}px">
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
			from={signed}
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

	/* ── 봉투 자리: 들어올 때 가운데 → 쓰는 동안은 화면 아래로 내려가 숨는다 → 보낼 때 다시 가운데 → 날아간다 ── */
	.env-wrap {
		position: fixed;
		perspective: 1400px;
		left: 50%;
		top: 46%;
		width: var(--w);
		margin-left: calc(var(--w) / -2);
		margin-top: calc(var(--w) * -0.31);
		transition:
			transform 0.7s cubic-bezier(0.3, 0.8, 0.25, 1),
			opacity 0.45s ease;
		z-index: 2;
		pointer-events: none;
	}
	[data-phase='enter'] .env-wrap {
		animation: rise-in 0.75s cubic-bezier(0.2, 0.9, 0.25, 1.08) both;
	}
	@keyframes rise-in {
		from {
			transform: translateY(70vh) rotate(-9deg) scale(0.9);
		}
	}
	/* 쓰는 동안 — 키보드 · 편지지와 겹치지 않게 화면 밖(아래)으로 */
	[data-phase='write'] .env-wrap {
		transform: translateY(80vh) rotate(4deg) scale(0.8);
		opacity: 0;
		transition-duration: 0.55s, 0.35s;
	}
	/* 편지지를 접으면 봉투가 다시 가운데로 올라와 받는다 */
	[data-phase='fold'] .env-wrap {
		transition-delay: 0.05s;
	}
	[data-phase='fly'] .env-wrap {
		transform: translate(22vw, -115vh) rotate(-16deg) scale(0.65);
		transition-duration: 0.75s;
		transition-timing-function: cubic-bezier(0.55, -0.15, 0.75, 0.3);
	}

	/* ── 편지지(쓰는 칸) — 봉투에서 솟아올라 펼쳐진다 ── */
	.sheet-wrap {
		position: relative;
		z-index: 3;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px var(--pad) 0;
		opacity: 0;
		transform: translateY(40%) scale(0.55);
		transform-origin: 50% 100%;
		transition:
			transform 0.6s cubic-bezier(0.22, 0.9, 0.25, 1),
			opacity 0.4s ease;
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
		transform: translateY(30%) scale(0.35, 0.2);
		pointer-events: none;
	}
	/* 보내기 줄 — 화면 아래(키보드 바로 위)에 붙는다 */
	.foot {
		position: sticky;
		bottom: var(--kb, 0px);
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 0 calc(var(--pad) * -1);
		padding: 10px var(--pad) calc(10px + env(safe-area-inset-bottom));
		background: linear-gradient(to top, var(--bg) 70%, color-mix(in srgb, var(--bg) 0%, transparent));
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
		height: 50px;
		padding: 0 20px;
		font-size: 17px;
	}
	.send svg {
		width: 16px;
		height: 16px;
	}
	/* 서명 칸 — 손글씨 From. 줄에 그대로 적는다 */
	.sign {
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: 8px;
	}
	.nick {
		width: 9.5em;
		min-width: 0;
		padding: 0 2px 2px;
		border: 0;
		border-bottom: 1.5px dashed color-mix(in srgb, var(--paper-ink) 35%, transparent);
		background: none;
		color: inherit;
		font: inherit;
		text-align: right;
		outline: none;
	}
	.nick::placeholder {
		color: color-mix(in srgb, var(--paper-ink) 45%, transparent);
	}
	.nick:focus {
		border-bottom-color: var(--accent);
	}
	.sign-hint {
		margin: 4px 0 0;
		text-align: right;
		font-size: 11px;
		opacity: 0.6;
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
