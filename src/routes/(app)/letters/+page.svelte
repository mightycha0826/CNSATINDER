<script lang="ts">
	import { goto } from '$app/navigation';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { fetchFeed, requestReplyTask } from '$lib/letters/api';
	import { LettersFeed } from '$lib/letters/feed.svelte';
	import RichText from '$lib/letters/RichText.svelte';
	import LikeButton from '$lib/letters/LikeButton.svelte';
	import { ReplySeeker } from '$lib/letters/replySeeker.svelte';
	import { S, toast } from '$lib/state.svelte';
	import { ago, mmss } from '$lib/time';

	/**
	 * 익명편지 탭 = 공개 피드 (인스타그램 게시물 목록).
	 * 목록: 모두의 편지. 누르면 본문과 댓글.
	 * 아래(탭바 위 고정): "답장할 편지 받기" — 아직 아무도 답장을 맡지 않은 편지 한 통을 배정받는다 · "편지 쓰기".
	 */

	const feed = new LettersFeed(fetchFeed);
	const seeker = new ReplySeeker(
		requestReplyTask,
		(id) => void goto(`/letters/${id}`),
		(msg) => toast(msg)
	);

	$effect(() => {
		feed.start();
		return () => {
			feed.stop();
			seeker.cancel();
		};
	});

	// 무한 스크롤 — 목록 끝의 표지가 화면에 들어오면 다음 페이지
	let sentinel: HTMLDivElement | undefined = $state();
	$effect(() => {
		if (!sentinel) return;
		const io = new IntersectionObserver((es) => {
			if (es.some((e) => e.isIntersecting)) void feed.loadMore();
		}, { rootMargin: '400px' });
		io.observe(sentinel);
		return () => io.disconnect();
	});

	// 내가 맡은 답장 숙제
	const myTask = $derived(feed.letters.find((l) => l.assigned_to_me && l.reply_status === 'assigned'));

	const elapsed = $derived(seeker.seeking ? mmss(Math.floor((S.now - seeker.since) / 1000)) : '');
	const serverNow = $derived(S.now + feed.skew);
</script>

