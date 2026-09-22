<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '$lib/Avatar.svelte';
	import {
		blockLetterAuthor,
		deleteMyComment,
		deleteMyLetter,
		fetchLetter,
		postComment,
		reportLetter,
		threadComments
	} from '$lib/letters/api';
	import type { CommentRow, LetterDetail, ReportReason } from '$lib/letters/types';
	import { REPORT_REASONS } from '$lib/reportReasons';
	import { S, errMsg, toast } from '$lib/state.svelte';
	import { ago, waitText } from '$lib/time';

	/**
	 * 편지 한 통 — 본문 + 댓글(최상위) + 대댓글(한 단계).
	 * 지정 답장자로 배정된 사람의 첫 최상위 댓글이 "답장"으로 표시된다.
	 * 이름은 이 편지 안에서만 쓰는 임시 이름 — 다른 편지에서는 같은 사람도 다른 이름이다.
	 */
	const id = $derived(Number(page.params.id));

	let data = $state<LetterDetail | null>(null);
	let loading = $state(true);
	let skew = 0;

	async function load() {
		try {
			const d = await fetchLetter(id);
			skew = Date.parse(d.server_now) - Date.now();
			data = d;
		} catch {
			if (!data) toast('편지를 불러오지 못함');
		} finally {
			loading = false;
		}
	}

	// 열어 둔 동안 30초마다 새 댓글 확인 (편지는 실시간이 아니어도 된다)
	$effect(() => {
		void id;
		loading = true;
		data = null;
		void load();
		const t = setInterval(() => {
			if (document.visibilityState === 'visible') void load();
		}, 30_000);
		const onVis = () => document.visibilityState === 'visible' && void load();
		document.addEventListener('visibilitychange', onVis);
		return () => {
			clearInterval(t);
			document.removeEventListener('visibilitychange', onVis);
		};
	});

	const letter = $derived(data?.letter ?? null);
	const threads = $derived(threadComments(data?.comments ?? []));
	const serverNow = $derived(S.now + skew);
	const myTurn = $derived(!!letter?.assigned_to_me && letter.reply_status === 'assigned');
	const hoursLeft = $derived(
		letter?.task_expires_at ? Math.max(0, Math.ceil((Date.parse(letter.task_expires_at) - serverNow) / 3_600_000)) : 0
	);

	// ── 작성 ──
	let draft = $state('');
	let replyTo = $state<CommentRow | null>(null);
	let sending = $state(false);
	let input: HTMLTextAreaElement | undefined = $state();
	const max = $derived(S.settings?.comment_max_len ?? 300);

	function startReply(c: CommentRow) {
		replyTo = c;
		input?.focus();
	}

	async function submit() {
		const body = draft.trim();
		if (!body || sending || !letter) return;
		if (body.length > max) return toast(`${max}자까지 쓸 수 있어요`);
		sending = true;
		try {
			const r = await postComment(letter.id, replyTo?.id ?? null, body, crypto.randomUUID());
			if (r.status === 'ok' || r.status === 'duplicate') {
				if (r.status === 'ok' && r.designated) toast('답장 완료');
				draft = '';
				replyTo = null;
				await load();
			} else if (r.status === 'rate_limited') toast(`너무 빨리 쓰고 있어요 · ${waitText(r.retry_after_ms)}`);
			else if (r.status === 'max_depth_exceeded') toast('답글에는 답글을 달 수 없어요');
			else if (r.status === 'parent_missing') {
				toast('지워진 댓글이라 답글을 달 수 없어요');
				replyTo = null;
			} else if (r.status === 'closed') toast('볼 수 없는 편지');
			else toast('지금은 댓글을 쓸 수 없어요');
		} catch (e) {
			toast(errMsg(e));
		} finally {
			sending = false;
		}
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			void submit();
		}
	}
	$effect(() => {
		void draft;
		if (!input) return;
		input.style.height = 'auto';
		input.style.height = Math.min(input.scrollHeight, 120) + 'px';
	});

	// ── 메뉴 · 신고 · 차단 · 삭제 ──
	type Target = { commentId: number | null; mine: boolean; alias: string };
	let sheet = $state<null | 'menu' | 'report' | 'block' | 'delete'>(null);
	let target = $state<Target | null>(null);
	let reason = $state<ReportReason | null>(null);
	let note = $state('');
	let acting = $state(false);

	function openMenu(t: Target) {
		target = t;
		reason = null;
		note = '';
		sheet = 'menu';
	}

	async function doReport() {
		if (!letter || !target || !reason || acting) return;
		acting = true;
		try {
			const r = await reportLetter(letter.id, target.commentId, reason, note.trim());
			toast(r.status === 'already' ? '이미 신고한 글' : '신고 접수 · 운영진이 확인할게요');
			sheet = null;
			if (target.commentId == null) void goto('/letters', { replaceState: true });
			else await load();
		} catch (e) {
			toast(errMsg(e));
		} finally {
			acting = false;
		}
	}

	async function doBlock() {
		if (!letter || !target || acting) return;
		acting = true;
		try {
			await blockLetterAuthor(letter.id, target.commentId);
			toast('차단 완료 · 이 사람의 글은 더 보이지 않아요');
			sheet = null;
			if (target.commentId == null) void goto('/letters', { replaceState: true });
			else await load();
		} catch (e) {
			toast(errMsg(e));
		} finally {
			acting = false;
		}
	}

	async function doDelete() {
		if (!letter || !target || acting) return;
		acting = true;
		try {
			if (target.commentId == null) {
				await deleteMyLetter(letter.id);
				toast('편지 삭제됨');
				void goto('/letters', { replaceState: true });
			} else {
				await deleteMyComment(target.commentId);
				toast('댓글 삭제됨');
				await load();
			}
			sheet = null;
		} catch (e) {
			toast(errMsg(e));
		} finally {
			acting = false;
		}
	}

	function hiddenText(c: CommentRow) {
		return c.hidden === 'removed' ? '삭제된 댓글' : '볼 수 없는 댓글';
	}
