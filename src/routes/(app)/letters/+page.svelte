<script lang="ts">
	/**
	 * 익명편지 탭 = 편지함 (Phase 32 · 35 · 71).
	 *   위: 큰 빨간 우체통 (Phase 71) — 안 읽은 편지 수가 붙고 투입구에 봉투 끝이 삐죽 나온다. 새 편지가 오면
	 *       봉투가 위에서 떨어져 투입구로 들어가고 → 통이 출렁 → 아래 문이 열려 그 편지가 우체통 밑으로 나와 놓인다 (한 통에 한 번).
	 *       누르면 가장 최근에 온 안 읽은 편지를 연다.
	 *   그 아래: 아직 안 연 받은 편지 — 봉인된 봉투가 비스듬히 쌓여 있다 (누르면 봉투를 연다).
	 *   맨 아래: 갈색 책상 위 서류 더미 = 편지 보관함. 읽은 편지 · 보낸 편지가 겹겹이 쌓여 있고, 누르면 지금까지 받은 · 쓴 편지 전부 (/letters/archive).
	 *   책상은 화면 아래쪽에 놓이고(남는 자리는 위에), 책상 · 더미 · 봉투 · 우체통은 화면 크기에 맞춰 같은 비율로 커지고 작아진다 (Phase 46).
	 *   책상 앞 한 줄 = [편지 보관함 이름표 | 편지 쓰기] (Phase 71 — 전엔 편지 쓰기가 화면 위에 떠 있었다).
	 * 봉투를 길게 누르면(마우스는 오른쪽 클릭) 봉투 메뉴 — 열기 · 답장 · 버리기 · 차단 · 신고 (LetterMenu).
	 * 목록은 앱 안에서 기억해 두고(mailbox.svelte.ts) 다시 들어오면 바로 그린 뒤 뒤에서 새로 읽는다.
	 */
	import { onDestroy, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import TopbarMe from '$lib/ui/TopbarMe.svelte';
	import Envelope from '$lib/letters/Envelope.svelte';
	import MailStack from '$lib/letters/MailStack.svelte';
	import Postbox from '$lib/letters/Postbox.svelte';
	import { borderOf, myLabel, otherLabel, stampDate } from '$lib/letters/api';
	import { ANNOUNCED, BOX, PAGE, pollMailbox, refreshMailbox } from '$lib/letters/mailbox.svelte';
	import { reducedMotion } from '$lib/motion';
	import * as haptic from '$lib/haptics';
	import { whileVisible } from '$lib/visible';
	import { S } from '$lib/state.svelte';

	$effect(() => {
		refreshMailbox();
		return whileVisible(pollMailbox, 120_000);
	});

	const unread = $derived(BOX.received.filter((i) => !i.opened && !i.removed));

	// ── 우체통으로 편지가 온다 (Phase 71) ──
	// 처음 보는 안 읽은 편지가 생기면: 봉투가 투입구로 떨어지고(0) → 출렁(0.8s, Postbox) → 문이 열리고(0.95s) → 편지가 한 통씩 나온 뒤 → 문이 닫힌다
	const DOOR = 950;
	let emerge = $state<Record<number, number>>({}); // 편지 id → 나오기 시작하는 때(ms). 한 번 정하면 그대로 (바꾸면 장면이 다시 돈다)
	let drop = $state(0);
	let bump = $state(0);
	let doorOpen = $state(false);
	const timers: ReturnType<typeof setTimeout>[] = [];
	onDestroy(() => timers.forEach(clearTimeout));
	$effect(() => {
		if (!BOX.loaded.received) return;
		const news = unread.filter((i) => !ANNOUNCED.has(i.id)).map((i) => i.id);
		if (!news.length) return;
		news.forEach((id) => ANNOUNCED.add(id));
		if (reducedMotion()) return;
		untrack(() => {
			emerge = { ...emerge, ...Object.fromEntries(news.map((id, i) => [id, DOOR + 150 + i * 110])) };
			drop++;
		});
		haptic.select();
		timers.push(
			setTimeout(() => (doorOpen = true), DOOR),
			setTimeout(() => (doorOpen = false), DOOR + 150 + news.length * 110 + 700)
		);
	});
	function tapPostbox() {
		const first = unread[0];
		if (first) void goto(`/letters/m/${first.id}`);
		else bump++;
	}
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
	const filedCount = $derived(BOX.folders.reduce((n, f) => n + f.count, 0));
	const pileSize = $derived(readCount + sentCount + filedCount ? Math.min(7, Math.max(4, readCount + sentCount + filedCount + 1)) : 0);
	const loaded = $derived(BOX.loaded.received && BOX.loaded.sent);
	// 봉투에 적힌 나 (받은 편지의 To. · 보낸 편지의 From.)
	const me = (it: (typeof BOX.received)[number], box: 'received' | 'sent') => myLabel(it, box, { name: S.me?.name, gender: S.profile?.gender });

	// 서류 더미 — 한 장씩 조금씩 어긋나게 (맨 아래일수록 크게)
	// 책상 비율 — 폭 390 · 높이 844 폰에서 1. 좁거나 낮은 화면은 작게, 넓고 높은 화면(태블릿 · 데스크톱 창)은 크게
	// 아래 끝 0.75 = 아이폰 SE(375×667) · 큰 글꼴 안드로이드(≈280×574)에서도 책상 이름표가 편지 쓰기 단추 위에 오게 (Phase 47)
	let deskW = $state(390);
	let vh = $state(844);
	const k = $derived(Math.min(1.5, Math.max(0.75, Math.min(deskW / 390, vh / 844))));

	// 편지 쓰기 단추는 보관함 이름표와 한 줄 (Phase 71) — 이름표 높이에 맞춘다 (글이 두 줄로 접혀도 같이)
	let plateH = $state(64);

	const LAYERS = [
		{ r: -7, x: -14, y: 10, kind: 'paper' },
		{ r: 5, x: 16, y: 8, kind: 'env' },
		{ r: -3, x: -6, y: 6, kind: 'paper' },
		{ r: 8, x: 10, y: 4, kind: 'env' },
		{ r: -5, x: -12, y: 3, kind: 'env' },
		{ r: 3, x: 6, y: 1, kind: 'paper' }
	];
</script>

<svelte:window bind:innerHeight={vh} />

<div class="topbar">
	<span class="title display">익명편지</span>
	<TopbarMe />
</div>

<div class="page mailbox" style:--k={k}>
	<h2 class="sr-only">새 편지</h2>
	<!-- 우체통 — 새 편지가 여기로 온다 -->
	<button
		class="post"
		onclick={tapPostbox}
		aria-label={unread.length ? `우체통 — 새 편지 ${unread.length}통, 눌러서 가장 최근 편지 열기` : BOX.loaded.received ? '우체통 — 새 편지 없음' : '우체통'}
	>
		<Postbox count={unread.length} open={doorOpen} {drop} {bump} />
	</button>

	{#if !BOX.loaded.received || unread.length}
		<MailStack items={unread} box="received" loading={!BOX.loaded.received} {emerge} />
	{/if}

	<!-- 편지 보관함 — 갈색 책상 위 서류 더미. 앞 한 줄은 [이름표 | 편지 쓰기] -->
	<div class="desk-area" style:--plate-h="{plateH}px">
	<button class="desk" bind:clientWidth={deskW} onclick={() => goto('/letters/archive')} aria-label="편지 보관함 — 받은 편지 {count(readCount, BOX.more.received)}통, 보낸 편지 {count(sentCount, BOX.more.sent)}통{BOX.folders.length ? `, 폴더 ${BOX.folders.length}개` : ''}">
		<span class="wood" aria-hidden="true">
			<!-- 책상 위 물건들 (Phase 58) — 서류 더미를 피해 가장자리에. 위에서 내려다본 모습, 책상 비율(--k)대로 커지고 작아진다 -->
			<span class="props">
				<!-- 포스트잇 — 하트 낙서 -->
				<svg class="prop note" viewBox="0 0 64 64">
					<path d="M2 2h60v46L48 62H2z" fill="#ffe68a" />
					<path d="M62 48H51a3 3 0 0 0-3 3v11z" fill="#e6c455" />
					<path d="M11 17h36M11 27h29M11 37h17" stroke="#c9a53a" stroke-width="2.4" stroke-linecap="round" opacity=".55" />
					<path d="M42 44c-3-2.3-6-4.6-6-7.4a3 3 0 0 1 6-1.2 3 3 0 0 1 6 1.2c0 2.8-3 5.1-6 7.4z" fill="none" stroke="#e0456a" stroke-width="1.9" stroke-linejoin="round" />
				</svg>
				<!-- 커피 — 컵 자국 · 라테 아트 하트 -->
				<svg class="prop ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="none" stroke="rgb(40 15 0 / .2)" stroke-width="3" stroke-dasharray="120 14 30 8" /></svg>
				<svg class="prop mug" viewBox="0 0 86 72">
					<defs>
						<radialGradient id="desk-coffee" cx="45%" cy="40%" r="60%">
							<stop offset="0" stop-color="#9a6436" />
							<stop offset=".65" stop-color="#5e3218" />
							<stop offset="1" stop-color="#3f1e0c" />
						</radialGradient>
					</defs>
					<path d="M64 25a12 12 0 0 1 0 22" fill="none" stroke="#efe8df" stroke-width="7.5" stroke-linecap="round" />
					<circle cx="36" cy="36" r="32" fill="#f6f1ea" />
					<circle cx="36" cy="36" r="32" fill="none" stroke="rgb(90 60 30 / .18)" stroke-width="1.2" />
					<circle cx="36" cy="36" r="25.5" fill="url(#desk-coffee)" />
					<path d="M36 47c-6.5-4.2-11-7.6-11-11.6a5.3 5.3 0 0 1 11-1.5 5.3 5.3 0 0 1 11 1.5c0 4-4.5 7.4-11 11.6z" fill="#ecd3b2" opacity=".9" />
					<ellipse cx="25" cy="18" rx="9" ry="3.2" fill="#fff" opacity=".55" transform="rotate(-32 25 18)" />
				</svg>
				<!-- 만년필 (펜촉이 왼쪽 아래로) -->
				<svg class="prop pen" viewBox="0 0 170 20">
					<defs>
						<linearGradient id="desk-pen" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stop-color="#b3304f" />
							<stop offset=".55" stop-color="#7d1731" />
							<stop offset="1" stop-color="#4c0a1c" />
						</linearGradient>
					</defs>
					<path d="M1 10l21-4.5h4v9h-4z" fill="#e8c46c" />
					<path d="M5 10h17" stroke="#8a6a20" stroke-width=".9" />
					<circle cx="18" cy="10" r="1.3" fill="#8a6a20" />
					<rect x="26" y="5" width="16" height="10" rx="2" fill="#2b2a31" />
					<rect x="42" y="3" width="120" height="14" rx="7" fill="url(#desk-pen)" />
					<rect x="98" y="3" width="4.5" height="14" fill="#e8c46c" />
					<rect x="106" y="1.3" width="48" height="3.4" rx="1.7" fill="#e8c46c" />
					<rect x="47" y="5.2" width="108" height="2.2" rx="1.1" fill="#fff" opacity=".22" />
				</svg>
				<!-- 연필 (지우개 달린) -->
				<svg class="prop pencil" viewBox="0 0 150 14">
					<path d="M0 7l20-6v12z" fill="#f0d2a6" />
					<path d="M0 7l7-2.1v4.2z" fill="#3b3b3b" />
					<rect x="20" y="1" width="106" height="12" fill="#f6c343" />
					<rect x="20" y="5" width="106" height="4" fill="#e7ad2a" />
					<rect x="126" y="1" width="10" height="12" fill="#c8cbd1" />
					<path d="M129 1v12M132.5 1v12" stroke="#9ea3ab" stroke-width=".9" />
					<rect x="136" y="1" width="13" height="12" rx="3" fill="#f28ca0" />
				</svg>
				<!-- 봉인 밀랍 막대 · 놋쇠 도장 -->
				<svg class="prop sealkit" viewBox="0 0 96 52">
					<defs>
						<radialGradient id="desk-brass" cx="34%" cy="28%" r="78%">
							<stop offset="0" stop-color="#fff3c4" />
							<stop offset=".3" stop-color="#e6bb5c" />
							<stop offset=".72" stop-color="#a8752a" />
							<stop offset="1" stop-color="#5f3f10" />
						</radialGradient>
						<radialGradient id="desk-knob" cx="38%" cy="32%" r="72%">
							<stop offset="0" stop-color="#b98356" />
							<stop offset=".55" stop-color="#6e3f22" />
							<stop offset="1" stop-color="#3a1f0d" />
						</radialGradient>
					</defs>
					<rect x="2" y="34" width="56" height="11" rx="3" fill="#b8142f" transform="rotate(-8 30 40)" />
					<rect x="6" y="35.5" width="46" height="2.4" rx="1.2" fill="#fff" opacity=".25" transform="rotate(-8 30 40)" />
					<path d="M55 33.5c3 .4 5 2.6 4.4 5.6-.5 2.4-2.6 3.6-5.2 3.2z" fill="#8a0c20" />
					<circle cx="72" cy="24" r="21" fill="url(#desk-brass)" />
					<circle cx="72" cy="24" r="17.5" fill="none" stroke="rgb(80 50 8 / .5)" stroke-width=".9" />
					<circle cx="72" cy="24" r="13.5" fill="url(#desk-knob)" />
					<ellipse cx="67.2" cy="17.2" rx="5" ry="2.7" fill="#fff" opacity=".3" transform="rotate(-32 67.2 17.2)" />
				</svg>
				<!-- 종이 클립 -->
				<svg class="prop clip c1" viewBox="0 0 14 40"><path d="M4 30V8a3.5 3.5 0 0 1 7 0v24a5.5 5.5 0 0 1-11 0V10" fill="none" stroke="#d3d7de" stroke-width="1.7" stroke-linecap="round" /></svg>
				<svg class="prop clip c2" viewBox="0 0 14 40"><path d="M4 30V8a3.5 3.5 0 0 1 7 0v24a5.5 5.5 0 0 1-11 0V10" fill="none" stroke="#e7a3b4" stroke-width="1.7" stroke-linecap="round" /></svg>
			</span>
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
							w={Math.round(176 * k)}
						/>
					</span>
				{:else if loaded && !pileSize}
					<span class="empty-desk">아직 쌓인 편지가 없어요</span>
				{/if}
			</span>
		</span>
		<span class="plate" bind:clientHeight={plateH}>
			<span class="plate-text">
				<strong>편지 보관함</strong>
				<span class="muted num">받은 편지 {count(readCount, BOX.more.received)} · 보낸 편지 {count(sentCount, BOX.more.sent)}{#if BOX.folders.length}&nbsp;· 폴더 {BOX.folders.length}{/if}</span>
			</span>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</span>
	</button>
	<a class="fab" href="/letters/new" aria-label="편지 쓰기">
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
			<path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2" />
		</svg>
		<span>편지 쓰기</span>
	</a>
	</div>
</div>


<style>
	.mailbox {
		/* 책상이 화면 양옆보다 이만큼 더 넓다 (Phase 71) — 눌러서 살짝 줄어도 모서리에 바깥 바탕이 비치지 않게 */
		--bleed: 14px;
		gap: 16px;
		padding-top: 14px;
		padding-bottom: 18px;
		background: var(--desk);
		overflow-x: clip;
	}

	/* ── 우체통 (Phase 71) ── */
	.post {
		align-self: center;
		width: calc(150px * var(--k, 1));
		margin-top: 4px;
		-webkit-tap-highlight-color: transparent;
	}
	.post:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 6px;
		border-radius: 12px;
	}

	/* ── 책상 · 서류 더미 ── */
	/* 책상은 화면 아래쪽 — 남는 자리는 새 편지와 책상 사이로 (margin-top: auto). 편지가 많아 화면을 넘으면 그냥 이어서 */
	.desk-area {
		position: relative;
		margin: auto calc(var(--pad) * -1 - var(--bleed)) 0;
	}
	.desk {
		display: flex;
		flex-direction: column;
		width: 100%;
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
		height: calc(380px * var(--k, 1)); /* Phase 48 — 판자를 더 길게 (230 → 300), Phase 58 — 물건을 올려 둘 자리까지 (300 → 380) */
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
	/* ── 책상 위 물건들 (Phase 58) — 가운데 서류 더미(190 × 130)와 아래 이름표(아래 26px)를 피해 가장자리에 ── */
	.props {
		position: absolute;
		inset: 0 var(--bleed); /* 화면 밖으로 넓힌 만큼은 빼고 — 물건은 보이는 자리에 */
		pointer-events: none;
	}
	.prop {
		position: absolute;
		height: auto;
		filter: drop-shadow(0 calc(3px * var(--k, 1)) calc(3px * var(--k, 1)) rgb(30 10 0 / 0.42));
	}
	.note {
		left: calc(16px * var(--k, 1));
		top: calc(20px * var(--k, 1));
		width: calc(62px * var(--k, 1));
		rotate: -9deg;
	}
	.ring {
		right: calc(76px * var(--k, 1));
		top: calc(62px * var(--k, 1));
		width: calc(56px * var(--k, 1));
		filter: none;
	}
	.mug {
		right: calc(16px * var(--k, 1));
		top: calc(16px * var(--k, 1));
		width: calc(84px * var(--k, 1));
	}
	.pen {
		left: calc(10px * var(--k, 1));
		bottom: calc(60px * var(--k, 1));
		width: calc(168px * var(--k, 1));
		rotate: -24deg;
	}
	/* 연필은 책상 오른쪽 끝에 걸쳐 있다 (끝이 책상 밖으로 조금 나가 잘린다) */
	.pencil {
		right: calc(-40px * var(--k, 1));
		top: calc(175px * var(--k, 1));
		width: calc(140px * var(--k, 1));
		rotate: 72deg;
	}
	.sealkit {
		right: calc(18px * var(--k, 1));
		bottom: calc(58px * var(--k, 1));
		width: calc(96px * var(--k, 1));
	}
	.clip {
		width: calc(12px * var(--k, 1));
	}
	.clip.c1 {
		left: calc(34px * var(--k, 1));
		top: calc(150px * var(--k, 1));
		rotate: 24deg;
	}
	.clip.c2 {
		left: calc(50% + 30px * var(--k, 1));
		bottom: calc(66px * var(--k, 1));
		rotate: -68deg;
	}
	/* 낮은 화면(아이폰 SE · 큰 글꼴 안드로이드) — 판자는 예전 길이(300)로 두어 보관함 이름표가 편지 쓰기 단추 위에 보이게 (Phase 47).
	   물건은 서류 더미와 겹치지 않게 줄이고 옮긴다 */
	@media (max-height: 759px) {
		.wood {
			height: calc(300px * var(--k, 1));
		}
		.ring,
		.pencil,
		.clip.c2 {
			display: none;
		}
		.mug {
			top: calc(12px * var(--k, 1));
			right: calc(12px * var(--k, 1));
			width: calc(70px * var(--k, 1));
		}
		.pen {
			left: calc(12px * var(--k, 1));
			bottom: calc(50px * var(--k, 1));
			width: calc(140px * var(--k, 1));
			rotate: -12deg;
		}
		.sealkit {
			right: calc(12px * var(--k, 1));
			bottom: calc(46px * var(--k, 1));
			width: calc(70px * var(--k, 1));
		}
	}
	.pile {
		position: relative;
		display: grid;
		place-items: center;
		width: calc(190px * var(--k, 1));
		height: calc(130px * var(--k, 1));
		margin-top: calc(-8px * var(--k, 1));
		transform: perspective(700px) rotateX(18deg);
	}
	.layer {
		position: absolute;
		width: calc(176px * var(--k, 1));
		height: calc(109px * var(--k, 1));
		border-radius: 4px;
		transform: translate(calc(var(--x) * var(--k, 1)), calc(var(--y) * var(--k, 1))) rotate(var(--r));
		box-shadow: 0 2px 5px rgb(30 10 0 / 0.35);
	}
	.layer.paper {
		width: calc(150px * var(--k, 1));
		height: calc(118px * var(--k, 1));
		background:
			repeating-linear-gradient(180deg, transparent 0 calc(11px * var(--k, 1)), rgb(90 70 50 / 0.14) calc(11px * var(--k, 1)) calc(12px * var(--k, 1))) 0 calc(14px * var(--k, 1)) / 100% 100% no-repeat,
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
	/* 이름표 — 오른쪽은 편지 쓰기 단추 자리(--fab-w)만큼 비운다 */
	.desk-area {
		--fab-w: 128px;
		--side: calc(var(--pad) + var(--bleed));
	}
	.plate {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: -26px calc(var(--side) + var(--fab-w) + 10px) 0 var(--side);
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

	/* 편지 쓰기 — 이름표와 한 줄 · 같은 높이 (Phase 71). 테마 색 (설정 > 테마 색상과 같이 바뀐다) */
	.fab {
		position: absolute;
		right: var(--side);
		bottom: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: var(--fab-w);
		height: var(--plate-h, 64px);
		border-radius: var(--r-card);
		background: var(--accent-fill-deep);
		color: var(--on-accent);
		font-size: 15px;
		font-weight: 800;
		text-decoration: none;
		box-shadow: var(--glow);
		transition: transform 0.2s cubic-bezier(0.3, 0.7, 0.3, 1.4);
	}
	.fab:active {
		transform: scale(0.95);
	}
	.fab span {
		white-space: nowrap;
	}
	.fab svg {
		flex: none;
		width: 22px;
		height: 22px;
	}
	/* 좁은 화면(큰 글꼴 안드로이드 ≈ 280) — 연필만 있는 네모 단추, 이름표에 자리를 더 준다 */
	@media (max-width: 359px) {
		.desk-area {
			--fab-w: 60px;
		}
		.fab span {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
	}
</style>
