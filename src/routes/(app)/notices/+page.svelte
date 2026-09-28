<script lang="ts">
	/**
	 * 공지사항 — 종 아이콘을 누르면 오는 화면. 최신 공지가 위, 제목만 보이고 누르면 내용 화면(/notices/[id]).
	 * 열면 맨 위 공지까지 본 것으로 저장한다(빨간 점이 꺼짐). 이번에 처음 보는 공지에는 "새" 표시.
	 */
	import { untrack } from 'svelte';
	import { NOTICES, loadNotices, markNoticesSeen, readPersonal } from '$lib/notices.svelte';
	import { clearNotifications } from '$lib/push';
	import { S } from '$lib/state.svelte';
	import { agoText } from '$lib/time';
	import BackButton from '$lib/ui/BackButton.svelte';
	import Chevron from '$lib/ui/Chevron.svelte';

	// 화면을 열기 전까지 봤던 번호 — 그보다 새 공지에 "새" 표시 (열자마자 저장해도 표시는 남게).
	let seenBefore = $state<number | null>(null);
	// 공지 내용을 보고 뒤로 돌아와도 "새" 표시가 그대로 있게 (SvelteKit snapshot = 뒤로 가기에 되살림)
	export const snapshot = {
		capture: () => seenBefore,
		restore: (v: number | null) => (seenBefore = v)
	};

	$effect(() => {
		// 홈에서 이미 불러왔으면 바로 표시 (untrack: 아래에서 lastSeen 을 바꿔도 이 effect 가 다시 돌지 않게)
		untrack(() => {
			if (NOTICES.loaded) seenBefore = NOTICES.lastSeen;
		});
		void (async () => {
			await loadNotices(true);
			seenBefore ??= NOTICES.lastSeen;
			await markNoticesSeen();
			void clearNotifications('pn-', true);
		})();
	});
</script>

<div class="topbar">
	<BackButton href="/" history />
	<span class="title">공지사항</span>
</div>

<div class="page notices">
	{#if NOTICES.personal.length}
		<!-- 나에게만 온 공지 (Phase 35) — 운영진의 경고 · 개인 연락. 누르면 펼쳐지고 읽음 -->
		<h2 class="sec">나에게 온 공지</h2>
		<ul class="personal">
			{#each NOTICES.personal as n (n.id)}
				<li class:warn={n.kind === 'warning'} class:unread={!n.read}>
					<details
						ontoggle={(e) => {
							if ((e.currentTarget as HTMLDetailsElement).open) void readPersonal(n.id);
						}}
					>
						<summary>
							<span class="kind">{n.kind === 'warning' ? '경고' : '운영진'}</span>
							<strong>{n.title}</strong>
							{#if !n.read}<span class="new">새</span>{/if}
							<span class="muted when">{agoText(n.created_at, S.now)}</span>
						</summary>
						{#if n.body}<p class="pbody selectable">{n.body}</p>{/if}
					</details>
				</li>
			{/each}
		</ul>
		<h2 class="sec">전체 공지</h2>
	{/if}
	{#if !NOTICES.loaded}
		<!-- 공지 줄과 같은 높이의 빈 줄 -->
		<p class="sr-only">불러오는 중…</p>
		<ul aria-hidden="true">
			{#each [72, 55, 64, 48] as w (w)}
				<li class="sk"><i class="skeleton" style:width="{w}%"></i><i class="skeleton when"></i></li>
			{/each}
		</ul>
	{:else if NOTICES.list.length === 0}
		<p class="muted empty">아직 공지가 없어요.</p>
	{:else}
		<ul>
			{#each NOTICES.list as n (n.id)}
				<li>
					<a href="/notices/{n.id}">
						<span class="text">
							<span class="head">
								<strong>{n.title}</strong>
								{#if seenBefore !== null && n.id > seenBefore}<span class="new">새</span>{/if}
							</span>
							<span class="muted when">{agoText(n.created_at, S.now)}</span>
						</span>
						<Chevron />
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.notices {
		padding-top: 0;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		border-bottom: 1px solid var(--line);
	}
	a {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 0;
		color: inherit;
		text-decoration: none;
	}
	a:active {
		opacity: 0.6;
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.head strong {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 16px;
		font-weight: 600;
		line-height: 1.4;
	}
	.new {
		flex: none;
		padding: 1px 6px;
		border-radius: 999px;
		background: #ff3040;
		color: #fff;
		font-size: 11px;
		font-weight: 700;
	}
	.when {
		font-size: 12px;
	}
	.sec {
		margin: 18px 0 6px;
		font-size: 13px;
		font-weight: 700;
		color: var(--text-2);
	}
	.personal li {
		border: 0;
		margin-bottom: 8px;
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-1);
		overflow: hidden;
	}
	.personal li.warn {
		box-shadow:
			inset 3px 0 0 var(--danger),
			var(--shadow-1);
	}
	summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 14px 14px;
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary strong {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		font-weight: 700;
	}
	.personal li.unread summary strong {
		font-weight: 800;
	}
	summary .when {
		flex-basis: 100%;
	}
	.kind {
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--field);
		font-size: 11px;
		font-weight: 800;
	}
	.warn .kind {
		background: var(--danger);
		color: #fff;
	}
	.pbody {
		margin: 0;
		padding: 0 14px 14px;
		font-size: 15px;
		line-height: 1.6;
		white-space: pre-wrap;
	}
	.empty {
		margin: 48px 0;
		text-align: center;
	}
	/* 불러오는 동안 — 제목 줄(16px × 1.4) · 시각 줄(12px) · 위아래 16px 가 실제 줄(a)과 같다 */
	.sk {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 16px 0;
	}
	.sk i {
		height: 16px;
		margin: 3px 0;
	}
	.sk i.when {
		width: 22%;
		height: 10px;
		margin: 4px 0;
	}
</style>
