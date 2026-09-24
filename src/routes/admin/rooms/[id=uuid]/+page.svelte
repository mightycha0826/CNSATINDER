<script lang="ts">
	import { CLOSE_LABEL, fmtClock, fmtTime } from '$lib/adminTypes';
	import Sid from '$lib/admin/Sid.svelte';
	import { REACTION_EMOJI } from '$lib/chat/types';

	let { data } = $props();
	const v = $derived(data.v);
	const seat = (n: number) => v.members.find((m) => m.seat === n);
	const time = fmtClock;
	const userMsgs = $derived(v.messages.filter((m) => m.seat > 0).length);
	const byId = $derived(new Map(v.messages.map((m) => [m.id, m])));
	/** "❤️ 새벽수달 · 😂 말랑복숭아" — 누가(방 안 이름) 어떤 공감을 달았는지 */
	const reacts = (r: (typeof v.messages)[number]['reactions']) =>
		(['1', '2'] as const)
			.filter((k) => r?.[k])
			.map((k) => `${REACTION_EMOJI[r![k]!]} ${seat(Number(k))?.alias ?? k}`)
			.join(' · ');
</script>

<a class="a-back" href="/admin/rooms">← 전체 대화</a>

<header class="a-head">
	<div>
		<h1 class="a-h1">
			대화
			{#if v.room.live}<span class="pill acc">{v.room.status === 'pending' ? '입장 대기' : '진행 중'}</span>
			{:else}<span class="pill">{CLOSE_LABEL[v.room.close_reason ?? ''] ?? '종료'}</span>{/if}
		</h1>
		<p class="a-sub">
			{fmtTime(v.room.created_at)} 시작
			{#if v.room.closed_at} · {fmtTime(v.room.closed_at)} 종료{:else} · {fmtTime(v.room.expires_at)} 마감{/if}
			· 연장 {v.room.round - 1}회
		</p>
	</div>
</header>

<p class="a-warn">이 열람은 활동 기록에 남았습니다.</p>

<div class="a-grid">
	<section>
		<h2 class="a-h2">메시지 <span class="muted">{userMsgs}개</span></h2>
		<div class="msgs">
			{#each v.messages as m (m.id)}
				{#if m.seat === 0}
					<div class="sys">{m.body}</div>
				{:else}
					<div class="m" class:s2={m.seat === 2}>
						<span class="who">{seat(m.seat)?.alias ?? m.seat}</span>
						<span class="body">
							{#if m.reply_to != null}
								{@const o = byId.get(m.reply_to)}
								<span class="re">↳ 답장: {o ? `${seat(o.seat)?.alias ?? o.seat} "${o.body.slice(0, 40)}${o.body.length > 40 ? '…' : ''}"` : `#${m.reply_to}`}</span>
							{/if}
							{m.body}
							{#if m.reactions}<span class="rx">{reacts(m.reactions)}</span>{/if}
						</span>
						<span class="t num">{time(m.created_at)}</span>
					</div>
				{/if}
			{:else}
				<p class="muted empty">
					{v.room.closed_at ? '메시지 없음 (끝난 지 24시간이 지나 지워졌거나, 대화가 없었음)' : '아직 메시지 없음'}
				</p>
			{/each}
		</div>
	</section>

	<aside class="a-aside">
		{#each v.members as m (m.seat)}
			<section class="a-card">
				<h2 class="a-h2">{m.alias} <span class="muted">· 자리 {m.seat}</span></h2>
				<dl class="a-dl">
					<dt>계정</dt>
					<dd><a href="/admin/users/{m.user_id}">{m.nickname ?? m.user_id.slice(0, 8)}<Sid label={data.students[m.user_id]} /> →</a></dd>
					<dt>상태</dt>
					<dd>{m.status === 'active' ? '정상' : m.status === 'banned' ? '영구정지' : '정지'}</dd>
					<dt>대화방</dt>
					<dd>{m.open ? '참여 중' : '나감'}</dd>
				</dl>
			</section>
		{/each}
	</aside>
</div>

<style>
	.msgs {
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
	}
	.m {
		display: grid;
		grid-template-columns: 96px 1fr auto;
		gap: 10px;
		padding: 9px 12px;
		border-top: 1px solid var(--line);
		font-size: 14px;
		line-height: 1.5;
	}
	.m:first-child,
	.sys:first-child {
		border-top: 0;
	}
	.m .who {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-2);
		padding-top: 1px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.m.s2 {
		background: var(--surface);
	}
	.m .body {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.m .re {
		display: block;
		margin-bottom: 2px;
		font-size: 12px;
		color: var(--text-2);
		white-space: normal;
	}
	.m .rx {
		display: block;
		margin-top: 2px;
		font-size: 12px;
		color: var(--text-2);
		white-space: normal;
	}
	.m .t {
		font-size: 12px;
		color: var(--text-2);
	}
	.sys {
		padding: 8px 12px;
		font-size: 12px;
		color: var(--text-2);
		text-align: center;
		border-top: 1px solid var(--line);
	}
	.empty {
		padding: 24px 12px;
		margin: 0;
		font-size: 13px;
		text-align: center;
	}
	.a-dl a {
		color: var(--accent);
		font-weight: 600;
	}
	.a-h1 .pill {
		font-size: 12px;
		vertical-align: 4px;
	}
</style>
