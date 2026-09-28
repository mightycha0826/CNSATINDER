<script lang="ts">
	/**
	 * 알림 (Phase 35 — 상단 하트) — 새 메시지 · 새 편지 · 나에게 온 개인 공지 · 공지를 한곳에 (인스타 "활동"처럼).
	 *   새 알림: 안 읽은 대화 · 안 연 편지 · 안 읽은 개인 공지 · 안 본 공지 — 최근 것부터
	 *   지난 알림: 최근에 연 편지 · 읽은 개인 공지 · 지난 공지 몇 개
	 * 누르면 그 화면으로. 목록은 앱이 기억해 둔 것(INBOX · 편지함 · 공지)부터 바로 그리고 뒤에서 새로 읽는다.
	 */
	import { goto } from '$app/navigation';
	import BackButton from '$lib/ui/BackButton.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { INBOX } from '$lib/inbox.svelte';
	import { BOX, refreshMailbox } from '$lib/letters/mailbox.svelte';
	import { fromLabel } from '$lib/letters/api';
	import { NOTICES, loadNotices } from '$lib/notices.svelte';
	import { S } from '$lib/state.svelte';
	import { agoText } from '$lib/time';

	$effect(() => {
		void INBOX.load();
		refreshMailbox();
		void loadNotices(true);
	});

	type Item = {
		key: string;
		kind: 'chat' | 'letter' | 'warning' | 'notice';
		title: string;
		body: string;
		at: string;
		url: string;
		badge?: number;
		face?: string;
		border?: 'f' | 'm' | 'x' | 'brand';
	};
	const byTime = (a: Item, b: Item) => Date.parse(b.at) - Date.parse(a.at);

	const fresh = $derived.by(() => {
		const out: Item[] = [];
		for (const r of INBOX.rooms) {
			if (r.unread > 0 || !r.joined)
				out.push({
					key: `c${r.room_id}`,
					kind: 'chat',
					title: r.joined ? `${r.partner_alias}님의 새 메시지` : `${r.partner_alias}님과 새로 연결됐어요`,
					body: r.joined ? (r.last_body ?? '') : '눌러서 대화를 시작해 보세요',
					at: r.last_at ?? r.expires_at,
					url: `/chat/${r.room_id}`,
					badge: r.unread,
					face: r.partner_alias
				});
		}
		for (const l of BOX.received) {
			if (l.opened || l.removed) continue;
			out.push({
				key: `l${l.id}`,
				kind: 'letter',
				title: `${fromLabel(l)}에게서 ${l.is_reply ? '답장' : '편지'}가 왔어요`,
				body: '봉투를 열어 확인해 보세요',
				at: l.created_at,
				url: `/letters/m/${l.id}`,
				border: !l.from_name ? (l.from_gender === 'f' ? 'f' : l.from_gender === 'm' ? 'm' : 'x') : 'brand'
			});
		}
		for (const n of NOTICES.personal) {
			if (!n.read) out.push({ key: `p${n.id}`, kind: 'warning', title: n.kind === 'warning' ? `운영진 경고 · ${n.title}` : `운영진 · ${n.title}`, body: n.body, at: n.created_at, url: '/notices' });
		}
		for (const n of NOTICES.list) {
			if (n.id > NOTICES.lastSeen) out.push({ key: `n${n.id}`, kind: 'notice', title: `공지 · ${n.title}`, body: n.body, at: n.created_at, url: `/notices/${n.id}` });
		}
		return out.sort(byTime);
	});

	const past = $derived.by(() => {
		const out: Item[] = [];
		for (const l of BOX.received.filter((x) => x.opened && !x.removed).slice(0, 5))
			out.push({ key: `l${l.id}`, kind: 'letter', title: `${fromLabel(l)}의 ${l.is_reply ? '답장' : '편지'}`, body: '다시 읽기', at: l.created_at, url: `/letters/m/${l.id}` });
		for (const n of NOTICES.personal.filter((x) => x.read).slice(0, 3))
			out.push({ key: `p${n.id}`, kind: 'warning', title: `운영진 · ${n.title}`, body: n.body, at: n.created_at, url: '/notices' });
		for (const n of NOTICES.list.filter((x) => x.id <= NOTICES.lastSeen).slice(0, 5))
			out.push({ key: `n${n.id}`, kind: 'notice', title: `공지 · ${n.title}`, body: n.body, at: n.created_at, url: `/notices/${n.id}` });
		return out.sort(byTime);
	});
	const ready = $derived(INBOX.loaded || BOX.loaded.received || NOTICES.loaded);
</script>

<div class="topbar">
	<BackButton href="/" history />
	<span class="title">알림</span>
	<a class="all" href="/notices">공지사항</a>
</div>

