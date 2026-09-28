<script lang="ts">
	/**
	 * 익명편지 탭 = 편지함 (Phase 32 · 35).
	 *   위: 아직 안 연 받은 편지만 — 봉인된 봉투가 비스듬히 쌓여 있다 (누르면 봉투를 연다).
	 *   아래: 갈색 책상 위 서류 더미 = 편지 보관함. 읽은 편지 · 보낸 편지가 겹겹이 쌓여 있고, 누르면 지금까지 받은 · 쓴 편지 전부 (/letters/archive).
	 * 오른쪽 아래 버튼으로 새 편지. 봉투를 길게 누르면(마우스는 오른쪽 클릭) 봉투 메뉴 — 열기 · 답장 · 버리기 · 차단 · 신고 (LetterMenu).
	 * 목록은 앱 안에서 기억해 두고(mailbox.svelte.ts) 다시 들어오면 바로 그린 뒤 뒤에서 새로 읽는다.
	 */
	import { goto } from '$app/navigation';
	import TopbarMe from '$lib/ui/TopbarMe.svelte';
	import Envelope from '$lib/letters/Envelope.svelte';
	import MailStack from '$lib/letters/MailStack.svelte';
	import { borderOf, myLabel, otherLabel, stampDate } from '$lib/letters/api';
	import { BOX, PAGE, pollMailbox, refreshMailbox } from '$lib/letters/mailbox.svelte';
	import { whileVisible } from '$lib/visible';
	import { S } from '$lib/state.svelte';

	$effect(() => {
		refreshMailbox();
		return whileVisible(pollMailbox, 120_000);
	});

	const unread = $derived(BOX.received.filter((i) => !i.opened && !i.removed));
	const readCount = $derived(BOX.received.length - unread.length);
	const sentCount = $derived(BOX.sent.length);
	const count = (n: number, more: boolean) => (more ? `${PAGE}+` : String(n));
	// 더미 맨 위 한 장 = 가장 최근에 읽은 받은 편지 (없으면 가장 최근에 보낸 편지)
	const top = $derived.by(() => {
		const r = BOX.received.find((i) => i.opened);
		const s = BOX.sent[0];
		if (r && (!s || r.id > s.id)) return { it: r, box: 'received' as const };
		return s ? { it: s, box: 'sent' as const } : null;
	});
	// 한 통이라도 있으면 겹겹이 쌓인 느낌이 나게 최소 네 장
	const pileSize = $derived(readCount + sentCount ? Math.min(7, Math.max(4, readCount + sentCount + 1)) : 0);
	const loaded = $derived(BOX.loaded.received && BOX.loaded.sent);
	// 봉투에 적힌 나 (받은 편지의 To. · 보낸 편지의 From.)
	const me = (it: (typeof BOX.received)[number], box: 'received' | 'sent') => myLabel(it, box, { name: S.me?.name, gender: S.profile?.gender });

	// 서류 더미 — 한 장씩 조금씩 어긋나게 (맨 아래일수록 크게)
	const LAYERS = [
		{ r: -7, x: -14, y: 10, kind: 'paper' },
		{ r: 5, x: 16, y: 8, kind: 'env' },
		{ r: -3, x: -6, y: 6, kind: 'paper' },
		{ r: 8, x: 10, y: 4, kind: 'env' },
		{ r: -5, x: -12, y: 3, kind: 'env' },
		{ r: 3, x: 6, y: 1, kind: 'paper' }
	];
</script>

<div class="topbar">
	<span class="title display">익명편지</span>
	<TopbarMe />
</div>

