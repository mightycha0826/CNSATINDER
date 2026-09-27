<script lang="ts">
	/**
	 * 편지 한 통 (Phase 32) — 봉투를 열어 읽는다.
	 * 처음 여는 받은 편지는 연출: 주소 면 → 뒤집기 → 밀랍 봉인이 깨지고 → 덮개가 열리고 → 편지지가 나와 → 펼쳐 읽는다.
	 * 이미 열어 본 편지 · 내가 보낸 편지는 연출 없이 편지지만 펼친다. 화면을 누르면 연출을 건너뛴다.
	 * 아래: 받은 편지면 "답장 쓰기", 보낸 편지면 읽음 · 답장 여부. ⋯ 는 신고 · 차단 · 나가기 (LetterMenu).
	 */
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BackButton from '$lib/ui/BackButton.svelte';
	import Envelope from '$lib/letters/Envelope.svelte';
	import LetterSheet from '$lib/letters/LetterSheet.svelte';
	import LetterMenu from '$lib/letters/LetterMenu.svelte';
	import { anonName, fromLabel, openLetter, paperDate, stampDate, toLabel, type Letter } from '$lib/letters/api';
	import { DM, LIST, refreshUnread } from '$lib/letters/unread.svelte';
	import { envWidth, play } from '$lib/letters/stage';
	import { S, errMsg, toast } from '$lib/state.svelte';

	const id = $derived(Number(page.params.id));
	let letter = $state<Letter | null>(null);
	let gone = $state(false);
	let menu = $state(false);

	type Phase = 'front' | 'back' | 'crack' | 'open' | 'out' | 'unfold' | 'read';
	let phase = $state<Phase>('front');
	let stop = () => {};
	onDestroy(() => stop());
	let vw = $state(390);
	const w = $derived(envWidth(vw));

	$effect(() => {
		const target = id;
		void (async () => {
			try {
				const r = await openLetter(target);
				if (r.status !== 'ok') {
					gone = true;
					return;
				}
				const first = r.role === 'received' && !letter && r.first_open;
				letter = r;
				LIST.tab = r.role;
				if (r.role === 'received') {
					DM.unread = Math.max(0, DM.unread - (first ? 1 : 0));
					void refreshUnread();
				}
				// 처음 여는 받은 편지만 봉투 연출
				stop = first
					? play([
							[700, () => (phase = 'back')],
							[1450, () => (phase = 'crack')],
							[1850, () => (phase = 'open')],
							[2350, () => (phase = 'out')],
							[3000, () => (phase = 'unfold')],
							[3450, () => (phase = 'read')]
						])
					: play([[0, () => (phase = 'read')]]);
			} catch (e) {
				toast(errMsg(e));
			}
		})();
	});

	function skip() {
		if (phase === 'read') return;
		stop();
		phase = 'read';
	}

	// 이름표 — 받은 편지: To. 나 / From. 익명의 ○학생(또는 답장한 사람 이름). 보낸 편지: To. 받는 사람 / From. 나
	const myName = $derived(S.me?.name ?? '나');
	const names = $derived.by(() => {
		if (!letter) return { to: '', toSub: '', from: '' };
		if (letter.role === 'received') {
			// 모르는 사람이 보낸 편지는 내 이름으로, 내가 보낸 편지의 답장은 (나는 익명이었으니) 익명의 나로
			const to = letter.from_name ? anonName(S.profile?.gender) : myName;
			return { to, toSub: '', from: fromLabel(letter) };
		}
		const from = letter.to_name ? anonName(S.profile?.gender) : myName;
		return { to: toLabel(letter), toSub: letter.to_grade ? `${letter.to_grade}학년` : '', from };
	});
	const staging = $derived(phase !== 'read');
</script>

<svelte:window bind:innerWidth={vw} />