</script>

{#snippet dotsIcon()}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="5" cy="12" r="1.6" fill="currentColor" />
		<circle cx="12" cy="12" r="1.6" fill="currentColor" />
		<circle cx="19" cy="12" r="1.6" fill="currentColor" />
	</svg>
{/snippet}

{#snippet comment(c: CommentRow, reply: boolean)}
	<div class="c" class:reply class:designated={c.is_designated}>
		{#if c.hidden}
			<div class="c-hidden muted">{hiddenText(c)}</div>
		{:else}
			<Avatar name={c.author_alias ?? '?'} size={reply ? 24 : 30} />
			<div class="c-main">
				<div class="c-head">
					<span class="c-name">{c.author_alias}</span>
					{#if c.is_op}<span class="badge">작성자</span>{/if}
					{#if c.is_designated}<span class="badge accent">답장</span>{/if}
					{#if c.is_mine}<span class="badge">나</span>{/if}
				</div>
				<p class="c-body">{c.body}</p>
				<div class="c-foot muted">
					<span>{ago(c.created_at, serverNow)}</span>
					{#if !reply}<button onclick={() => startReply(c)}>답글 달기</button>{/if}
				</div>
			</div>
			<button
				class="c-more"
				aria-label="댓글 메뉴"
				onclick={() => openMenu({ commentId: c.id, mine: c.is_mine, alias: c.author_alias ?? '' })}
			>
				{@render dotsIcon()}
			</button>
		{/if}
	</div>
{/snippet}

<div class="detail">
	<div class="topbar">
		<button class="back" onclick={() => (history.length > 1 ? history.back() : goto('/letters'))} aria-label="뒤로">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>
		<span class="title">편지</span>
		{#if letter}
			<button
				class="more"
				aria-label="편지 메뉴"
				onclick={() => openMenu({ commentId: null, mine: letter.is_mine, alias: letter.author_alias })}
			>
				{@render dotsIcon()}
			</button>
		{/if}
	</div>

	<div class="scroll">
		{#if loading && !data}
			<p class="state muted">불러오는 중…</p>
		{:else if !letter}
			<div class="state">
				<p>볼 수 없는 편지</p>
				<p class="muted small">지워졌거나 차단 관계인 사람의 편지</p>
				<button class="btn-ghost" onclick={() => goto('/letters', { replaceState: true })}>피드로</button>
			</div>
		{:else}
			<article class="letter">
				<div class="who">
					<Avatar name={letter.author_alias} size={36} />
					<div class="names">
						<span class="alias">{letter.author_alias}</span>
						<span class="muted small">{ago(letter.created_at, serverNow)}{letter.is_mine ? ' · 내 편지' : ''}</span>
					</div>
				</div>
				<p class="body">{letter.body}</p>
				<div class="status muted">
					{#if letter.reply_status === 'replied'}
						답장 도착 · 댓글 {data?.comments.filter((c) => !c.hidden).length ?? 0}
					{:else if myTurn}
						<span class="accent">내가 답장할 차례</span>
					{:else if letter.reply_status === 'assigned'}
						누군가 답장을 쓰는 중
					{:else}
						답장해 줄 사람을 기다리는 중
					{/if}
				</div>
			</article>

			{#if myTurn}
				<div class="turn">
					<strong>이 편지의 답장자로 배정됨</strong>
					<span>{hoursLeft}시간 안에 아래에 답장을 남겨 주세요. 첫 댓글이 답장으로 표시돼요.</span>
				</div>
			{/if}

			<section class="comments">
				{#if !threads.length}
					<p class="none muted">아직 댓글이 없어요</p>
				{/if}
				{#each threads as t (t.id)}
					{@render comment(t, false)}
					{#each t.replies as r (r.id)}
						{@render comment(r, true)}
					{/each}
				{/each}
			</section>
		{/if}
	</div>

	{#if letter}
		<div class="composer">
			{#if replyTo}
				<div class="replying muted">
					<span><strong>{replyTo.author_alias}</strong> 님에게 답글</span>
					<button onclick={() => (replyTo = null)} aria-label="답글 취소">취소</button>
				</div>
			{/if}
			<div class="pill">
				<textarea
					bind:this={input}
					bind:value={draft}
					rows="1"
					maxlength={max}
					placeholder={replyTo ? '답글 달기…' : myTurn ? '답장 쓰기…' : '댓글 달기…'}
					onkeydown={onKey}
				></textarea>
				<button class="send" onclick={submit} disabled={!draft.trim() || sending}>게시</button>
			</div>
			<p class="as muted">
				{data?.my_alias ? `이 편지에서 내 이름: ${data.my_alias}` : '댓글을 달면 이 편지에서만 쓰는 새 이름이 붙어요'}
			</p>
		</div>
	{/if}
</div>

{#if sheet && target}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="scrim" onclick={() => (sheet = null)}>
		<div class="sheet" onclick={(e) => e.stopPropagation()}>
			{#if sheet === 'menu'}
				{#if target.mine}
					<button class="item danger" onclick={() => (sheet = 'delete')}>
						{target.commentId == null ? '편지 삭제' : '댓글 삭제'}
					</button>
				{:else}
					<button class="item danger" onclick={() => (sheet = 'report')}>신고하기</button>
					<button class="item danger" onclick={() => (sheet = 'block')}>차단하기</button>
				{/if}
				<button class="item" onclick={() => (sheet = null)}>취소</button>
			{:else if sheet === 'delete'}
				<p class="warn">
					{target.commentId == null
						? '편지와 거기 달린 댓글이 모두 보이지 않게 돼요.'
						: '이 댓글이 보이지 않게 돼요. 달린 답글은 그대로 남아요.'}
				</p>
				<button class="item danger" onclick={doDelete} disabled={acting}>삭제</button>
				<button class="item" onclick={() => (sheet = null)}>취소</button>
			{:else if sheet === 'block'}
				<p class="warn">
					차단하면 이 사람의 편지·댓글이 더 보이지 않고, <strong>채팅에서도 다시 연결되지 않아요.</strong><br />
					상대에게는 알려지지 않아요.
				</p>
				<button class="item danger" onclick={doBlock} disabled={acting}>차단하기</button>
				<button class="item" onclick={() => (sheet = null)}>취소</button>
			{:else if sheet === 'report'}
				<div class="report">
					<h3>무엇이 문제인가요?</h3>
					<p class="warn left">신고하면 자동으로 차단돼요. 내용은 운영진만 확인하고, 상대는 누가 신고했는지 알 수 없어요.</p>
					<div class="reasons">
						{#each REPORT_REASONS as r (r.v)}
							<button class="reason" class:on={reason === r.v} onclick={() => (reason = r.v)}>{r.label}</button>
						{/each}
					</div>
					<textarea class="note" bind:value={note} rows="2" maxlength="1000" placeholder="운영진에게 더 알려줄 내용 (선택)"></textarea>
				</div>
				<button class="item danger" onclick={doReport} disabled={!reason || acting}>
					{acting ? '신고하는 중…' : '신고하기'}
				</button>
				<button class="item" onclick={() => (sheet = null)}>취소</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.detail {
		display: flex;
		flex-direction: column;
		height: 100dvh;
	}
	.back,
	.more {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
	}
	.back {
		margin-left: -4px;
	}
	.back svg {
		width: 24px;
		height: 24px;
	}
	.more {
		margin-left: auto;
	}
	.more svg {
		width: 22px;
		height: 22px;
	}

	.scroll {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		margin: 48px var(--pad);
		text-align: center;
	}
	.state p {
		margin: 0;
	}
	.small {
		font-size: 12px;
	}

	.letter {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px var(--pad);
		border-bottom: 1px solid var(--line);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.names {
		display: flex;
		flex-direction: column;
		line-height: 1.3;
	}
	.alias {
		font-weight: 700;
		font-size: 15px;
	}
	.body {
		margin: 0;
		font-size: 16px;
		line-height: 1.75;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.status {
		font-size: 12px;
	}
	.accent {
		color: var(--accent);
		font-weight: 600;
	}

	.turn {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 12px var(--pad) 0;
		padding: 12px 14px;
		border-radius: var(--r-sm);
		background: var(--accent-fill);
		color: var(--on-accent);
		font-size: 14px;
	}
	.turn span {
		font-size: 12px;
		opacity: 0.92;
	}

	.comments {
		padding: 8px 0 16px;
	}
	.none {
		margin: 24px var(--pad);
		text-align: center;
		font-size: 13px;
	}
	.c {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px var(--pad);
	}
	.c.reply {
		padding-left: calc(var(--pad) + 40px);
	}
	.c.designated {
		background: var(--surface);
	}
	.c-hidden {
		font-size: 13px;
		padding: 4px 0;
	}
	.c-main {
		flex: 1;
		min-width: 0;
	}
	.c-head {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.c-name {
		font-size: 13px;
		font-weight: 700;
	}
	.badge {
		padding: 0 6px;
		border-radius: 999px;
		background: var(--field);
		font-size: 10px;
		font-weight: 700;
		line-height: 16px;
	}
	.badge.accent {
		background: var(--accent-fill);
		color: var(--on-accent);
	}
	.c-body {
		margin: 2px 0 0;
		font-size: 14px;
		line-height: 1.55;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.c-foot {
		display: flex;
		gap: 12px;
		margin-top: 4px;
		font-size: 12px;
	}
	.c-foot button {
		font-weight: 600;
		color: var(--text-2);
	}
	.c-more {
		flex: none;
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		color: var(--text-2);
	}
	.c-more svg {
		width: 16px;
		height: 16px;
	}

	/* 입력창 — 대화방과 같은 pill */
	.composer {
		padding: 8px var(--pad) calc(8px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--line);
		background: var(--bg);
	}
	.replying {
		display: flex;
		justify-content: space-between;
		margin-bottom: 6px;
		font-size: 12px;
	}
	.replying strong {
		color: var(--text);
	}
	.replying button {
		font-weight: 600;
		color: var(--text-2);
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
	}
	.pill textarea::placeholder {
		color: var(--text-2);
	}
	.send {
		flex: none;
		padding: 6px 6px 7px;
		color: var(--accent);
		font-weight: 600;
	}
	.send:disabled {
		color: var(--text-2);
		opacity: 0.6;
	}
	.as {
		margin: 4px 4px 0;
		font-size: 11px;
	}

	/* 하단 시트 — 대화방과 같은 모양 */
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		background: rgb(0 0 0 / 0.45);
	}
	.sheet {
		width: 100%;
		max-width: 520px;
		padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
		border-radius: 12px 12px 0 0;
		background: var(--bg);
	}
	.item {
		display: block;
		width: 100%;
		height: 50px;
		font-size: 15px;
		border-top: 1px solid var(--line);
	}
	.item:first-child {
		border-top: 0;
	}
	.item.danger {
		color: var(--danger);
		font-weight: 600;
	}
	.item:disabled {
		opacity: 0.5;
	}
	.warn {
		margin: 12px var(--pad) 14px;
		font-size: 14px;
		line-height: 1.6;
		text-align: center;
		color: var(--text-2);
	}
	.warn.left {
		text-align: left;
		margin: 0 0 12px;
	}
	.warn strong {
		color: var(--text);
	}
	.report {
		padding: 8px var(--pad) 12px;
	}
	.report h3 {
		margin: 4px 0 8px;
		font-size: 16px;
		font-weight: 700;
	}
	.reasons {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 10px;
	}
	.reason {
		height: 34px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 13px;
	}
	.reason.on {
		border-color: var(--text);
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
	}
	.note {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		background: var(--surface);
		outline: none;
		resize: none;
		font-size: 14px;
	}
</style>
