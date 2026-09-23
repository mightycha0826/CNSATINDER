<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { goto, pushState } from '$app/navigation';
	import { page } from '$app/state';
	import { UI, toast } from '$lib/state.svelte';

	/**
	 * 앱 화면 공통 틀 — 하단 탭 2개 (왼쪽 익명편지 · 오른쪽 채팅).
	 *
	 * 탭은 두 "뿌리" 화면(/letters, /)에서만 보인다. 대화방·편지 상세·편지 쓰기·내 프로필은
	 * 뒤로가기 화살표로 돌아오는 화면이라 탭을 숨긴다 — 키보드가 뜬 상태에서 화면이 더 좁아지지 않게.
	 * 탭이 있는 동안 아래쪽 안전영역(아이폰 홈 막대)은 탭바가 맡는다.
	 */
	let { children } = $props();

	// /dev/letters 는 개발용 미리보기 (배포 빌드에서는 import.meta.env.DEV 가 false)
	const path = $derived(import.meta.env.DEV && page.url.pathname === '/dev/letters' ? '/letters' : page.url.pathname);
	const showTabs = $derived(path === '/' || path === '/letters');
	const onLetters = $derived(path === '/letters');

	// ── 뒤로가기 (설치된 앱) ─────────────────────────────────────
	// 인스타처럼: 익명편지 탭에서 뒤로 → 채팅 홈, 홈에서 뒤로 → "한 번 더 누르면 종료" 안내, 2초 안에 또 누르면 앱이 닫힌다.
	//
	// 방법: 탭 첫 화면에 들어오면 같은 주소로 얕은 기록(guard)을 하나 쌓는다. 뒤로가기는 그 guard 만 걷어내고
	// 화면은 그대로 — 같은 탭에서 guard 가 사라지는 순간을 잡아 안내를 띄운다. 안내 뒤 2초 동안은 guard 를 다시 쌓지 않으므로
	// 한 번 더 누르면 기록의 맨 아래(홈)에서 뒤로 = 앱 종료. 2초가 지나면 다시 쌓는다.
	// ★ 홈이 기록의 맨 아래여야 한다 — 탭 전환은 기록을 바꿔 끼우고, 대화방 등에서 돌아올 때는 뒤로 간다(lib/nav.ts).
	// 브라우저(설치 안 함)에서는 뒤로가기를 가로채지 않는다.
	const ROOTS = ['/', '/letters'];
	const EXIT_MS = 2000;
	let armedAt: string | null = null; // guard 를 쌓아 둔 탭
	let switching = false; // 탭 전환 중 — 그 사이의 기록 변화는 뒤로가기가 아니다
	let exitTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => () => {
		if (exitTimer) clearTimeout(exitTimer);
	});

	$effect(() => {
		const p = page.url.pathname;
		const guarded = !!page.state.guard;
		untrack(() => onHistory(p, guarded));
	});

	function arm(p: string) {
		armedAt = p;
		pushState('', { guard: true });
	}

	function onHistory(p: string, guarded: boolean) {
		if (!UI.standalone || switching) return;
		if (!ROOTS.includes(p)) {
			armedAt = null;
			return;
		}
		if (guarded) {
			armedAt = p;
			return;
		}
		// 같은 탭에서 guard 만 사라졌다 = 뒤로가기 (탭 전환은 switching 으로 따로 막는다)
		if (armedAt !== p) return arm(p); // 처음 들어왔다
		armedAt = null;
		if (p === '/letters') {
			void goto('/', { replaceState: true }); // 익명편지 탭에서 뒤로 → 채팅 홈
			return;
		}
		toast('뒤로가기를 한 번 더 누르면 종료됩니다', EXIT_MS);
		if (exitTimer) clearTimeout(exitTimer);
		exitTimer = setTimeout(() => {
			exitTimer = null;
			if (page.url.pathname === '/' && !page.state.guard) arm('/');
		}, EXIT_MS);
	}

	/** 탭 전환 — 기록을 쌓지 않고 바꿔 끼운다 (탭끼리 오간 기록이 홈 아래에 남지 않게) */
	async function switchTab(e: MouseEvent, href: string) {
		if (!UI.standalone) return; // 브라우저는 평소처럼 링크
		e.preventDefault();
		if (page.url.pathname === href) {
			window.scrollTo({ top: 0, behavior: 'smooth' });
			return;
		}
		switching = true;
		try {
			if (page.state.guard) {
				// 지금 탭의 guard 를 먼저 걷어낸다 — 안 그러면 guard 자리가 다음 탭으로 바뀌어 그 아래에 옛 탭이 남는다
				const left = new Promise<void>((r) => window.addEventListener('popstate', () => r(), { once: true }));
				history.back();
				await left;
				await tick();
			}
			await goto(href, { replaceState: true });
		} finally {
			switching = false;
		}
		onHistory(page.url.pathname, !!page.state.guard);
	}
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
		</a>
		<a class="tab" class:on={!onLetters} href="/" onclick={(e) => switchTab(e, '/')} aria-current={!onLetters ? 'page' : undefined}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				{#if !onLetters}
					<path d="M12 3.5c-4.9 0-8.8 3.6-8.8 8.1 0 2.4 1.1 4.5 2.9 6l-.6 3 3.2-1.6c1 .4 2.1.6 3.3.6 4.9 0 8.8-3.6 8.8-8.1S16.9 3.5 12 3.5z" fill="currentColor" />
				{:else}
					<path d="M12 4.4c-4.4 0-7.9 3.2-7.9 7.2 0 2.2 1 4.1 2.7 5.4l-.5 2.5 2.7-1.3c.9.4 1.9.6 3 .6 4.4 0 7.9-3.2 7.9-7.2S16.4 4.4 12 4.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
				{/if}
			</svg>
			<span>채팅</span>
		</a>
	</nav>
{/if}
