/**
 * 모달 안에 포커스 가두기 — `<div role="dialog" aria-modal="true" tabindex="-1" use:focustrap>`
 * (아래 시트 · 매너 평가 · 새 업적 · AI 대화 · 운영 확인창).
 *  · 열리면 창 자체에 포커스 (화면 읽기 프로그램이 창 이름부터 읽는다. 첫 버튼이 "신고" 같은 것일 수 있어 바로 가지 않는다)
 *    `use:focustrap={'.cancel'}` 처럼 고르개를 주면 그 요소로
 *  · Tab / Shift+Tab 은 창 안에서만 돈다
 *  · 창 밖(뒤 화면)은 inert — 화면 읽기 프로그램으로 훑어도 뒤로 나가지 못한다.
 *    알림 띠 · 화면 아래 알림(aria-live)은 계속 읽히게 건드리지 않는다
 *  · 닫히면 열기 직전에 포커스가 있던 곳(여는 버튼)으로 돌려놓는다 — 그 사이 사라졌거나 다른 곳이 포커스를 가져갔으면 그대로 둔다
 * 겹쳐 열리면 맨 위 창만 가둔다.
 * 나가는 연출이 있는 창은 연출이 시작될 때 releaseTrap(창) — 사라지는 동안 뒤 화면이 inert 로 남아
 * 바로 누른 입력칸 · 버튼이 먹히지 않는 일이 없게 (UX G7.1).
 */
const RELEASE = 'focustrap:release';

/** 창이 나가기 시작했다 — 가두기를 지금 푼다(뒤 화면 inert 해제 · 포커스 돌려놓기) */
export function releaseTrap(node: Element | null | undefined) {
	node?.dispatchEvent(new Event(RELEASE));
}

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';
const LIVE = '[aria-live], [role="status"], [role="alert"]';

const stack: HTMLElement[] = [];

const focusables = (node: HTMLElement) =>
	[...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);

/** 창에서 body 까지 올라가며 곁가지를 inert 로 — 원래 inert 였던 것은 두고, 내가 건 것만 돌려놓는다 */
function inertOutside(node: HTMLElement) {
	const set: HTMLElement[] = [];
	for (let el: HTMLElement = node; el.parentElement && el !== document.body; el = el.parentElement) {
		for (const sib of el.parentElement.children) {
			if (sib === el || !(sib instanceof HTMLElement) || sib.inert || sib.matches(LIVE)) continue;
			sib.inert = true;
			set.push(sib);
		}
	}
	return () => set.forEach((el) => (el.inert = false));
}

export function focustrap(node: HTMLElement, initial?: string) {
	const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const release = inertOutside(node);
	stack.push(node);
	const first = initial ? node.querySelector<HTMLElement>(initial) : null;
	(first ?? node).focus({ preventScroll: true });

	const onkey = (e: KeyboardEvent) => {
		if (e.key !== 'Tab' || stack.at(-1) !== node) return;
		const list = focusables(node);
		const at = document.activeElement;
		const inside = at instanceof Node && node.contains(at);
		if (!list.length) {
			e.preventDefault();
			node.focus({ preventScroll: true });
		} else if (e.shiftKey && (!inside || at === node || at === list[0])) {
			e.preventDefault();
			list.at(-1)!.focus();
		} else if (!e.shiftKey && (!inside || at === list.at(-1))) {
			e.preventDefault();
			list[0].focus();
		}
	};
	// inert 를 건 뒤에 새로 붙은 요소로 포커스가 새면 창으로 되돌린다
	const onfocusin = (e: FocusEvent) => {
		if (stack.at(-1) === node && e.target instanceof Node && !node.contains(e.target)) node.focus({ preventScroll: true });
	};
	document.addEventListener('keydown', onkey);
	document.addEventListener('focusin', onfocusin);
	let done = false;
	const destroy = () => {
		if (done) return;
		done = true;
		node.removeEventListener(RELEASE, destroy);
		document.removeEventListener('keydown', onkey);
		document.removeEventListener('focusin', onfocusin);
		stack.splice(stack.indexOf(node), 1);
		release();
		// 창을 닫는 버튼이 다른 곳(입력창 등)에 포커스를 줬으면 그쪽을 존중한다
		const now = document.activeElement;
		const lost = !now || now === document.body || node.contains(now);
		if (lost && trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus({ preventScroll: true });
	};
	node.addEventListener(RELEASE, destroy);

	return { destroy };
}
