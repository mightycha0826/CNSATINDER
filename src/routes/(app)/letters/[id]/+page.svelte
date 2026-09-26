<script lang="ts">
	/**
	 * 편지 한 줄기 — 보낸 사람과 받는 사람이 주고받는다 (Phase 27).
	 *  · 편지는 편지지(LetterPaper: To. · 내용 · From.)로, 채팅 한 줄은 말풍선으로 그린다.
	 *  · 편지 모드: 편지를 받은 사람이 아래에서 "편지로 답장하기"(→ /letters/[id]/write) 또는 "채팅하기"를 고른다.
	 *    내가 마지막에 보냈으면 "답장을 기다리는 중" (+ 한 통 더 쓰기). 채팅 모드: 입력창.
	 * 받은 편지: 상대 = 가명 "○○ ○○" (누군지 알 수 없다) / 보낸 편지: 상대 = 이름 · 학년.
	 * 메뉴(LetterMenu): 신고 · 차단 · 나가기 — 하고 나면 내 목록에서 사라진다. 받는 사람이 나가면 그 사람은 다시 편지를 보낼 수 없다.
	 * 화면이 보이는 동안 15초마다 새 말을 확인한다 (새 말 알림은 푸시로).
	 * 키보드가 올라오면 화면을 보이는 영역(visualViewport)에 맞추고 최근 말이 그대로 보이게 한다 (채팅 화면과 같은 방식).
	 */
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { goBack } from '$lib/nav';
	import BackButton from '$lib/ui/BackButton.svelte';
	import { goto } from '$app/navigation';
	import LetterPaper from '$lib/letters/LetterPaper.svelte';
	import LetterMenu from '$lib/letters/LetterMenu.svelte';
	import { S, errMsg, toast } from '$lib/state.svelte';
	import { agoText } from '$lib/time';
	import { whileVisible } from '$lib/visible';
	import { scrollBehavior } from '$lib/motion';
	import { fetchThread, paperNames, replyLetter, sendError, startChat, type DmThread } from '$lib/letters/api';
	import { LIST, refreshUnread } from '$lib/letters/unread.svelte';

	const id = $derived(Number(page.params.id));
	let t = $state<DmThread | null>(null);
	let gone = $state(false);
	let skew = $state(0);
	let listEl: HTMLDivElement | undefined = $state();

	// ── 키보드 (모바일) — ChatView 와 같다 ──
	// 키보드가 올라와도 페이지째 밀려 올라가지 않게, 실제로 보이는 영역에 화면을 딱 맞춘다
	let vvH = $state<number | null>(null);
	let vvTop = $state(0);
	let keyboard = $state(false);
	$effect(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const sync = () => {
			vvH = vv.height;
			vvTop = vv.offsetTop;
			keyboard = window.innerHeight - vv.height > 120;
		};
		sync();
		vv.addEventListener('resize', sync);
		vv.addEventListener('scroll', sync);
		return () => {
			vv.removeEventListener('resize', sync);
			vv.removeEventListener('scroll', sync);
		};
	});
	/** 맨 아래에서 얼마나 떨어져 있는지 — 목록 높이가 바뀌어도(키보드) 보던 자리를 지킨다 */
	let fromBottom = 0;
	function onScroll() {
		if (listEl) fromBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
	}
	$effect(() => {
		if (!listEl) return;
		const el = listEl;
		const ro = new ResizeObserver(() => {
			el.scrollTop = el.scrollHeight - el.clientHeight - (fromBottom < 48 ? 0 : fromBottom);
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	async function load(scroll = false) {
		try {
			const r = await fetchThread(id);
			if (r.status !== 'ok') {
				gone = true;
				return;
			}
			const grew = !t || r.messages.length !== t.messages.length;
			t = r;
			LIST.tab = r.role; // 뒤로 가면 이 편지 쪽(보낸/받은) 목록으로
			skew = Date.parse(r.server_now) - Date.now();
			void refreshUnread(); // 열면 읽음 — 탭의 빨간 점도 맞춘다
			if (scroll || grew) {
				await tick();
				listEl?.scrollTo({ top: listEl.scrollHeight, behavior: scroll ? 'auto' : scrollBehavior() });
			}
		} catch (e) {
			toast(errMsg(e));
		}
	}
	$effect(() => {
		void id;
		t = null;
		gone = false;
		void load(true);
		return whileVisible(() => void load(), 15_000);
	});

	const open = $derived(t?.thread_status === 'open');
	// Phase 27 전 DB 는 mode 가 없다 → 예전처럼 채팅
	const chatMode = $derived((t?.mode ?? 'chat') === 'chat');
	const heading = $derived(t?.title ?? '');
	// 말마다 시간을 달지 않고 가장 최근 말 아래 한 줄만 — 내 말이고 상대가 읽었으면 "읽음 · 3분 전"
	const last = $derived(t?.messages.at(-1));
	const lastSeen = $derived(!!last?.mine && (t?.their_read ?? 0) >= last.id);
	const endedText = $derived.by(() => {
		if (!t || open) return '';
		if (t.closed_by === 'staff') return '운영진이 내린 편지예요';
		const me = t.role === 'sent' ? 'sender' : 'recipient';
		return t.closed_by === me ? '내가 끝낸 편지예요' : '상대가 편지에서 나갔어요';
	});

	// ── 쓰기 ──
	let draft = $state('');
	let sending = $state(false);
	async function send() {
		const body = draft.trim();
		if (!body || sending || !t) return;
		if (body.length > 1000) return toast('1000자까지 보낼 수 있어요');
		sending = true;
		try {
			const r = await replyLetter(t.id, body);
			const err = sendError(r);
			if (err) toast(err);
			else draft = '';
			await load(true);
		} catch (e) {
			toast(errMsg(e));
		} finally {
			sending = false;
		}
	}
	function onKey(e: KeyboardEvent) {
		// 편지는 여러 줄로 쓰는 일이 많아서 Enter 는 줄바꿈 — 보내기는 버튼으로
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void send();
		}
	}

	// ── 편지 모드: 편지로 답장 / 채팅하기 ──
	const myTurn = $derived(!!last && !last.mine);
	let switching = $state(false);
	let textEl: HTMLTextAreaElement | undefined = $state();
	async function chat() {
		if (!t || switching) return;
		switching = true;
		try {
			const r = await startChat(t.id);
			if (r.status !== 'ok') toast(r.status === 'closed' ? '끝난 편지예요' : '지금은 채팅으로 바꿀 수 없어요');
			await load(true);
			await tick();
			textEl?.focus();
		} catch (e) {
			toast(errMsg(e));
		} finally {
			switching = false;
		}
	}

	// ── 메뉴 ── 신고 · 차단 · 나가기 (LetterMenu). 하고 나면 이 편지는 내 목록에서 사라지므로 목록으로 돌아간다
	let menu = $state(false);
</script>

<div class="detail" class:keyboard style:height={vvH ? `${vvH}px` : null} style:--vv-top={`${vvTop}px`}>
	<header class="topbar">
		<BackButton href="/letters" history />
		{#if t}
			<span class="who">
				{#if t.role === 'received'}<span class="anon" aria-hidden="true">?</span>{/if}
				<span class="names">
					<b>{heading}</b>
					<small class="muted">{t.role === 'received' ? '누가 보냈는지 알 수 없어요' : t.grade ? `${t.grade}학년 · 나는 익명` : '나는 익명'}</small>
				</span>
			</span>
			<button class="more" onclick={() => (menu = true)} aria-label="메뉴">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="5" cy="12" r="1.6" fill="currentColor" />
					<circle cx="12" cy="12" r="1.6" fill="currentColor" />
					<circle cx="19" cy="12" r="1.6" fill="currentColor" />
				</svg>
			</button>
		{/if}
	</header>

	<div class="list" bind:this={listEl} onscroll={onScroll} role="region" aria-label="편지 내용">
		{#if gone}
			<p class="empty muted">편지를 찾을 수 없어요.</p>
		{:else if !t}
			<p class="empty muted">불러오는 중…</p>
		{:else}
			<p class="intro muted">
				{t.role === 'received'
					? '이 편지를 보낸 사람은 익명이에요. 불편하면 언제든 나가거나 신고할 수 있어요.'
					: `${t.title}님에게는 내 이름 대신 가명이 보여요.`}
			</p>
			{#each t.messages as m, i (m.id)}
				{@const turn = i > 0 && t.messages[i - 1].mine !== m.mine}
				{#if m.letter}
					{@const n = paperNames(t, m)}
					<div class="paper-row" class:turn={i > 0}>
						<LetterPaper to={n.to} from={n.from} body={m.body} fmt={m.fmt} removed={m.removed} mine={m.mine} />
					</div>
				{:else}
					<!-- 말하는 쪽이 바뀔 때만 크게 띄운다 (같은 쪽 연달아는 붙여서) -->
					<div class="row" class:mine={m.mine} class:turn={turn || (i > 0 && !!t.messages[i - 1].letter)}>
						<div class="bubble selectable" class:removed={m.removed}>
							<span class="sr-only">{m.mine ? '나' : heading}: </span>{m.removed ? '운영진이 내린 말이에요' : m.body}
						</div>
					</div>
				{/if}
			{/each}
			{#if last}
				<div class="when num" class:mine={last.mine}>{lastSeen ? '읽음 · ' : ''}{agoText(last.created_at, S.now + skew)}</div>
			{/if}
			{#if !open}<p class="ended">{endedText}</p>{/if}
		{/if}
	</div>

	{#if t && open && !chatMode}
		<!-- 편지 모드 — 받은 사람이 고른다: 편지로 답장 / 채팅으로 -->
		<div class="choose">
			{#if myTurn}
				<p class="muted hint">편지로 답장하거나, 채팅으로 이어갈 수 있어요</p>
				<div class="btns">
					<button class="btn" onclick={() => goto(`/letters/${t!.id}/write`)}>편지로 답장하기</button>
					<button class="btn ghost" onclick={chat} disabled={switching}>채팅하기</button>
				</div>
			{:else}
				<p class="muted hint">답장을 기다리고 있어요 · 상대가 편지로 답하거나 채팅을 열 수 있어요</p>
				{#if !t.wait_reply}
					<button class="more-letter" onclick={() => goto(`/letters/${t!.id}/write`)}>한 통 더 쓰기</button>
				{/if}
			{/if}
		</div>
	{:else if t && open}
		<div class="composer">
			{#if t.wait_reply}
				<p class="wait muted">상대가 답하기 전에는 3개까지 보낼 수 있어요</p>
			{:else}
				<div class="pill">
					<textarea bind:this={textEl} bind:value={draft} rows="1" maxlength="1100" placeholder="메시지 쓰기…" onkeydown={onKey} aria-label="메시지"></textarea>
					<button class="send" onclick={send} disabled={!draft.trim() || sending}>보내기</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if menu && t}
	<LetterMenu
		thread={t}
		onclose={() => (menu = false)}
		ondone={() => {
			menu = false;
			void refreshUnread();
			goBack('/letters');
		}}
	/>
{/if}

<style>
	.detail {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		/* 보이는 영역에 고정 — 키보드가 올라와도 페이지째 밀려 올라가지 않는다 */
		position: fixed;
		top: 0;
		left: 50%;
		width: 100%;
		max-width: 520px;
		transform: translate(-50%, var(--vv-top, 0px));
		background: var(--bg);
		overflow: hidden;
	}
	/* 키보드가 떠 있을 때는 홈 인디케이터 여백이 필요 없다 */
	.detail.keyboard .composer {
		padding-bottom: 8px;
	}
	.paper-row.turn {
		margin-top: 14px;
	}
	/* 편지 모드 아래 — 편지로 답장 / 채팅하기 */
	.choose {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 12px var(--pad) calc(12px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--line);
		background: var(--bg);
	}
	.choose .hint {
		margin: 0;
		font-size: 13px;
		text-align: center;
	}
	.btns {
		display: flex;
		gap: 8px;
		width: 100%;
	}
	.btns .btn {
		flex: 1;
	}
	.btn.ghost {
		background: var(--field);
		color: var(--text);
	}
	.more-letter {
		padding: 6px 10px;
		color: var(--accent);
		font-size: 14px;
		font-weight: 600;
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.anon {
		flex: none;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bubble-fill);
		color: #fff;
		font-weight: 800;
	}
	.names {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.2;
	}
	.names b {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 15px;
		font-weight: 600;
	}
	.names small {
		font-size: 12px;
	}
	.more {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
	}
	.more svg {
		width: 22px;
		height: 22px;
	}

	.list {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 12px var(--pad) 8px;
		display: flex;
		flex-direction: column;
	}
	.empty {
		margin: auto;
		font-size: 14px;
	}
	.intro {
		align-self: center;
		max-width: 300px;
		margin: 4px 0 16px;
		font-size: 12px;
		line-height: 1.6;
		text-align: center;
	}
	.row {
		display: flex;
		margin-top: 4px;
	}
	.row.turn {
		margin-top: 14px;
	}
	.row.mine {
		justify-content: flex-end;
	}
	.bubble {
		max-width: 78%;
		padding: 9px 14px;
		border-radius: var(--r-bubble);
		background: var(--field);
		font-size: 15px;
		line-height: 1.45;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.mine .bubble {
		background: var(--bubble-fill);
		color: var(--on-accent);
	}
	.bubble.removed {
		font-style: italic;
		opacity: 0.6;
	}
	.when {
		margin: 4px 6px 0;
		font-size: 11px;
		color: var(--text-2);
	}
	.when.mine {
		text-align: right;
	}
	.ended {
		align-self: center;
		margin: 16px 0;
		padding: 6px 12px;
		border-radius: 999px;
		background: var(--field);
		color: var(--text-2);
		font-size: 13px;
	}

	.composer {
		padding: 8px var(--pad) calc(8px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--line);
		background: var(--bg);
	}
	.wait {
		margin: 6px 0;
		text-align: center;
		font-size: 13px;
	}
	.pill {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		min-height: 44px;
		padding: 6px 8px 6px 16px;
		border: 1px solid var(--line);
		border-radius: var(--r-bubble);
	}
	.pill textarea {
		flex: 1;
		min-width: 0;
		padding: 6px 0;
		border: 0;
		outline: none;
		resize: none;
		background: none;
		font-size: 15px;
		line-height: 1.38;
		max-height: 120px;
		field-sizing: content;
	}
	.pill textarea::placeholder {
		color: var(--text-2);
	}
	.send {
		flex: none;
		padding: 6px 6px 7px;
		color: var(--accent);
		font-weight: 600;
		font-size: 15px;
	}
	.send:disabled {
		color: var(--text-2);
		opacity: 0.6;
	}
</style>