<div class="page mailbox">
	<div class="head">
		<h2>새 편지</h2>
		{#if unread.length}<span class="count num" aria-label="안 읽은 편지 {unread.length}통">{unread.length}</span>{/if}
	</div>

	{#if BOX.loaded.received && unread.length === 0}
		<div class="none">
			<svg viewBox="0 0 48 36" aria-hidden="true">
				<rect x="3" y="5" width="42" height="27" rx="3" fill="var(--env-paper)" stroke="var(--line)" stroke-width="1.5" />
				<path d="M3.5 7l20.5 14L44.5 7" fill="none" stroke="var(--line)" stroke-width="1.5" />
			</svg>
			<p>새로 온 편지가 없어요</p>
			<small class="muted">편지가 오면 여기에 봉인된 채로 도착해요</small>
		</div>
	{:else}
		<MailStack items={unread} box="received" loading={!BOX.loaded.received} />
	{/if}

	<!-- 편지 보관함 — 갈색 책상 위 서류 더미 -->
	<button class="desk" onclick={() => goto('/letters/archive')} aria-label="편지 보관함 — 받은 편지 {count(readCount, BOX.more.received)}통, 보낸 편지 {count(sentCount, BOX.more.sent)}통">
		<span class="wood" aria-hidden="true">
			<span class="pile">
				{#each LAYERS.slice(0, Math.max(0, pileSize - 1)) as l, i (i)}
					<i class="layer {l.kind}" style:--r="{l.r}deg" style:--x="{l.x}px" style:--y="{l.y}px"></i>
				{/each}
				{#if top}
					<span class="top-env">
						<Envelope
							to={top.box === 'received' ? me(top.it, top.box) : otherLabel(top.it, top.box)}
							from={top.box === 'received' ? otherLabel(top.it, top.box) : me(top.it, top.box)}
							date={stampDate(top.it.created_at)}
							border={borderOf(top.it, top.box)}
							postmark={stampDate(top.it.created_at)}
							w={176}
						/>
					</span>
				{:else if loaded}
					<span class="empty-desk">아직 쌓인 편지가 없어요</span>
				{/if}
			</span>
		</span>
		<span class="plate">
			<span class="plate-text">
				<strong>편지 보관함</strong>
				<span class="muted num">받은 편지 {count(readCount, BOX.more.received)} · 보낸 편지 {count(sentCount, BOX.more.sent)}</span>
			</span>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</span>
	</button>
</div>

<a class="fab" href="/letters/new" aria-label="편지 쓰기">
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
		<path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2" />
	</svg>
	<span>편지 쓰기</span>
</a>


<style>
	.mailbox {
		gap: 16px;
		padding-top: 14px;
		padding-bottom: 120px;
		background: var(--desk);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 2px;
	}
	.head h2 {
		margin: 0;
		font-family: var(--display);
		font-size: 18px;
		font-weight: 400;
		letter-spacing: 0;
	}
	.count {
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 10px;
		background: var(--accent-fill-deep);
		color: var(--on-accent);
		font-size: 12px;
		font-weight: 800;
		line-height: 20px;
		text-align: center;
	}
	.none {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 22px 16px;
		border-radius: var(--r-card);
		background: color-mix(in srgb, var(--surface) 70%, transparent);
		box-shadow: var(--shadow-1);
		text-align: center;
		animation: fade-up 0.4s ease-out both;
	}
	.none svg {
		width: 52px;
		margin-bottom: 4px;
	}
	.none p {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
	}
	.none small {
		font-size: 12px;
	}
	@keyframes fade-up {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}

	/* ── 책상 · 서류 더미 ── */
	.desk {
		display: flex;
		flex-direction: column;
		margin: 14px calc(var(--pad) * -1) 0;
		text-align: left;
		transition: transform 0.25s cubic-bezier(0.3, 0.7, 0.3, 1);
	}
	.desk:active {
		transform: scale(0.985);
	}
	.wood {
		position: relative;
		display: grid;
		place-items: center;
		height: 230px;
		/* 나뭇결 — 가는 결 · 굵은 결 · 위에서 비치는 빛 */
		background:
			repeating-linear-gradient(91deg, rgb(255 255 255 / 0.035) 0 2px, transparent 2px 11px),
			repeating-linear-gradient(89deg, rgb(40 15 0 / 0.08) 0 1px, transparent 1px 27px),
			radial-gradient(90% 70% at 40% 0%, rgb(255 210 160 / 0.22), transparent 70%),
			linear-gradient(180deg, #9a5f33, #7b4623 55%, #633619);
		box-shadow: inset 0 10px 18px -12px rgb(0 0 0 / 0.5);
		overflow: hidden;
	}
	/* 책상 앞 모서리 두께 */
	.wood::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 12px;
		background: linear-gradient(180deg, #5a3016, #3f200d);
		box-shadow: 0 -1px 0 rgb(255 220 180 / 0.18);
	}
	.pile {
		position: relative;
		display: grid;
		place-items: center;
		width: 190px;
		height: 130px;
		margin-top: -8px;
		transform: perspective(700px) rotateX(18deg);
	}
	.layer {
		position: absolute;
		width: 176px;
		height: 109px;
		border-radius: 4px;
		transform: translate(var(--x), var(--y)) rotate(var(--r));
		box-shadow: 0 2px 5px rgb(30 10 0 / 0.35);
	}
	.layer.paper {
		width: 150px;
		height: 118px;
		background:
			repeating-linear-gradient(180deg, transparent 0 11px, rgb(90 70 50 / 0.14) 11px 12px) 0 14px / 100% 100% no-repeat,
			#fffaf0;
	}
	.layer.env {
		background:
			linear-gradient(to bottom right, transparent calc(50% - 0.6px), rgb(80 60 40 / 0.18) 50%, transparent calc(50% + 0.6px)) left top / 50% 60% no-repeat,
			linear-gradient(to bottom left, transparent calc(50% - 0.6px), rgb(80 60 40 / 0.18) 50%, transparent calc(50% + 0.6px)) right top / 50% 60% no-repeat,
			var(--env-paper);
	}
	.top-env {
		position: relative;
		transform: rotate(-2deg);
		filter: drop-shadow(0 4px 6px rgb(30 10 0 / 0.4));
	}
	.empty-desk {
		color: rgb(255 235 215 / 0.8);
		font-size: 13px;
		font-weight: 700;
	}
	.plate {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: -26px var(--pad) 0;
		padding: 14px 16px;
		border-radius: var(--r-card);
		background: var(--surface);
		box-shadow: var(--shadow-2);
		position: relative;
	}
	.plate-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.plate strong {
		font-size: 16px;
		font-weight: 800;
	}
	.plate .muted {
		font-size: 13px;
	}
	.plate svg {
		width: 20px;
		height: 20px;
		color: var(--text-2);
	}

	/* 편지 쓰기 — 테마 색 (설정 > 테마 색상과 같이 바뀐다) */
	.fab {
		position: fixed;
		right: max(16px, calc(50% - 260px + 16px));
		bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px);
		z-index: 20;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 52px;
		padding: 0 20px 0 16px;
		border-radius: 999px;
		background: var(--accent-fill-deep);
		color: var(--on-accent);
		font-size: 15px;
		font-weight: 800;
		text-decoration: none;
		box-shadow: var(--glow);
		transition: transform 0.2s cubic-bezier(0.3, 0.7, 0.3, 1.4);
	}
	.fab:active {
		transform: scale(0.94);
	}
	.fab svg {
		width: 22px;
		height: 22px;
	}
</style>
