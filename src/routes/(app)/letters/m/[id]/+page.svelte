<script lang="ts">
	/**
	 * 편지 한 통 (Phase 32) — 봉투를 열어 읽는다.
	 * 처음 여는 받은 편지는 연출: 주소 면 → 뒤집기 → 밀랍 봉인에 금이 가고 → 봉인이 붙은 채 덮개가 열리고 → 편지지가 나와 → 펼쳐 읽는다.
	 * 이미 열어 본 편지 · 내가 보낸 편지는 연출 없이 편지지만 펼친다. 화면을 누르면 연출을 건너뛴다.
	 * 아래: 받은 편지면 "답장 쓰기" + 인스타 스토리 공유(Phase 45, story.ts), 보낸 편지면 읽음 · 답장 여부. ⋯ 는 편지 버리기 · 차단 · 신고 (LetterMenu).
	 */
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { navigateFromOverlay } from '$lib/overlay.svelte';
	import { page } from '$app/state';
	import BackButton from '$lib/ui/BackButton.svelte';
	import MoreButton from '$lib/ui/MoreButton.svelte';
	import Envelope from '$lib/letters/Envelope.svelte';
	import LetterSheet from '$lib/letters/LetterSheet.svelte';
	import LetterMenu from '$lib/letters/LetterMenu.svelte';
	import { anonName, borderOf, iAmRecipient, myLabel, openLetter, otherLabel, paperDate, stampDate, toLabel, type Letter } from '$lib/letters/api';
	import { shareImage, storyImage } from '$lib/letters/story';
	import { DM, LIST, refreshUnread } from '$lib/letters/unread.svelte';
	import { markOpened } from '$lib/letters/mailbox.svelte';
	import { clearNotifications } from '$lib/push';
	import { envWidth, play } from '$lib/letters/stage';
	import * as haptic from '$lib/haptics';
	import { S, errMsg, toast } from '$lib/state.svelte';

	const id = $derived(Number(page.params.id));
	let letter = $state<Letter | null>(null);
	let gone = $state(false);
	let menu = $state(false);

	type Phase = 'front' | 'back' | 'crack' | 'open' | 'out' | 'unfold' | 'read';
	let phase = $state<Phase>('front');
	let stop = () => {};
	onDestroy(() => stop());
	const w = $derived(envWidth());

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
					markOpened(r.id);
					void clearNotifications(`dm-${r.id}`);
					void refreshUnread();
				}
				// 처음 여는 받은 편지만 봉투 연출
				stop = first
					? play([
							[700, () => (phase = 'back')],
							[1500, () => ((phase = 'crack'), haptic.select())],
							[2150, () => (phase = 'open')],
							[2650, () => (phase = 'out')],
							[3300, () => (phase = 'unfold')],
							[3750, () => (phase = 'read')]
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

	// 이름표 — 받은 편지: To. 나 / From. 서명 · 익명의 ○학생(또는 답장한 사람 이름). 보낸 편지: To. 받는 사람 / From. 나
	//   나 = 모르는 사람과 주고받은 편지면 내 이름, 내가 익명으로 보낸 편지(와 그 답장)면 내 서명 · 익명의 나 (myLabel)
	const names = $derived.by(() => {
		if (!letter) return { to: '', toSub: '', from: '' };
		const me = myLabel(letter, letter.role, { name: S.me?.name, gender: S.profile?.gender });
		const other = otherLabel(letter, letter.role);
		return letter.role === 'received'
			? { to: me, toSub: '', from: other }
			: { to: other, toSub: letter.to_grade ? `${letter.to_grade}학년` : '', from: me };
	});
	const staging = $derived(phase !== 'read');

	// ── 인스타 스토리 공유 (Phase 45) ──
	// 그림은 누를 때 이 기기에서 그린다. 그리는 사이 손길이 식어 공유 창이 막히면(iOS) 그린 그림을 두었다가 다시 누를 때 바로 연다.
	// From. 은 늘 익명 이름표 — 이름으로 온 답장이어도 스토리에는 상대 이름을 싣지 않는다.
	let story: { id: number; file: File } | null = null;
	let drawing = $state(false);
	let sharing = false;
	const canStory = $derived(!!letter && letter.role === 'received' && !letter.removed && !!letter.body);
	async function shareStory() {
		const l = letter;
		if (!l || drawing || sharing) return;
		haptic.select();
		sharing = true;
		try {
			let file = story?.id === l.id ? story.file : null;
			if (!file) {
				drawing = true;
				file = await storyImage({
					to: names.to,
					from: l.from_nick ?? anonName(l.from_gender),
					date: paperDate(l.created_at),
					body: l.body ?? '',
					fmt: l.fmt
				});
				story = { id: l.id, file };
				drawing = false;
			}
			const r = await shareImage(file);
			if (r === 'again') toast('스토리 그림이 준비됐어요 · 한 번 더 누르면 공유 창이 열려요');
			else if (r === 'saved') toast('스토리 그림을 저장했어요 · 인스타그램에서 스토리로 올려 보세요');
		} catch {
			toast('스토리로 공유하지 못했어요');
		} finally {
			drawing = false;
			sharing = false;
		}
	}
</script>


<div class="topbar">
	<BackButton href="/letters" history />
	<span class="title">{letter?.role === 'sent' ? '보낸 편지' : '받은 편지'}</span>
	{#if letter}
		<MoreButton onclick={() => (menu = true)} push />
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
					border={borderOf(letter, letter.role)}
					sealed
					cracked={phase !== 'front' && phase !== 'back'}
					open={phase === 'open' || phase === 'out' || phase === 'unfold'}
					paper={phase === 'out' || phase === 'unfold' ? 'out' : 'in'}
					glow={phase === 'front'}
					body={letter.removed ? '' : (letter.body ?? '')}
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
					<!-- 답장(넓게) · 인스타 스토리(작게, 오른쪽) 한 줄 -->
					<div class="row">
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
						{#if canStory}
							<button class="ig" class:busy={drawing} onclick={shareStory} aria-label="인스타그램 스토리에 공유" aria-busy={drawing}>
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<defs>
										<linearGradient id="ig-grad" x1="0" y1="1" x2="1" y2="0">
											<stop offset="0" stop-color="#feda75" />
											<stop offset="0.3" stop-color="#fa7e1e" />
											<stop offset="0.6" stop-color="#d62976" />
											<stop offset="1" stop-color="#4f5bd5" />
										</linearGradient>
									</defs>
									<rect x="3" y="3" width="18" height="18" rx="5.5" fill="none" stroke="url(#ig-grad)" stroke-width="2" />
									<circle cx="12" cy="12" r="4.2" fill="none" stroke="url(#ig-grad)" stroke-width="2" />
									<circle cx="17.2" cy="6.8" r="1.25" fill="url(#ig-grad)" />
								</svg>
							</button>
						{/if}
					</div>
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
		thread={{ id: letter.thread_id, recipient: iAmRecipient(letter, letter.role) }}
		title={otherLabel(letter, letter.role)}
		onclose={() => (menu = false)}
		ondone={() => {
			// 메뉴 시트를 닫으며 이동 — 시트의 뒤로가기 칸과 이동이 서로 취소하지 않게 (lib/overlay.svelte.ts)
			void navigateFromOverlay('/letters', { replaceState: true });
			menu = false;
		}}
	/>
{/if}

<style>
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
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
	}
	.reply {
		flex: 1;
		min-width: 0;
		gap: 8px;
	}
	.row .note {
		flex: 1;
	}
	/* 인스타 스토리 — 답장 버튼(54) 옆 작은 동그라미. 누름 영역은 54 그대로 (G1) */
	.ig {
		flex: none;
		display: grid;
		place-items: center;
		width: 54px;
		height: 54px;
		border-radius: 50%;
		background: var(--field);
		transition:
			transform 0.15s,
			opacity 0.2s;
	}
	.ig:active {
		transform: scale(0.92);
	}
	.ig svg {
		width: 24px;
		height: 24px;
	}
	.ig.busy {
		animation: pulse 0.9s ease-in-out infinite alternate;
	}
	@keyframes pulse {
		to {
			opacity: 0.45;
		}
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
