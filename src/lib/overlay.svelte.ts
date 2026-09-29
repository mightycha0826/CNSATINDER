import { untrack } from 'svelte';
import { goto, pushState } from '$app/navigation';
import { page } from '$app/state';

/**
 * 겹친 창(시트 · 고르기 · 모달 · AI 대화)을 뒤로가기로 닫기 (docs/UX-GUIDELINES.md G5.1 · G5.2 · G14.3).
 *
 * 창 하나 = 기록 한 칸: 열릴 때 같은 주소로 얕은 기록을 쌓고(page.state.ov 에 내 id), 안드로이드 뒤로가기로 그 칸이
 * 걷히면(내 id 가 빠지면) onclose 를 부른다. 버튼 · 바깥 누르기로 닫히면(창이 사라지면) 내 칸을 history.back() 으로 걷는다.
 * ov 는 배열이라 겹쳐 열어도 된다 — 뒤로 한 번에 맨 위 창만 닫힌다.
 *
 * ★ 창이 열린 채 다른 화면으로 갈 때는 navigateFromOverlay() — goto 와 history.back() 이 동시에 나가면 SvelteKit 이
 *   한쪽을 취소한다(편지 메뉴 "완료" 뒤 /letters 로 가지 않던 식). 그 밖의 이동은 루트 레이아웃의 beforeNavigate 가
 *   markNavigating() 을 불러, 사라지는 창이 back() 을 부르지 않게 한다.
 */

let seq = 0;
/** 지금 다른 화면으로 가는 중 — 사라지는 창이 history.back() 을 부르면 그 이동이 취소된다 */
let navigating = false;
let navTimer: ReturnType<typeof setTimeout> | null = null;

/** 루트 레이아웃 beforeNavigate(뒤로가기가 아닌 이동) / afterNavigate 에서. 취소된 이동에 대비해 3초 뒤 저절로 풀린다 */
export function markNavigating(on: boolean) {
	navigating = on;
	if (navTimer) clearTimeout(navTimer);
	navTimer = on ? setTimeout(() => (navigating = false), 3000) : null;
}

const ids = () => page.state.ov ?? [];

/**
 * 컴포넌트 초기화 중에 부른다. onclose = 뒤로가기로 닫혔을 때 창을 닫는 함수(버튼이 부르는 것과 같은 것).
 *  · open — 컴포넌트가 늘 떠 있고 창만 켜졌다 꺼지는 경우(새 업적 축하) 창이 보이는지. 없으면 컴포넌트가 곧 창.
 *  · auto — 사용자가 누르지 않았는데 저절로 뜨는 창. 누른 적이 없는 화면에서는 기록을 쌓지 않는다
 *    (크롬은 사용자 동작 없이 쌓인 기록을 뒤로가기에서 건너뛰어, 창은 남고 화면이 넘어가 버린다).
 */
export function backClose(onclose: () => void, opts: { auto?: boolean; open?: () => boolean } = {}) {
	let id = '';
	let closing = false;

	$effect(() => {
		if (opts.open && !opts.open()) return;
		const mine = untrack(() => {
			if (opts.auto && !navigator.userActivation?.hasBeenActive) return '';
			const next = `ov${++seq}`;
			pushState('', { ...page.state, ov: [...ids(), next] });
			return next;
		});
		id = mine;
		closing = false;
		return () => {
			// 버튼 · 바깥 누르기로 닫혔다 — 내 칸이 아직 맨 위에 있으면 걷어 낸다
			const was = id;
			id = '';
			if (!was || closing || navigating) return;
			if (untrack(ids).at(-1) === was) history.back();
		};
	});

	// 뒤로가기로 내 칸이 걷혔다 = 닫기
	$effect(() => {
		const list = ids();
		if (!id || closing || list.includes(id)) return;
		closing = true;
		untrack(onclose);
	});
}

/**
 * 방금 닫은 창의 기록 칸이 걷힐 때까지(popstate) 기다린다 — 창 두 개(편지 고르기 + 폴더 시트)를 잇달아 닫을 때,
 * 아래 창이 "내 칸이 맨 위인가"를 걷히기 전에 보면 back() 을 건너뛰어 빈 기록 칸이 남는다. 창이 없었으면 금방 끝난다.
 */
export function historySettled(ms = 600): Promise<void> {
	return new Promise((resolve) => {
		const done = () => {
			clearTimeout(timer);
			removeEventListener('popstate', done);
			setTimeout(resolve, 0);
		};
		const timer = setTimeout(done, ms);
		addEventListener('popstate', done);
	});
}

/**
 * 창을 닫으면서 다른 화면으로 — 창의 기록 칸을 새 화면으로 바꿔 끼운다(새 화면에서 뒤로 가면 창 아래 화면으로).
 * 창이 없으면 평소 goto 와 같다.
 */
export async function navigateFromOverlay(url: string, opts: { state?: App.PageState; replaceState?: boolean } = {}) {
	const open = ids().length > 0;
	markNavigating(true);
	try {
		await goto(url, { state: opts.state, replaceState: opts.replaceState || open });
	} finally {
		markNavigating(false);
	}
}
