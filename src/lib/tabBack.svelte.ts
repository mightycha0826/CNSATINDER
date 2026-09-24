import { tick, untrack } from 'svelte';
import { goto, pushState } from '$app/navigation';
import { page } from '$app/state';
import { UI, toast } from './state.svelte';

/**
 * 탭 첫 화면(채팅 홈 · 익명편지)의 뒤로가기 — 설치된 앱에서 인스타처럼:
 *   익명편지 탭에서 뒤로 → 채팅 홈, 홈에서 뒤로 → "한 번 더 누르면 종료" 안내, 2초 안에 또 누르면 앱이 닫힌다.
 *
 * 방법: 탭 첫 화면에 들어오면 같은 주소로 얕은 기록(guard)을 하나 쌓는다. 뒤로가기는 그 guard 만 걷어내고
 * 화면은 그대로 — 같은 탭에서 guard 가 사라지는 순간을 잡아 안내를 띄운다. 안내 뒤 2초 동안은 guard 를 다시 쌓지 않으므로
 * 한 번 더 누르면 기록의 맨 아래(홈)에서 뒤로 = 앱 종료. 2초가 지나면 다시 쌓는다.
 * ★ 홈이 기록의 맨 아래여야 한다 — 탭 전환은 switchTab 으로 기록을 바꿔 끼우고, 다른 화면에서 홈으로는 뒤로 간다(nav.ts).
 * 브라우저(설치 안 함)에서는 뒤로가기를 가로채지 않는다.
 *
 * 컴포넌트 초기화 중에 부른다 ((app)/+layout.svelte). 탭 링크의 onclick 에 쓸 switchTab 을 돌려준다.
 */
const ROOTS = ['/', '/letters'];
const EXIT_MS = 2000;

export function useTabBack() {
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

	return { switchTab };
}
