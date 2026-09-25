<script lang="ts">
	/**
	 * 상단 바 오른쪽 — 공지 종 + 설정(톱니). 탭 첫 화면(익명편지 · 채팅 · 프로필)이 같이 쓴다.
	 * 내 프로필은 하단 탭으로 옮겼다.
	 * 안 본 공지가 있으면 종 오른쪽 위에 빨간 점. 화면이 보이는 동안 5분마다, 앱으로 돌아올 때 새 공지를 확인한다.
	 * 탭을 오가도 1분 안이면 다시 부르지 않는다 (loadNotices). 공지는 드물게 바뀌므로 자주 물을 이유가 없다.
	 */
	import { goto } from '$app/navigation';
	import { NOTICES, hasNewNotice, loadNotices } from '$lib/notices.svelte';
	import { whileVisible } from '$lib/visible';

	$effect(() => {
		void loadNotices(); // 탭을 오가며 다시 그려질 때 — 1분 안이면 건너뛴다
		// 5분마다 · 앱으로 돌아올 때는 꼭 새로 (그사이 올라온 공지에 바로 점이 뜨게)
		return whileVisible(() => void loadNotices(true), 300_000);
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
	<button class="settings" onclick={() => goto('/settings')} aria-label="설정">
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" />
			<path
				d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linejoin="round"
			/>
		</svg>
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
	.settings {
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
	.settings svg {
		width: 24px;
		height: 24px;
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
