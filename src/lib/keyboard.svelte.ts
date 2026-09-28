/**
 * 휴대폰 키보드 (Phase 41) — 앱 전체가 같은 값을 쓴다. 루트 레이아웃이 한 번 켠다 (trackKeyboard).
 *
 * 두 플랫폼이 다르게 움직인다:
 *   · 안드로이드 크롬 (viewport 의 interactive-widget=resizes-content): 키보드만큼 화면(레이아웃) 자체가 줄어든다 → 겹침 0
 *   · 아이폰 사파리 · 설치 앱: 화면은 그대로이고 "보이는 영역"(visualViewport)만 줄어든다. 입력칸이 보이게 페이지를 위로 밀기도 한다
 *     → 화면 아래에 붙은 것(토스트 · 보내기 줄 · 시트)은 키보드 뒤에 숨고, 화면 전체를 쓰는 창(대화방 · AI 대화)은 머리글이 밀려 올라간다
 * 그래서 <html> 에 실제로 보이는 영역을 적어 둔다:
 *   --vvh    보이는 영역의 높이 (px) — 화면 전체를 쓰는 창의 높이로
 *   --vv-top 보이는 영역이 밀려 내려간 만큼 (px) — 그 창을 그만큼 내려서 보이는 영역에 딱 맞춘다
 *   --kb     키보드가 레이아웃 아래를 가린 높이 (px, 아이폰만 0 보다 크다) — 아래에 붙은 것을 그만큼 올린다
 *   html.kb-open  입력칸에 들어가 키보드가 떠 있다 — 탭바를 숨긴다 (좁아진 화면을 탭바가 더 먹지 않게)
 *
 * 키보드 내리기 (Phase 46, dismissOnTap · dismissKeyboard) — 아이폰은 버튼을 눌러도 입력칸에서 초점이 빠지지 않고,
 * 입력칸이 화면에서 사라져도 키보드가 그대로 남는다 (찾기 → 고르기 뒤에 찾을 때의 키보드가 떠 있던 것).
 * 그래서 입력 중에 버튼 · 링크 · 고르기 항목을 누르면 직접 내리고, 다른 화면으로 갈 때도 내린다.
 * 계속 쳐야 하는 곳(대화 입력 줄 · 공감 고르기 줄 · 편지 서식 막대)은 data-keep-kb 로 뺀다 — 거기 버튼은 스스로 입력칸에 초점을 돌려준다.
 */
import { untrack } from 'svelte';

export const KB = $state({ open: false, h: 0 });

const editable = (el: Element | null) =>
	!!el && (el.matches('textarea, select, [contenteditable="true"]') || (el.matches('input') && !/^(checkbox|radio|button|submit|range|color|file)$/.test((el as HTMLInputElement).type)));

/** 입력칸에 있으면 나온다 — 키보드가 내려간다 */
export function dismissKeyboard() {
	const a = document.activeElement;
	if (editable(a)) (a as HTMLElement).blur();
}

/** 이것들을 누르면 입력이 끝난 것으로 본다. 빈 곳 · 말풍선을 누르는 건 그대로 둔다 (두 번 톡 · 길게 누르기를 흔들지 않게) */
const TAPPABLE = 'button, a[href], [role="button"], [role="option"], [role="radio"], [role="tab"], [role="switch"], [role="menuitem"], summary';

/** 입력 중에 버튼 · 링크 · 고르기 항목을 누르면 키보드를 내린다 — 운영자 화면도 같이 (루트 레이아웃이 켠다) */
export function dismissOnTap(): () => void {
	// click · 잡기 단계 — 누른 것이 정해진 뒤라 키보드가 내려가며 화면이 움직여도 엉뚱한 것이 눌리지 않고,
	// 버튼 자신의 처리보다 먼저라 그 처리가 다른 입력칸에 초점을 주면 그대로 된다
	const onclick = (e: MouseEvent) => {
		const a = document.activeElement;
		if (!editable(a)) return;
		const t = e.target instanceof Element ? e.target.closest(TAPPABLE) : null;
		if (!t || editable(t) || a!.contains(t) || t.closest('[data-keep-kb]')) return;
		(a as HTMLElement).blur();
	};
	document.addEventListener('click', onclick, true);
	return () => document.removeEventListener('click', onclick, true);
}

export function trackKeyboard(): () => void {
	const vv = window.visualViewport;
	const root = document.documentElement;
	// 키보드가 없을 때의 가장 큰 높이 — 안드로이드는 키보드가 뜨면 innerHeight 자체가 줄어서, 이것과 비교해야 안다. 화면을 돌리면(폭이 바뀌면) 다시 잰다
	let full = window.innerHeight;
	let width = window.innerWidth;
	let raf = 0;

	const sync = () => {
		raf = 0;
		const h = vv?.height ?? window.innerHeight;
		const top = vv?.offsetTop ?? 0;
		const focused = editable(document.activeElement);
		// 화면을 돌렸으면 다시 잰다 — 입력 중이 아닐 때만 (키보드가 뜨고 지는 사이 폭이 잠깐 흔들려도 기준을 잃지 않게)
		if (!focused && window.innerWidth !== width) {
			width = window.innerWidth;
			full = window.innerHeight;
		}
		if (!focused) full = Math.max(full, window.innerHeight);
		// 아이폰: 레이아웃 아래가 키보드에 가린 만큼 / 안드로이드: 레이아웃이 이미 줄어서 0
		const kb = Math.max(0, Math.round(window.innerHeight - h - top));
		const open = focused && (kb > 80 || full - h > 150);
		// 바뀐 것만 쓴다 — 스크롤 중에도 불리므로 같은 값으로 문서 전체 스타일을 다시 계산하게 하지 않게
		set('--vvh', `${Math.round(h)}px`);
		set('--vv-top', `${Math.round(top)}px`);
		set('--kb', `${open ? kb : 0}px`);
		if (KB.open !== open) {
			root.classList.toggle('kb-open', open);
			KB.open = open;
		}
		if (KB.h !== (open ? kb : 0)) KB.h = open ? kb : 0;
	};
	const last: Record<string, string> = {};
	const set = (p: string, v: string) => {
		if (last[p] === v) return;
		last[p] = v;
		root.style.setProperty(p, v);
	};
	const soon = () => {
		if (!raf) raf = requestAnimationFrame(sync);
	};
	// 입력칸에서 나올 때 — 키보드가 내려가는 동안 visualViewport 가 조용할 때가 있어 조금 뒤에 한 번 더
	const blur = () => {
		soon();
		setTimeout(soon, 350);
	};

	// untrack — 켜는 쪽($effect)이 KB 를 읽은 것으로 잡혀, 키보드가 뜰 때마다 처음부터 다시 켜지며 기준 높이를 잃지 않게 (G14.2)
	untrack(sync);
	vv?.addEventListener('resize', soon);
	vv?.addEventListener('scroll', soon);
	window.addEventListener('resize', soon);
	document.addEventListener('focusin', soon);
	document.addEventListener('focusout', blur);
	return () => {
		cancelAnimationFrame(raf);
		vv?.removeEventListener('resize', soon);
		vv?.removeEventListener('scroll', soon);
		window.removeEventListener('resize', soon);
		document.removeEventListener('focusin', soon);
		document.removeEventListener('focusout', blur);
		for (const p of ['--vvh', '--vv-top', '--kb']) root.style.removeProperty(p);
		root.classList.remove('kb-open');
	};
}
