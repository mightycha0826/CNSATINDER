<script lang="ts">
	/**
	 * AI 대화 상대 — 매칭을 기다리는 동안 홈 위에 덮어 띄운다 (홈이 살아 있어야 찾기가 계속된다).
	 * 상대를 찾으면 홈이 대화방으로 넘어가면서 이 화면도 같이 사라진다.
	 *
	 * 사람이 아니라는 걸 늘 보이게: 머리글의 "AI" 표시 · 안내 문구 · 첫 인사.
	 * 대화 내용은 이 화면의 메모리에만 있다 (닫으면 사라지고, 서버·DB 에 남기지 않는다).
	 */
	import { tick } from 'svelte';
	import { S, errMsg, toast } from '$lib/state.svelte';
	import { mmss as fmtClock } from '$lib/time';
	import { scrollBehavior } from '$lib/motion';
	import { aiApi, GREETING, type AiApi, type Line } from './api';

	let {
		onclose,
		seeking = null,
		api = aiApi
	}: {
		onclose: () => void;
		/** 상대를 찾는 중이면 걸린 시간 (mm:ss) */
		seeking?: string | null;
		api?: AiApi;
	} = $props();

	let phase = $state<'starting' | 'ready' | 'ended' | 'unavailable'>('starting');
	let notice = $state('');
	let chat = $state<{ id: string; expiresAt: number; skew: number; maxTurns: number } | null>(null);
	let turns = $state(0);
	let lines = $state<Line[]>([{ role: 'assistant', content: GREETING }]);
	let draft = $state('');
	let sending = $state(false);
	let spoken = $state(''); // 화면 낭독기 — AI 의 새 답
	let listEl: HTMLDivElement | undefined = $state();
	let inputEl: HTMLTextAreaElement | undefined = $state();

	const RESET = '매일 오전 9시에 다시 채워져요';

	$effect(() => {
		void (async () => {
			const r = await api.start();
			if (r.status === 'ok') {
				chat = {
					id: r.id,
					expiresAt: Date.parse(r.expires_at),
					skew: Date.parse(r.server_now) - Date.now(),
					maxTurns: r.max_turns
				};
				turns = r.turns;
				phase = 'ready';
				await tick();
				inputEl?.focus();
			} else {
				phase = 'unavailable';
				notice =
					r.status === 'limit'
						? `오늘 AI 대화를 모두 썼어요 (하루 ${r.per_user}번) · ${RESET}`
						: r.status === 'full'
							? `오늘 준비된 AI 대화가 모두 끝났어요 · ${RESET}`
							: r.status === 'restricted'
								? '이용이 제한된 계정이에요'
								: '지금은 AI 대화를 쓸 수 없어요';
			}
		})();
	});

	const remainMs = $derived(chat ? Math.max(0, chat.expiresAt - (S.now + chat.skew)) : 0);
	$effect(() => {
		if (phase === 'ready' && chat && remainMs <= 0) end('AI 대화 시간이 끝났어요');
	});

	function end(msg: string) {
		phase = 'ended';
		notice = msg;
	}

	async function scrollDown() {
		await tick();
		listEl?.scrollTo({ top: listEl.scrollHeight, behavior: scrollBehavior() });
	}

	async function send() {
		const text = draft.trim();
		if (!text || sending || phase !== 'ready' || !chat) return;
		if (text.length > 500) return toast('500자까지 보낼 수 있어요');
		lines.push({ role: 'user', content: text });
		draft = '';
		sending = true;
		void scrollDown();
		const r = await api.turn(chat.id, $state.snapshot(lines));
		sending = false;
		const giveBack = () => {
			lines.pop();
			if (!draft) draft = text;
		};
		switch (r.status) {
			case 'ok':
				lines.push({ role: 'assistant', content: r.reply });
				spoken = `AI: ${r.reply}`;
				turns = r.turns;
				if (r.turns >= r.max_turns) end(`이번 AI 대화는 여기까지예요 (한 번에 ${r.max_turns}번까지)`);
				break;
			case 'blocked':
				giveBack();
				toast(errMsg(r.code));
				break;
			case 'expired':
				end('AI 대화 시간이 끝났어요');
				break;
			case 'turns':
				end('이번 AI 대화는 여기까지예요');
				break;
			case 'ai_unavailable':
				giveBack();
				toast('AI 가 지금 답할 수 없어요. 잠시 후 다시 보내 주세요');
				break;
			case 'off':
			case 'not_found':
				end('지금은 AI 대화를 쓸 수 없어요');
				break;
			default:
				giveBack();
				toast('네트워크를 확인해 주세요');
		}
		void scrollDown();
		if (phase === 'ready') inputEl?.focus();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			void send();
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="ai" role="dialog" aria-modal="true" aria-label="AI 와 대화">
	<header class="topbar">
		<button class="close" onclick={onclose} aria-label="AI 대화 닫기">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
		</button>
		<div class="who">
			<span class="avatar" aria-hidden="true">AI</span>
			<span class="names">
				<b>AI 대화 친구 <span class="tag">AI</span></b>
				<small class="muted">
					사람이 아니에요{#if chat && phase === 'ready'} · <span class="num">{fmtClock(Math.ceil(remainMs / 1000), true)}</span>{/if}
				</small>
			</span>
		</div>
	</header>

	{#if seeking}
		<div class="seeking" role="status">
			<span class="dot" aria-hidden="true"></span>
			상대를 찾는 중 <span class="num">{seeking}</span> · 찾으면 바로 연결돼요
		</div>
	{/if}

	<div class="sr-only" aria-live="polite">{spoken}</div>
	<div class="list" bind:this={listEl} role="region" aria-label="AI 대화 내용">
		{#if phase === 'starting'}
			<p class="empty muted">AI 를 부르는 중…</p>
		{:else if phase === 'unavailable'}
			<div class="empty">
				<p>{notice}</p>
				<button class="btn-ghost" onclick={onclose}>돌아가기</button>
			</div>
		{:else}
			{#each lines as l, i (i)}
				<div class="row" class:mine={l.role === 'user'}>
					<div class="bubble selectable">
						<span class="sr-only">{l.role === 'user' ? '나' : 'AI'}: </span>{l.content}
					</div>
				</div>
			{/each}
			{#if sending}
				<div class="row"><div class="bubble typing" aria-label="AI 가 답을 쓰는 중"><i></i><i></i><i></i></div></div>
			{/if}
			{#if phase === 'ended'}
				<p class="sys">{notice}</p>
			{/if}
		{/if}
	</div>

	{#if phase === 'ready'}
		<div class="composer">
			<div class="pill">
				<textarea
					bind:this={inputEl}
					bind:value={draft}
					rows="1"
					maxlength="500"
					placeholder="AI 에게 말하기…"
					onkeydown={onKey}
				></textarea>
				<button class="send" onclick={send} disabled={!draft.trim() || sending}>보내기</button>
			</div>
			<p class="fine muted">
				AI 는 틀린 말을 할 수 있어요{#if chat} · <span class="num">{turns}/{chat.maxTurns}</span>{/if}
			</p>
		</div>
	{:else if phase === 'ended'}
		<div class="composer">
			<button class="btn" onclick={onclose}>닫기</button>
		</div>
	{/if}
</div>

<style>
	.ai {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		flex-direction: column;
		background: var(--bg);
	}
	.close {
		flex: none;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		margin-left: -6px;
	}
	.close svg {
		width: 22px;
		height: 22px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.avatar {
		flex: none;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--brand);
		color: #fff;
		font-size: 13px;
		font-weight: 800;
	}
	.names {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}
	.names b {
		font-size: 15px;
	}
	.names small {
		font-size: 12px;
	}
	.tag {
		display: inline-block;
		margin-left: 4px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--field);
		color: var(--text-2);
		font-size: 11px;
		font-weight: 700;
		vertical-align: 2px;
	}
	.seeking {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px var(--pad);
		background: var(--field);
		font-size: 13px;
	}
	.seeking .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
	}
	.list {
		flex: 1;
		overflow-y: auto;
		padding: 12px var(--pad);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.empty {
		margin: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		text-align: center;
	}
	.row {
		display: flex;
	}
	.row.mine {
		justify-content: flex-end;
	}
	.bubble {
		max-width: 78%;
		padding: 8px 13px;
		border-radius: var(--r-bubble);
		background: var(--field);
		font-size: 15px;
		line-height: 1.38;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.mine .bubble {
		background: var(--bubble-fill);
		color: var(--on-accent);
	}
	.typing {
		display: flex;
		gap: 4px;
		padding: 12px 14px;
	}
	.typing i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-2);
		animation: blink 1.2s infinite;
	}
	.typing i:nth-child(2) {
		animation-delay: 0.2s;
	}
	.typing i:nth-child(3) {
		animation-delay: 0.4s;
	}
	@keyframes blink {
		0%,
		60%,
		100% {
			opacity: 0.25;
		}
		30% {
			opacity: 1;
		}
	}
	.sys {
		align-self: center;
		margin: 10px 0;
		font-size: 13px;
		color: var(--text-2);
	}
	.composer {
		padding: 8px var(--pad) calc(8px + env(safe-area-inset-bottom));
		background: var(--bg);
	}
	.composer .btn {
		width: 100%;
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
	textarea {
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
	textarea::placeholder {
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
		cursor: default;
	}
	.fine {
		margin: 6px 4px 0;
		font-size: 11px;
		text-align: center;
	}
</style>