<div class="page activity">
	{#snippet row(it: Item, i: number)}
		<li style:--i={i}>
			<button class="row" class:unread={fresh.includes(it)} onclick={() => goto(it.url)}>
				<span class="ico {it.kind} b-{it.border ?? 'brand'}" aria-hidden="true">
					{#if it.kind === 'chat' && it.face}
						<Avatar name={it.face} size={46} />
					{:else if it.kind === 'letter'}
						<svg viewBox="0 0 24 24"><path d="M3.5 6.5A2 2 0 0 1 5.5 4.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill="currentColor" /><path d="M4.5 7l7.5 5.5L19.5 7" fill="none" stroke="rgb(120 20 50 / .55)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
					{:else if it.kind === 'warning'}
						<svg viewBox="0 0 24 24"><path d="M12 3.5l9 16H3z" fill="currentColor" /><path d="M12 10v4.5M12 17.2v.1" stroke="#fff" stroke-width="2" stroke-linecap="round" /></svg>
					{:else}
						<svg viewBox="0 0 24 24"><path d="M4 10v4h3l6 4V6L7 10z" fill="currentColor" /><path d="M16.5 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
					{/if}
				</span>
				<span class="mid">
					<strong>{it.title}</strong>
					{#if it.body}<span class="body">{it.body}</span>{/if}
				</span>
				<span class="right">
					<time class="num">{agoText(it.at, S.now)}</time>
					{#if it.badge}<span class="badge num">{it.badge > 99 ? '99+' : it.badge}</span>{/if}
				</span>
			</button>
		</li>
	{/snippet}

	{#if !ready}
		<ul class="list" aria-label="불러오는 중">
			{#each [0, 1, 2] as i (i)}<li class="skel"><i></i><span><b></b><em></em></span></li>{/each}
		</ul>
	{:else}
		<h2>새 알림</h2>
		{#if fresh.length}
			<ul class="list">{#each fresh as it, i (it.key)}{@render row(it, i)}{/each}</ul>
		{:else}
			<div class="none">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.6-4.6-7.6-10.3A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.6 2.8c0 5.7-7.6 10.3-7.6 10.3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>
				<p>새 알림을 모두 확인했어요</p>
			</div>
		{/if}
		{#if past.length}
			<h2>지난 알림</h2>
			<ul class="list">{#each past as it, i (it.key)}{@render row(it, i)}{/each}</ul>
		{/if}
	{/if}
</div>

<style>
	.all {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin: 0 -8px 0 auto;
		padding: 0 8px;
		font-size: 14px;
		font-weight: 700;
		transition: opacity 0.2s;
	}
	.all:active {
		opacity: 0.55;
		transition-duration: 0.08s;
	}
	.activity {
		gap: 8px;
		padding-top: 6px;
		padding-bottom: calc(28px + env(safe-area-inset-bottom));
	}
	h2 {
		margin: 16px 2px 4px;
		font-size: 16px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.list li {
		animation: in 0.4s calc(min(var(--i, 0), 8) * 40ms) cubic-bezier(0.25, 0.8, 0.25, 1) both;
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 10px 4px;
		border-radius: 16px;
		text-align: left;
		transition: background 0.2s;
	}
	.row:active {
		background: var(--field);
	}
	.ico {
		flex: none;
		display: grid;
		place-items: center;
		width: 46px;
		height: 46px;
		border-radius: 50%;
	}
	.ico svg {
		width: 22px;
		height: 22px;
	}
	.ico.letter {
		background: var(--accent-fill-deep);
		color: #fff;
	}
	.ico.letter.b-f {
		background: linear-gradient(135deg, #e0474f, #9d1830);
	}
	.ico.letter.b-m {
		background: linear-gradient(135deg, #3a7ae0, #173f8c);
	}
	.ico.warning {
		background: color-mix(in srgb, var(--danger) 14%, transparent);
		color: var(--danger);
	}
	.ico.notice {
		background: var(--field);
		color: var(--text);
	}
	.mid {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.mid strong {
		font-size: 14.5px;
		font-weight: 600;
		line-height: 1.35;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.unread .mid strong {
		font-weight: 800;
	}
	.body {
		font-size: 13px;
		color: var(--text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.right {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
		font-size: 12px;
		color: var(--text-2);
	}
	.badge {
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 10px;
		background: #ff3040;
		color: #fff;
		font-size: 11px;
		font-weight: 800;
		line-height: 20px;
		text-align: center;
	}
	.none {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 4px;
		color: var(--text-2);
	}
	.none svg {
		width: 26px;
		height: 26px;
	}
	.none p {
		margin: 0;
		font-size: 14px;
	}
	.skel {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 4px;
	}
	.skel i {
		width: 46px;
		height: 46px;
		border-radius: 50%;
		background: var(--field);
	}
	.skel span {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.skel b,
	.skel em {
		height: 10px;
		width: 60%;
		border-radius: 5px;
		background: var(--field);
		animation: pulse 1.2s ease-in-out infinite;
	}
	.skel em {
		width: 35%;
	}
	@keyframes pulse {
		50% {
			opacity: 0.5;
		}
	}
</style>
