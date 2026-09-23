<script lang="ts">
	/**
	 * 상단 바 오른쪽 — 공지 종 + 내 프로필. 홈(채팅)과 익명편지가 같이 쓴다.
	 * 안 본 공지가 있으면 종 오른쪽 위에 빨간 점. 화면이 보이는 동안 1분마다 새 공지를 확인한다.
	 */
	import { goto } from '$app/navigation';
	import { NOTICES, hasNewNotice, loadNotices } from '$lib/notices.svelte';
	import { S } from '$lib/state.svelte';
	import { whileVisible } from '$lib/visible';
	import Avatar from './Avatar.svelte';

	$effect(() => {
		void loadNotices();
		return whileVisible(() => void loadNotices(), 60_000);
	});

	const fresh = $derived(NOTICES.loaded && hasNewNotice());
</script>

<div class="actions">
	<button class="bell" onclick={() => goto('/notices')} aria-label={fresh ? '공지사항 (새 공지 있음)' : '공지사항'}>
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		{#if fresh}<span class="dot"></span>{/if}
	</button>
	<button class="me" onclick={() => goto('/me')} aria-label="내 프로필">
		{#if S.profile?.nickname}<Avatar name={S.profile.nickname} size={28} />{/if}
	</button>
</div>

<style>
	.actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.bell,
	.me {
		position: relative;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
	}
	.bell svg {
		width: 25px;
		height: 25px;
	}
	.dot {
		position: absolute;
		top: 3px;
		right: 3px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #ff3040;
		border: 2px solid var(--bg);
		box-sizing: content-box;
	}
</style>
