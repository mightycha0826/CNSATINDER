<script lang="ts">
	import { fmtTime } from '$lib/adminTypes';
	import Sid from '$lib/admin/Sid.svelte';
	import RichText from '$lib/letters/RichText.svelte';

	let { data } = $props();
	const v = $derived(data.v);
	const who = (no: number) => v.participants.find((p) => p.no === no);
	const sid = (uid?: string) => (uid ? data.students[uid] : undefined);
	const tops = $derived(v.comments.filter((c) => c.parent_id === null));
	const replies = (id: number) => v.comments.filter((c) => c.parent_id === id);
	const REPLY: Record<string, string> = { unassigned: '답장자 없음', assigned: '답장 대기', replied: '답장 완료' };
</script>

<a class="a-back" href="/admin/letters">← 편지 신고</a>

<header class="a-head">
	<div>
		<h1 class="a-h1">
			편지 #{v.letter.id}
			{#if v.letter.status === 'removed'}<span class="pill red">내려짐</span>{/if}
		</h1>
		<p class="a-sub">{fmtTime(v.letter.created_at)} · {REPLY[v.letter.reply_status] ?? v.letter.reply_status} · 하트 {v.letter.like_count ?? 0}</p>
	</div>
</header>

<p class="a-warn">이 열람은 활동 기록에 남았습니다. 내려진 글·지운 댓글도 여기서는 보입니다.</p>

<div class="a-grid">
	<section>
		<div class="letter a-card">
			<div class="by">
				{who(1)?.alias}
				<span class="pill acc">작성자</span>
				<a href="/admin/users/{who(1)?.user_id}">{who(1)?.nickname ?? '계정'}<Sid label={sid(who(1)?.user_id)} /> →</a>
			</div>
			<div class="body"><RichText body={v.letter.body} fmt={v.letter.fmt} /></div>
		</div>

		<h2 class="a-h2 ch">댓글 <span class="muted">{v.comments.length}개</span></h2>
		{#each tops as c (c.id)}
			{@render comment(c, false)}
			{#each replies(c.id) as r (r.id)}
				{@render comment(r, true)}
			{/each}
		{:else}
			<p class="a-warn">댓글 없음</p>
		{/each}
	</section>

	<aside class="a-aside">
		<section class="a-card">
			<h2 class="a-h2">참여자 <span class="muted">{v.participants.length}명</span></h2>
			<ul class="a-list">
				{#each v.participants as p (p.no)}
					<li>
						<span>{p.alias}{#if p.is_author}<span class="pill acc">작성자</span>{/if}</span>
						<a class="acc" href="/admin/users/{p.user_id}">{p.nickname ?? p.user_id.slice(0, 8)}<Sid label={sid(p.user_id)} /> →</a>
					</li>
				{/each}
			</ul>
			<p class="a-hint">편지 이름은 이 편지 안에서만 쓰는 임시 이름입니다.</p>
		</section>
		{#if v.reader}
			<section class="a-card">
				<h2 class="a-h2">지정 답장자</h2>
				<dl class="a-dl">
					<dt>계정</dt>
					<dd><a class="acc" href="/admin/users/{v.reader.user_id}">{v.reader.nickname ?? v.reader.user_id.slice(0, 8)}<Sid label={sid(v.reader.user_id)} /> →</a></dd>
					<dt>상태</dt>
					<dd>{v.reader.fulfilled_at ? `${fmtTime(v.reader.fulfilled_at)} 답장` : `${fmtTime(v.reader.expires_at)}까지`}</dd>
				</dl>
			</section>
		{/if}
	</aside>
</div>

{#snippet comment(c: (typeof v.comments)[number], nested: boolean)}
	<div class="c" class:nested class:gone={c.status === 'removed'}>
		<div class="by">
			{who(c.author_no)?.alias}
			{#if who(c.author_no)?.is_author}<span class="pill acc">작성자</span>{/if}
			{#if c.status === 'removed'}<span class="pill red">지워짐</span>{/if}
			<a href="/admin/users/{who(c.author_no)?.user_id}">{who(c.author_no)?.nickname ?? '계정'}<Sid label={sid(who(c.author_no)?.user_id)} /> →</a>
			<span class="muted t">{fmtTime(c.created_at)}</span>
		</div>
		<p class="body">{c.body}</p>
	</div>
{/snippet}

<style>
	.letter .body {
		font-size: 15px;
	}
	.by {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		font-size: 13px;
		font-weight: 700;
	}
	.by a,
	.acc {
		color: var(--accent);
		font-weight: 600;
	}
	.by .t {
		margin-left: auto;
		font-weight: 400;
		font-size: 12px;
	}
	.body {
		margin: 6px 0 0;
		font-size: 14px;
		line-height: 1.6;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.ch {
		margin-top: 20px;
	}
	.c {
		padding: 10px 12px;
		border-top: 1px solid var(--line);
	}
	.c.nested {
		margin-left: 24px;
		border-left: 2px solid var(--line);
	}
	.c.gone .body {
		color: var(--text-2);
		text-decoration: line-through;
	}
</style>