<div class="topbar">
	<span class="title">익명편지</span>
	<button class="me" onclick={() => goto('/me')} aria-label="내 프로필">
		{#if S.profile?.nickname}<Avatar name={S.profile.nickname} size={28} />{/if}
	</button>
</div>

<div class="page letters">
	{#if !myTask && !seeker.seeking}
		<p class="hint muted">
			편지는 모두에게 공개돼요. 편지마다 새 익명 이름이 붙어서, 여러 편지를 써도 같은 사람인지 알 수 없어요.
		</p>
	{/if}

	{#if feed.loaded && !feed.letters.length}
		<div class="empty">
			<h1>첫 편지를 남겨 보세요</h1>
			<p class="muted">답장해 줄 사람이 한 명 꼭 배정돼요.</p>
		</div>
	{/if}

	<ul class="posts">
		{#each feed.letters as l (l.id)}
			<li>
				<a class="post" href={`/letters/${l.id}`}>
					<div class="who">
						<Avatar name={l.author_alias} size={32} />
						<span class="alias">{l.author_alias}</span>
						{#if l.is_mine}<span class="chip">내 편지</span>{/if}
						<span class="when muted">{ago(l.created_at, serverNow)}</span>
					</div>
					<div class="body"><RichText body={l.body} fmt={l.fmt}>
						{#snippet after()}{#if l.truncated}<span class="more muted">… 더 보기</span>{/if}{/snippet}
					</RichText></div>
				</a>
				<!-- 버튼은 링크 안에 넣을 수 없어서 게시물 아래 줄은 링크 밖에 둔다 -->
				<div class="meta muted">
					<LikeButton
						id={l.id}
						liked={l.liked}
						count={l.like_count}
						onchange={(v, n) => {
							l.liked = v;
							l.like_count = n;
						}}
					/>
					<a class="count" href={`/letters/${l.id}`} aria-label="댓글 {l.comment_count}개">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M12 4.4c-4.4 0-7.9 3.2-7.9 7.2 0 2.2 1 4.1 2.7 5.4l-.5 2.5 2.7-1.3c.9.4 1.9.6 3 .6 4.4 0 7.9-3.2 7.9-7.2S16.4 4.4 12 4.4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
						</svg>
						{l.comment_count}
					</a>
					{#if l.reply_status === 'replied'}
						<span class="state done">답장 도착</span>
					{:else if l.assigned_to_me}
						<span class="state mine">내가 답장할 차례</span>
					{:else if l.reply_status === 'assigned'}
						<span class="state">답장 쓰는 중</span>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	<div bind:this={sentinel} class="sentinel">
		{#if feed.loadingMore}<span class="muted">불러오는 중…</span>{/if}
	</div>

	<!-- 답장할 편지 받기 · 편지 쓰기 — 엄지가 닿는 아래쪽에 고정 (탭바 바로 위) -->
	<div class="cta">
		{#if myTask}
			<button class="task" onclick={() => goto(`/letters/${myTask.id}`)}>
				<strong>답장을 기다리는 편지 1통</strong>
				<span>{myTask.author_alias} 님의 편지 · 눌러서 답장 쓰기 ›</span>
			</button>
		{:else if seeker.seeking}
			<div class="seek">
				<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>
				<div class="seek-text">
					<strong>답장할 편지를 고르는 중 <span class="num muted">{elapsed}</span></strong>
					<span class="muted">
						{#if seeker.reason === 'cooldown'}
							너무 자주 받고 있어요. 잠깐 쉬었다가 다시 볼게요
						{:else if seeker.reason === 'filtered'}
							지금은 받을 수 있는 편지가 없어요. 새 편지가 오면 바로 드릴게요
						{:else if seeker.reason === 'empty'}
							아직 답장을 기다리는 편지가 없어요
						{:else}
							잠시만요…
						{/if}
					</span>
				</div>
				<button class="stop" onclick={() => seeker.cancel()}>그만</button>
			</div>
		{:else}
			<div class="actions">
				<button class="btn" onclick={() => seeker.start()}>답장할 편지 받기</button>
				<button class="btn-ghost" onclick={() => goto('/letters/new')}>편지 쓰기</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.me {
		margin-left: auto;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
	}

	.letters {
		gap: 12px;
		padding-top: 12px;
		padding-bottom: 0; /* 버튼 여백은 .cta 가 */
	}

	.cta {
		position: sticky;
		bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
		margin-top: auto;
		padding: 12px 0;
		background: var(--bg);
		z-index: 5;
	}

	.actions {
		display: flex;
		gap: 8px;
	}
	.actions .btn {
		flex: 1.4;
	}
	.actions .btn-ghost {
		flex: 1;
	}
	.hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.6;
	}

	.task {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 14px;
		border-radius: var(--r-sm);
		background: var(--accent-fill);
		color: var(--on-accent);
		text-align: left;
		font-size: 14px;
	}
	.task span {
		font-size: 12px;
		opacity: 0.9;
	}

	/* 찾는 중 — 채팅 홈과 같은 모양 */
	.seek {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 10px 12px;
		border-radius: var(--r-sm);
		border: 1px solid var(--line);
	}
	.seek-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		font-size: 12px;
		line-height: 1.4;
	}
	.seek-text strong {
		font-size: 14px;
	}
	.stop {
		flex: none;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}
	.dots {
		display: flex;
		gap: 5px;
		flex: none;
	}
	.dots i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--g-orange);
		animation: pulse 1.2s infinite;
	}
	.dots i:nth-child(2) {
		background: var(--g-coral);
		animation-delay: 0.2s;
	}
	.dots i:nth-child(3) {
		background: var(--g-pink);
		animation-delay: 0.4s;
	}
	@keyframes pulse {
		0%,
		60%,
		100% {
			opacity: 0.2;
			transform: scale(0.85);
		}
		30% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.empty {
		padding: 48px 0 24px;
		text-align: center;
	}
	.empty h1 {
		margin: 0 0 6px;
		font-size: 18px;
		font-weight: 700;
	}
	.empty p {
		margin: 0;
		font-size: 14px;
	}

	/* 게시물 — 면 구분은 hairline 으로만 */
	.posts {
		list-style: none;
		margin: 0 calc(-1 * var(--pad));
		padding: 0;
	}
	.posts li {
		border-top: 1px solid var(--line);
	}
	.post {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px var(--pad) 6px;
		color: var(--text);
	}
	.post:active {
		background: var(--surface);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.alias {
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chip {
		flex: none;
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--field);
		font-size: 11px;
		font-weight: 600;
	}
	.when {
		margin-left: auto;
		flex: none;
		font-size: 12px;
	}
	.body {
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.more {
		font-size: 14px;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 var(--pad) 8px;
		font-size: 13px;
	}
	.count {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 32px;
		color: inherit;
	}
	.count svg {
		width: 18px;
		height: 18px;
	}
	.state {
		margin-left: auto;
		font-size: 12px;
		font-weight: 600;
	}
	.state.done {
		color: var(--text);
	}
	.state.mine {
		color: var(--accent);
	}

	.sentinel {
		min-height: 24px;
		display: grid;
		place-items: center;
		font-size: 12px;
	}
</style>
