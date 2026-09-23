<script lang="ts">
	import { enhance } from '$app/forms';
	import { fmtTime } from '$lib/adminTypes';
	import { confirmed } from '$lib/admin/confirm';
	import FormMsg from '$lib/admin/FormMsg.svelte';

	let { data, form } = $props();
	const admin = $derived(data.staff?.role === 'admin');
	// 실패하면 쓰던 글을 되살린다
	const draft = $derived((form ?? {}) as { title?: string; body?: string });

	const askPost = confirmed(() => '이 공지를 전교생에게 올릴까요? 종 아이콘에 빨간 점이 뜹니다.');
	const askRemove = (title: string) => confirmed(() => `"${title}" 공지를 내릴까요? 학생들에게 더 이상 보이지 않아요.`, { keep: true });
</script>

<header class="a-head">
	<div>
		<h1 class="a-h1">공지사항</h1>
		<p class="a-sub">학생 앱 위쪽 종 아이콘으로 보입니다. 새 공지를 올리면 종에 빨간 점이 뜹니다. 올리고 내린 기록은 활동 기록에 남습니다.</p>
	</div>
</header>

<FormMsg {form} />

{#if admin}
	<form class="a-card post" method="POST" action="?/post" use:enhance={askPost}>
		<input class="field" name="title" maxlength="80" placeholder="제목 (80자까지)" value={draft.title ?? ''} required />
		<textarea class="field" name="body" rows="5" maxlength="2000" placeholder="내용 (선택 · 2000자까지)">{draft.body ?? ''}</textarea>
		<button class="btn">공지 올리기</button>
	</form>
{:else}
	<p class="a-warn">공지는 관리자만 올리고 내릴 수 있어요.</p>
{/if}

<h2 class="a-h2">올라가 있는 공지 <span class="muted">{data.notices.length}개</span></h2>
{#if data.notices.length === 0}
	<p class="a-empty">올라간 공지가 없어요.</p>
{:else}
	<ul class="list">
		{#each data.notices as n (n.id)}
			<li class="a-card">
				<div class="row">
					<div>
						<b>{n.title}</b>
						<span class="muted num">{fmtTime(n.created_at)}</span>
					</div>
					{#if admin}
						<form method="POST" action="?/remove" use:enhance={askRemove(n.title)}>
							<input type="hidden" name="id" value={n.id} />
							<button class="btn-ghost a-sm">내리기</button>
						</form>
					{/if}
				</div>
				{#if n.body}<p class="body">{n.body}</p>{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.post {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 720px;
		margin-bottom: 24px;
	}
	.post textarea {
		height: auto;
		padding: 10px 12px;
		resize: vertical;
		line-height: 1.6;
	}
	.post .btn {
		align-self: flex-end;
		width: auto;
		padding: 0 20px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 720px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.row b {
		margin-right: 8px;
	}
	.row .muted {
		font-size: 12px;
	}
	.body {
		margin: 8px 0 0;
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-2);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
