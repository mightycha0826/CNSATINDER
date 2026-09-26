/**
 * 목록 줄 길게 누르기 — `<button use:longpress={() => openMenu(item)}>` (대화 목록 · 편지 목록).
 *  · 손가락: 450ms 누르고 있으면 한 번 진동하고 부른다. 10px 넘게 움직이면(스크롤) 취소
 *  · 마우스: 오른쪽 클릭 (안드로이드 크롬은 길게 누르면 contextmenu 도 보낸다 — 한 번만 부르게 막는다)
 *  · 길게 누른 뒤 손을 떼면 오는 click 은 삼킨다 (메뉴만 뜨고 화면이 넘어가지 않게)
 */
export function longpress(node: HTMLElement, fn: () => void) {
	let cb = fn;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let start = { x: 0, y: 0 };
	let fired = false;

	const cancel = () => {
		if (timer) clearTimeout(timer);
		timer = null;
	};
	const fire = () => {
		cancel();
		fired = true;
		navigator.vibrate?.(10);
		cb();
	};
	const down = (e: PointerEvent) => {
		fired = false;
		cancel();
		if (e.pointerType === 'mouse' || e.button !== 0) return;
		start = { x: e.clientX, y: e.clientY };
		timer = setTimeout(fire, 450);
	};
	const move = (e: PointerEvent) => {
		if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
	};
	const menu = (e: MouseEvent) => {
		e.preventDefault();
		if (!fired) fire();
	};
	const click = (e: MouseEvent) => {
		if (!fired) return;
		fired = false;
		e.preventDefault();
		e.stopImmediatePropagation();
	};

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', cancel);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('pointerleave', cancel);
	node.addEventListener('contextmenu', menu);
	node.addEventListener('click', click, true);
	node.style.setProperty('-webkit-touch-callout', 'none');

	return {
		update(next: () => void) {
			cb = next;
		},
		destroy() {
			cancel();
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', cancel);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('pointerleave', cancel);
			node.removeEventListener('contextmenu', menu);
			node.removeEventListener('click', click, true);
		}
	};
}
