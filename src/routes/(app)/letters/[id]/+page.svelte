<script lang="ts">
	/**
	 * 편지 한 줄기 — 보낸 사람과 받는 사람이 주고받는다 (채팅처럼 말풍선).
	 * 받은 편지: 상대 = "익명 · ○○ ○○" (누군지 알 수 없다) / 보낸 편지: 상대 = 이름 · 학년.
	 * 메뉴: 그만 주고받기 · 차단 · 신고. 받는 사람이 끝내면 그 사람은 다시 편지를 보낼 수 없다.
	 * 화면이 보이는 동안 15초마다 새 말을 확인한다 (새 말 알림은 푸시로).
	 */
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { goBack } from '$lib/nav';
	import BackButton from '$lib/ui/BackButton.svelte';
	import ReportPicker from '$lib/ui/ReportPicker.svelte';
	import RichText from '$lib/letters/RichText.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import type { ReportReason } from '$lib/chat/types';
	import { S, errMsg, toast } from '$lib/state.svelte';
	import { agoText } from '$lib/time';
	import { whileVisible } from '$lib/visible';
	import { scrollBehavior } from '$lib/motion';
	import { blockThread, closeThread, fetchThread, replyLetter, reportThread, sendError, type DmThread } from '$lib/letters/api';
	import { refreshUnread } from '$lib/letters/unread.svelte';

	const id = $derived(Number(page.params.id));
	let t = $state<DmThread | null>(null);
	let gone = $state(false);
	let skew = $state(0);
	let listEl: HTMLDivElement | undefined = $state();

	async function load(scroll = false) {
		try {
			const r = await fetchThread(id);
			if (r.status !== 'ok') {
				gone = true;
				return;
			}
			const grew = !t || r.messages.length !== t.messages.length;
			t = r;
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
	const heading = $derived(t ? (t.role === 'received' ? `익명 · ${t.title}` : t.title) : '');
	const endedText = $derived.by(() => {
		if (!t || open) return '';
		if (t.closed_by === 'staff') return '운영진이 내린 편지예요';
		const me = t.role === 'sent' ? 'sender' : 'recipient';
		return t.closed_by === me ? '내가 끝낸 편지예요' : '상대가 편지를 끝냈어요';
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

	// ── 메뉴 ──
	let sheet = $state<null | 'menu' | 'close' | 'block' | 'report'>(null);
	let reason = $state<ReportReason | null>(null);
	let note = $state('');
	let acting = $state(false);
	async function act(fn: () => Promise<unknown>, done: string, leave = false) {
		if (acting || !t) return;
		acting = true;
		try {
			await fn();
			toast(done);
			sheet = null;
			if (leave) goBack('/letters');
			else await load();
		} catch (e) {
			toast(errMsg(e));
		} finally {
			acting = false;
		}
	}
</script>

<div class="detail">
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
			<button class="more" onclick={() => (sheet = 'menu')} aria-label="메뉴">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="5" cy="12" r="1.6" fill="currentColor" />
					<circle cx="12" cy="12" r="1.6" fill="currentColor" />
					<circle cx="19" cy="12" r="1.6" fill="currentColor" />
				</svg>
			</button>
		{/if}
	</header>

	<div class="list" bind:this={listEl} role="region" aria-label="편지 내용">
		{#if gone}
			<p class="empty muted">편지를 찾을 수 없어요.</p>
		{:else if !t}
			<p class="empty muted">불러오는 중…</p>
		{:else}
			<p class="intro muted">
				{t.role === 'received'
					? '이 편지를 보낸 사람은 익명이에요. 불편하면 언제든 끝내거나 신고할 수 있어요.'
					: `${t.title}님에게는 내 이름 대신 익명 이름이 보여요.`}
			</p>
			{#each t.messages as m (m.id)}
				<div class="row" class:mine={m.mine}>
					<div class="bubble selectable" class:removed={m.removed}>
						<span class="sr-only">{m.mine ? '나' : heading}: </span>{#if m.removed}운영진이 내린 말이에요{:else if m.fmt}<RichText
								body={m.body ?? ''}
								fmt={m.fmt}
							/>{:else}{m.body}{/if}
					</div>
				</div>
				<div class="when num" class:mine={m.mine}>{agoText(m.created_at, S.now + skew)}</div>
			{/each}
			{#if !open}<p class="ended">{endedText}</p>{/if}
		{/if}
	</div>

	{#if t && open}
		<div class="composer">
			{#if t.wait_reply}
				<p class="wait muted">상대가 답하기 전에는 3개까지 보낼 수 있어요</p>
			{:else}
				<div class="pill">
					<textarea bind:value={draft} rows="1" maxlength="1100" placeholder="답장 쓰기…" onkeydown={onKey} aria-label="답장"></textarea>
					<button class="send" onclick={send} disabled={!draft.trim() || sending}>보내기</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if sheet && t}
	<Sheet onclose={() => (sheet = null)}>
		{#if sheet === 'menu'}
			{#if open}<button class="item" onclick={() => (sheet = 'close')}>그만 주고받기</button>{/if}
			<button class="item danger" onclick={() => (sheet = 'block')}>차단하기</button>
			<button class="item danger" onclick={() => (sheet = 'report')}>신고하기</button>
			<button class="item" onclick={() => (sheet = null)}>취소</button>
		{:else if sheet === 'close'}
			<p class="warn">
				더 이상 주고받지 않아요.
				{#if t.role === 'received'}<strong>이 사람은 나에게 다시 편지를 보낼 수 없어요.</strong>{/if}
			</p>
			<button class="item danger" onclick={() => act(() => closeThread(t!.id), '편지를 끝냈어요')} disabled={acting}>끝내기</button>
			<button class="item" onclick={() => (sheet = null)}>취소</button>
		{:else if sheet === 'block'}
			<p class="warn">
				차단하면 서로 검색 · 편지가 안 되고, <strong>채팅에서도 다시 연결되지 않아요.</strong><br />상대에게는 알려지지 않아요.
			</p>
			<button class="item danger" onclick={() => act(() => blockThread(t!.id), '차단했어요', true)} disabled={acting}>차단하기</button>
			<button class="item" onclick={() => (sheet = null)}>취소</button>
		{:else if sheet === 'report'}
			<ReportPicker
				bind:reason
				bind:note
				title="무엇이 문제인가요?"
				intro="신고하면 자동으로 차단되고 편지가 끝나요. 운영진은 누가 보냈는지 확인해서 조치할 수 있어요. 상대는 누가 신고했는지 알 수 없어요."
			/>
			<button
				class="item danger"
				onclick={() =>
					act(async () => {
						const r = await reportThread(t!.id, reason!, note.trim());
						if (r.status === 'already') throw new Error('이미 신고한 편지예요');
					}, '신고했어요', true)}
				disabled={!reason || acting}
			>
				{acting ? '신고하는 중…' : '신고하기'}
			</button>
			<button class="item" onclick={() => (sheet = null)}>취소</button>
		{/if}
	</Sheet>
{/if}

<style>
	.detail {
		display: flex;
		flex-direction: column;
		height: 100dvh;
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
		margin-top: 8px;
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
		margin: 3px 6px 0;
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
