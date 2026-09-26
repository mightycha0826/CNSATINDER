<script lang="ts">
	import { page } from '$app/state';
	import { useTabBack } from '$lib/tabBack.svelte';
	import { whileVisible } from '$lib/visible';
	import { DM, refreshUnread } from '$lib/letters/unread.svelte';

	/**
	 * 앱 화면 공통 틀 — 하단 탭 3개 (왼쪽 익명편지 · 가운데 채팅 · 오른쪽 프로필).
	 *
	 * 탭은 세 "뿌리" 화면(/letters, /, /me)에서만 보인다. 대화방·편지 상세·편지 쓰기·공지·설정은
	 * 뒤로가기 화살표로 돌아오는 화면이라 탭을 숨긴다 — 키보드가 뜬 상태에서 화면이 더 좁아지지 않게.
	 * 탭이 있는 동안 아래쪽 안전영역(아이폰 홈 막대)은 탭바가 맡는다.
	 */
	let { children } = $props();

	const path = $derived(page.url.pathname);
	const showTabs = $derived(path === '/' || path === '/letters' || path === '/me');
	const onLetters = $derived(path === '/letters');
	const onChat = $derived(path === '/');
	const onMe = $derived(path === '/me');

	// 안 읽은 편지 — 익명편지 탭 위 빨간 점. 앱이 보이는 동안 2분마다 (편지 목록 화면은 따로 30초마다 읽는다)
	$effect(() => {
		void refreshUnread();
		return whileVisible(() => void refreshUnread(), 120_000);
	});

	const { switchTab } = useTabBack(); // 뒤로가기: 익명편지·프로필 → 홈, 홈 → 두 번 누르면 종료 (lib/tabBack.svelte.ts)
</script>

{@render children()}

{#if showTabs}
	<!-- 탭바에 가려지지 않게 같은 높이만큼 비워 둔다 -->
	<div class="tabbar-space" aria-hidden="true"></div>
	<nav class="tabbar" aria-label="주 메뉴">
		<a class="tab" class:on={onLetters} href="/letters" onclick={(e) => switchTab(e, '/letters')} aria-current={onLetters ? 'page' : undefined}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				{#if onLetters}
					<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11z" fill="currentColor" />
					<path d="M4 7l8 6 8-6" fill="none" stroke="var(--bg)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
				{:else}
					<path d="M3.9 6.5A1.6 1.6 0 0 1 5.5 4.9h13a1.6 1.6 0 0 1 1.6 1.6v11a1.6 1.6 0 0 1-1.6 1.6h-13a1.6 1.6 0 0 1-1.6-1.6v-11z" fill="none" stroke="currentColor" stroke-width="1.8" />
					<path d="M4.5 7.5l7.5 5.5 7.5-5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
				{/if}
			</svg>
			<span>익명편지</span>
			{#if DM.unread > 0}<span class="tab-dot" aria-label="안 읽은 편지 {DM.unread}통"></span>{/if}
		</a>
		<a class="tab" class:on={onChat} href="/" onclick={(e) => switchTab(e, '/')} aria-current={onChat ? 'page' : undefined}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				{#if onChat}
					<path d="M12 3.5c-4.9 0-8.8 3.6-8.8 8.1 0 2.4 1.1 4.5 2.9 6l-.6 3 3.2-1.6c1 .4 2.1.6 3.3.6 4.9 0 8.8-3.6 8.8-8.1S16.9 3.5 12 3.5z" fill="currentColor" />
				{:else}
					<path d="M12 4.4c-4.4 0-7.9 3.2-7.9 7.2 0 2.2 1 4.1 2.7 5.4l-.5 2.5 2.7-1.3c.9.4 1.9.6 3 .6 4.4 0 7.9-3.2 7.9-7.2S16.4 4.4 12 4.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
				{/if}
			</svg>
			<span>채팅</span>
		</a>
		<a class="tab" class:on={onMe} href="/me" onclick={(e) => switchTab(e, '/me')} aria-current={onMe ? 'page' : undefined}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				{#if onMe}
					<circle cx="12" cy="8" r="4.2" fill="currentColor" />
					<path d="M3.8 20.2c.8-4 4.2-6.3 8.2-6.3s7.4 2.3 8.2 6.3c.1.5-.3.8-.7.8H4.5c-.4 0-.8-.3-.7-.8z" fill="currentColor" />
				{:else}
					<circle cx="12" cy="8" r="3.9" fill="none" stroke="currentColor" stroke-width="1.8" />
					<path d="M4.6 20.1c.8-3.6 3.8-5.6 7.4-5.6s6.6 2 7.4 5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
				{/if}
			</svg>
			<span>프로필</span>
		</a>
	</nav>
{/if}
