<script lang="ts">
	/**
	 * 편지 쓰기 연출 (Phase 32 · 35) — 새 편지 · 답장이 같이 쓴다.
	 *   들어올 때: 봉투가 올라와 덮개가 열리고 → 편지지가 솟아올라 → 화면 가득 펼쳐지며 편지 쓰는 칸이 된다 (봉투는 아래로 내려가 숨는다).
	 *   보낼 때: 편지지가 접혀 봉투로 들어가고 → 덮개가 닫히고 → 밀랍이 떨어지고 놋쇠 도장이 쿵 찍힌다(진동) → 봉투를 뒤집어 주소 면(소인 "보냄")
	 *            → 봉투가 작아지며 화면 위쪽 빨간 우체통의 투입구 위로 → 투입구로 쏙 들어간다 → 우체통이 출렁 (Phase 71 · 72, 전엔 하늘로 날아갔다).
	 * 편지함과 같은 장면 (Phase 72 · 73) — 위쪽 벽에 우체통이 걸려 있고 그 아래는 나무 책상. 편지지는 책상 위에 펼쳐져 우체통 앞을 덮는다.
	 * 쓰는 동안에는 봉투를 화면에서 치운다 — 휴대폰 키보드가 올라와 화면이 줄어도 편지지 · 보내기 단추를 가리지 않게 (Phase 35).
	 * 보내기 단추 줄은 화면 아래(키보드 위)에 붙는다.
	 * nickable 이면 From. 칸에 서명(닉네임)을 직접 적는다 — 비우면 anon("익명의 ○학생") 그대로.
	 * 보내기가 실패하면 쓰던 편지지로 돌아온다. 동작 줄이기면 연출 없이 바로 쓰고, 보내면 바로 끝난다.
	 */
	import { onDestroy } from 'svelte';
	import Envelope from './Envelope.svelte';
	import LetterEditor from './LetterEditor.svelte';
	import Postbox from './Postbox.svelte';
	import type { LetterFmt } from './rich';
	import { envWidth, play } from './stage';
	import * as haptic from '../haptics';
	import { NICK_MAX, paperDate, stampDate } from './api';

	let {
		to,
		toSub = '',
		from,
		nickable = false,
		nick: nickInit = '',
		placeholder,
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
		/** 서버에 보낸다 — 됐으면 true (연출을 이어 간다), 안 됐으면 false (편지지로 돌아온다 · 이유는 부르는 쪽이 알린다) */
		onsend: (body: string, fmt: LetterFmt | null, nick: string | null) => Promise<boolean>;
		/** 봉투가 날아간 뒤 */
		ondone: () => void;
	} = $props();

	const MAX = 1000;
	let body = $state('');
	let fmt = $state<LetterFmt | null>(null);
	// svelte-ignore state_referenced_locally
	let nick = $state(nickInit);
	const len = $derived(Array.from(body).length);
	const signed = $derived(nickable && nick.trim() ? nick.trim().replace(/\s+/g, ' ') : from);

	type Phase = 'enter' | 'opened' | 'rising' | 'write' | 'fold' | 'tuck' | 'close' | 'seal' | 'flip' | 'aim' | 'post';
	let phase = $state<Phase>('enter');
	const w = $derived(envWidth(320));
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
		stop = play([
			[200, () => (phase = 'tuck')],
			[900, () => (phase = 'close')],
			[1500, () => (phase = 'seal')],
			// 도장이 닿는 순간 (Envelope 의 찍기 1.2s 중 45%)
			[1500 + 540, haptic.confirm],
			[2800, () => (phase = 'flip')],
			[3550, aim],
			[4250, () => (phase = 'post')],
			// 봉투가 투입구로 다 들어간 순간
			[4250 + 520, () => (bump++, haptic.success())],
			[5450, ondone]
		]);
	}

	// ── 우체통에 넣기 (Phase 71) — 투입구 자리를 재서 봉투를 그 위로 옮기고(작게), 그다음 봉투만 아래로 밀어 넣는다.
	// 봉투 자리(env-wrap)의 아래 가장자리가 투입구 가운데 선에 오게 — post 에서 그 선 아래는 잘려 보이지 않는다(들어간 것처럼)
	let envEl = $state<HTMLElement>();
	let slotEl = $state<Element>();
	let bump = $state(0);
	let target = $state({ x: 0, y: 0, s: 0.3 });
	function aim() {
		if (envEl && slotEl) {
			const e = envEl.getBoundingClientRect();
			const s = slotEl.getBoundingClientRect();
			const scale = Math.min(0.55, (s.width * 0.8) / e.width);
			target = {
				x: s.left + s.width / 2 - (e.left + e.width / 2),
				y: s.top + s.height / 2 - (e.height * scale) / 2 - (e.top + e.height / 2),
				s: scale
			};
		}
		phase = 'aim';
	}

	// 봉투 상태 — 단계마다
	const side = $derived(['flip', 'aim', 'post'].includes(phase) ? 'front' : 'back');
	const open = $derived(['opened', 'rising', 'write', 'fold', 'tuck'].includes(phase));
	const paperPos = $derived(phase === 'rising' || phase === 'fold' || phase === 'write' ? 'out' : 'in');
	const sealed = $derived(['seal', 'flip', 'aim', 'post'].includes(phase));
	const posting = $derived(['flip', 'aim', 'post'].includes(phase));