<div class="topbar">
	<BackButton href="/letters" history />
	<span class="title">{letter?.role === 'sent' ? '보낸 편지' : '받은 편지'}</span>
	{#if letter}
		<button class="more" onclick={() => (menu = true)} aria-label="메뉴">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="5" cy="12" r="1.6" fill="currentColor" />
				<circle cx="12" cy="12" r="1.6" fill="currentColor" />
				<circle cx="19" cy="12" r="1.6" fill="currentColor" />
			</svg>
		</button>
	{/if}
</div>

{#if gone}
	<div class="page"><p class="muted center">편지를 찾을 수 없어요</p></div>
{:else if letter}
	{#if staging}
		<!-- 봉투 열기 연출 — 누르면 건너뛴다 -->
		<button class="stage" data-phase={phase} onclick={skip} aria-label="봉투 열기 건너뛰기">
			<span class="desk" aria-hidden="true"></span>
			<span class="env-wrap" style:--w="{w}px">
				<Envelope
					to={names.to}
					from={names.from}
					date={stampDate(letter.created_at)}
					side={phase === 'front' ? 'front' : 'back'}
					sealed
					broken={phase !== 'front' && phase !== 'back'}
					open={phase === 'open' || phase === 'out' || phase === 'unfold'}
					paper={phase === 'out' || phase === 'unfold' ? 'out' : 'in'}
					glow={phase === 'front'}
					{w}
				/>
			</span>
			<span class="caption" aria-live="polite">
				<span>{#if phase === 'front'}<b>{names.from}</b>에게서 편지가 왔어요{:else}봉투를 여는 중…{/if}</span>
				<small>눌러서 건너뛰기</small>
			</span>
		</button>
	{:else}
		<div class="page read">
			<div class="unfold">
				<LetterSheet
					to={names.to}
					toSub={names.toSub}
					from={names.from}
					date={paperDate(letter.created_at)}
					body={letter.body}
					fmt={letter.fmt}
					removed={letter.removed}
				/>
			</div>

			<div class="actions">
				{#if letter.role === 'received'}
					{#if letter.can_reply && !letter.wait_reply}
						<button class="btn reply" onclick={() => goto(`/letters/m/${letter!.id}/reply`)}>
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l8 6 8-6M4 7v10h16V7H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
							편지로 답장 쓰기
						</button>
					{:else if letter.wait_reply}
						<p class="note">답장을 기다리는 중이에요 · 상대가 답하면 다시 쓸 수 있어요</p>
					{:else}
						<p class="note">끝난 편지예요</p>
					{/if}
				{:else}
					<p class="note">
						{#if letter.replied}답장이 왔어요 · 받은 편지함에서 확인해 보세요
						{:else if letter.opened}{toLabel(letter)}님이 봉투를 열어 봤어요
						{:else}아직 봉투를 열지 않았어요{/if}
					</p>
					{#if letter.wait_reply}<p class="note small">답장이 오기 전에는 3통까지 보낼 수 있어요</p>{/if}
				{/if}
			</div>
		</div>
	{/if}
{:else}
	<div class="page"><p class="muted center">봉투를 가져오는 중…</p></div>
{/if}

{#if menu && letter}
	<LetterMenu
		thread={{ id: letter.thread_id, recipient: letter.role === 'received' ? !letter.from_name : !letter.to_name }}
		title={letter.role === 'received' ? names.from : names.to}
		onclose={() => (menu = false)}
		ondone={() => {
			menu = false;
			void goto('/letters', { replaceState: true });
		}}
	/>
{/if}

<style>
	.more {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		margin-left: auto;
	}
	.more svg {
		width: 22px;
		height: 22px;
	}
	.center {
		margin: 48px auto;
		text-align: center;
	}

	/* ── 봉투 열기 연출 ── */
	.stage {
		position: relative;
		display: block;
		width: 100%;
		min-height: calc(100dvh - var(--header-h) - var(--safe-top));
		perspective: 1400px;
		overflow: hidden;
		cursor: pointer;
	}
	.desk {
		position: absolute;
		inset: 0;
		background: var(--desk);
	}
	.env-wrap {
		position: absolute;
		left: 50%;
		top: 42%;
		width: var(--w);
		margin-left: calc(var(--w) / -2);
		margin-top: calc(var(--w) * -0.31);
		transform-style: preserve-3d;
		transition:
			transform 0.5s cubic-bezier(0.5, 0, 0.75, 0),
			opacity 0.45s;
	}
	[data-phase='front'] .env-wrap {
		animation:
			drop-in 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.15) both,
			bob 2.4s 0.6s ease-in-out infinite;
	}
	@keyframes drop-in {
		from {
			transform: translateY(-70vh) rotate(10deg);
		}
	}
	@keyframes bob {
		50% {
			transform: translateY(-6px) rotate(-1deg);
		}
	}
	/* 편지지를 꺼내면 봉투는 아래로 떨어져 사라진다 */
	[data-phase='unfold'] .env-wrap {
		transform: translateY(55vh) rotate(6deg);
		opacity: 0;
	}
	.caption {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 18%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 0 var(--pad);
		font-size: 15px;
		text-align: center;
	}
	.caption small {
		font-size: 12px;
		color: var(--text-2);
	}

	/* ── 읽기 ── */
	.read {
		gap: 18px;
		padding-top: 18px;
		padding-bottom: calc(28px + env(safe-area-inset-bottom));
	}
	/* 편지지가 접힌 데서 펼쳐진다 */
	.unfold {
		isolation: isolate;
		animation: unfold 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		transform-origin: 50% 0;
	}
	@keyframes unfold {
		from {
			opacity: 0;
			transform: perspective(900px) rotateX(-70deg) translateY(30px) scale(0.9);
		}
	}
	.actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.reply {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.reply svg {
		width: 18px;
		height: 18px;
	}
	.note {
		margin: 0;
		font-size: 13px;
		color: var(--text-2);
		text-align: center;
	}
</style>