</script>


<div class="compose" data-phase={phase}>
	<div class="desk" aria-hidden="true"><i class="wall"></i><i class="wood"></i></div>

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
		<!-- iOS 는 키보드가 올라와도 화면(레이아웃)이 줄지 않는다 — 키보드 높이(--kb, lib/keyboard.svelte.ts)만큼 보내기 줄을 올린다 -->
		<div class="foot">
			<span class="num" class:over={len > MAX}>{len > MAX ? `${len - MAX}자 넘음 · ` : ''}{len}/{MAX}</span>
			<button class="btn send" onclick={send} disabled={!ready}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-3-7-7-1z" fill="currentColor" /></svg>
				봉투에 넣어 보내기
			</button>
		</div>
	</div>

	<!-- 빨간 우체통 — 화면 위쪽. 편지지가 그 앞을 덮는다 -->
	<div class="post" aria-hidden="true">
		<Postbox bind:slot={slotEl} {bump} />
	</div>

	<div class="env-wrap" style:--w="{w}px" style:--tx="{target.x}px" style:--ty="{target.y}px" style:--ts={target.s} bind:this={envEl}>
		<div class="env-inner">
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
				{body}
				{w}
			/>
		</div>
	</div>

	{#if sending}<p class="status" aria-live="polite">{phase === 'post' ? '우체통에 쏙! 편지가 출발했어요' : posting ? '우체통에 넣는 중…' : '봉투에 담는 중…'}</p>{/if}
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
	/* 벽(우체통이 걸린 곳) + 나무 책상 — 편지함과 같은 장면 */
	.compose {
		--mb-w: min(72vw, 270px);
		--wall-h: calc(var(--header-h) + var(--safe-top) + 30px + var(--mb-w) * 0.7 + 22px);
	}
	.desk {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		pointer-events: none;
	}
	.desk .wall {
		flex: none;
		height: var(--wall-h);
		background: var(--wall);
	}
	.desk .wood {
		flex: 1;
		background: var(--wood);
		border-top: 2px solid rgb(255 255 255 / 0.35);
		box-shadow: inset 0 14px 16px -12px var(--wood-shade);
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
	/* 우체통 투입구 위로 — 작아지며 옮겨 간다 (자리는 aim() 이 잰다) */
	[data-phase='aim'] .env-wrap,
	[data-phase='post'] .env-wrap {
		transform: translate(var(--tx), var(--ty)) scale(var(--ts));
		transition-duration: 0.62s;
		transition-timing-function: cubic-bezier(0.35, 0.8, 0.3, 1);
	}
	/* 투입구로 쏙 — 봉투 자리의 아래 가장자리(= 투입구 가운데 선) 밑은 잘라 보이지 않게 하고, 봉투만 아래로 민다 */
	[data-phase='post'] .env-wrap {
		clip-path: polygon(-100vw -100vh, 200vw -100vh, 200vw 100%, -100vw 100%);
	}
	.env-inner {
		transition: transform 0.5s cubic-bezier(0.55, 0, 0.8, 0.35);
	}
	[data-phase='post'] .env-inner {
		transform: translateY(104%);
	}

	/* ── 빨간 우체통 — 화면 위쪽, 편지함과 같은 납작한 네모 (들어올 때 위에서 살짝 내려온다) ── */
	.post {
		position: fixed;
		left: 50%;
		top: calc(var(--header-h) + var(--safe-top) + 30px);
		z-index: 1;
		width: var(--mb-w);
		translate: -50% 0;
		pointer-events: none;
		animation: post-in 0.5s cubic-bezier(0.25, 0.9, 0.3, 1.05) both;
	}
	@keyframes post-in {
		from {
			opacity: 0;
			transform: translateY(-24px);
		}
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
		/* 책상 위라 판자색 받침 */
		background: linear-gradient(to top, var(--wood-base) 55%, color-mix(in srgb, var(--wood-base) 0%, transparent));
		font-size: 12px;
		color: var(--wood-ink);
	}
	/* 키보드가 떠 있을 때는 홈 인디케이터 여백이 필요 없다 */
	:global(html.kb-open) .foot {
		padding-bottom: 10px;
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
	/* 안내 글 — 위는 우체통 자리라 아래쪽에 */
	.status {
		position: fixed;
		left: 0;
		right: 0;
		bottom: calc(22% - 20px);
		margin: 0;
		text-align: center;
		font-size: 14px;
		font-weight: 700;
		color: var(--wood-ink);
		z-index: 2;
	}
</style>
