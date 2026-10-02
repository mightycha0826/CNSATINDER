import { confirm, select } from '$lib/haptics';
import { reducedMotion, scrollBehavior } from '$lib/motion';

/**
 * 배지 끌어 옮기기 (Phase 69) — 클래시로얄 덱처럼 꾹 눌러 집어 들고, 손가락을 따라 끌어, 교복 깃의 칸에 놓는다.
 *   교복의 배지 → 다른 칸 (자리 바꾸기) · 업적 목록의 메달 → 교복 칸 (대표 업적으로)
 *  · 손가락(터치 · 펜): 0.35초 꾹 누르면 집는다. 그 전에 10px 넘게 움직이면 스크롤로 보고 놓아 준다.
 *  · 마우스: 누른 채 6px 움직이면 바로 집는다.
 *  · 집은 뒤로는 스크롤을 막고(touchmove preventDefault), 화면 위 · 아래 가장자리에 가면 저절로 스크롤한다.
 *    reveal 이면 집는 순간 교복이 화면 밖에 있을 때 보이게 스크롤한다 (긴 업적 목록 아래에서 집어도).
 *  · 놓을 곳 = scope 안의 [data-drop-slot="칸 번호"] — 들고 있는 메달 가운데에서 가장 가까운 칸 (칸 크기만큼 안).
 *    끄는 동안 scope 에 data-dropping, 올라간 칸에 data-drop-over, 집은 자리에 data-drag-src — 모양은 부르는 쪽 CSS 가 그린다.
 *  · 집을 때 · 칸에 올라갈 때 톡, 놓으면 딸깍 (haptics). 칸 밖에서 놓으면 제자리로 날아가 돌아간다.
 *  · 끌고 난 뒤의 click 은 삼킨다 (누르면 여는 자세히가 같이 열리지 않게).
 * 누르기(자세히 · 대표 업적으로 걸기)는 그대로 — 끌기는 더 빠른 길일 뿐이다.
 */
type BadgeDragOpts = {
	/** 끌 수 있나 (잠긴 메달이면 false) */
	enabled?: boolean;
	/** 놓을 칸을 찾을 범위 (교복) — 늦게 생길 수 있어 함수로 */
	scope: () => HTMLElement | null | undefined;
	/** 손가락을 따라갈 모양 — 이 요소를 복제한다 (없으면 node) */
	grab?: (node: HTMLElement) => Element | null | undefined;
	/** 놓았다 — 칸 번호 (칸 밖이면 부르지 않는다) */
	ondrop: (slot: number) => void;
	/** 집을 때 교복이 화면 밖이면 보이게 스크롤 */
	reveal?: boolean;
};

const HOLD_MS = 350;
/** 손가락에 가리지 않게 메달을 손끝 위로 */
const LIFT = 34;
/** 가장자리 자동 스크롤 — 이 거리 안에서, 한 장면에 최대 이만큼 */
const EDGE = 64;
const SPEED = 14;

export function badgeDrag(node: HTMLElement, opts: BadgeDragOpts) {
	let o = opts;
	let press: { id: number; x: number; y: number; mouse: boolean; timer?: ReturnType<typeof setTimeout> } | null = null;
	let drag: {
		ghost: HTMLElement;
		src: HTMLElement;
		cx: number;
		cy: number;
		x: number;
		y: number;
		lift: number;
		over: HTMLElement | null;
		raf: number;
		/** 집은 뒤 손가락을 움직였나 — 그 전엔 가장자리 자동 스크롤을 하지 않는다 (집자마자 · 교복 보이기 스크롤과 다투지 않게) */
		moved: boolean;
		x0: number;
		y0: number;
	} | null = null;
	let swallowUntil = 0;

	const slots = () => [...(o.scope()?.querySelectorAll<HTMLElement>('[data-drop-slot]') ?? [])];
	/** 메달 가운데 (x, y) 에서 가장 가까운 칸 — 칸 크기(최소 44)만큼 안에 있을 때만 */
	function nearest(x: number, y: number) {
		let best: HTMLElement | null = null;
		let bd = Infinity;
		for (const el of slots()) {
			const r = el.getBoundingClientRect();
			const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
			if (d < Math.max(44, r.width) && d < bd) {
				best = el;
				bd = d;
			}
		}
		return best;
	}

	function place() {
		if (!drag) return;
		const { ghost, cx, cy, x, y, lift } = drag;
		ghost.style.transform = `translate(${x - cx}px, ${y - lift - cy}px) scale(1.2)`;
		const over = nearest(x, y - lift);
		if (over !== drag.over) {
			drag.over?.removeAttribute('data-drop-over');
			over?.setAttribute('data-drop-over', '');
			if (over) select();
			drag.over = over;
		}
	}

	/** 가장자리 자동 스크롤 — 끄는 동안 매 장면 */
	function edgeScroll() {
		if (!drag) return;
		if (!drag.moved) {
			drag.raf = requestAnimationFrame(edgeScroll);
			return;
		}
		const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
		const { y } = drag;
		const d = y < top + EDGE ? -(top + EDGE - y) : y > innerHeight - EDGE ? y - (innerHeight - EDGE) : 0;
		if (d) {
			window.scrollBy(0, Math.max(-SPEED, Math.min(SPEED, d / 3)));
			place();
		}
		drag.raf = requestAnimationFrame(edgeScroll);
	}

	function start() {
		if (!press || drag) return;
		clearTimeout(press.timer);
		const src = (o.grab?.(node) ?? node) as HTMLElement;
		const r = src.getBoundingClientRect();
		const ghost = src.cloneNode(true) as HTMLElement;
		ghost.setAttribute('aria-hidden', 'true');
		ghost.removeAttribute('data-drop-slot');
		ghost.classList.add('drag-ghost');
		Object.assign(ghost.style, {
			position: 'fixed',
			left: `${r.left}px`,
			top: `${r.top}px`,
			width: `${r.width}px`,
			height: `${r.height}px`,
			margin: '0',
			zIndex: '1000',
			pointerEvents: 'none',
			rotate: '0deg',
			filter: 'drop-shadow(0 10px 12px rgb(0 0 0 / 0.35))',
			transition: 'transform 0.08s ease-out'
		});
		document.body.appendChild(ghost);
		src.setAttribute('data-drag-src', '');
		o.scope()?.setAttribute('data-dropping', '');
		drag = {
			ghost,
			src,
			cx: r.left + r.width / 2,
			cy: r.top + r.height / 2,
			x: press.x,
			y: press.y,
			lift: press.mouse ? 0 : LIFT,
			over: null,
			raf: 0,
			moved: false,
			x0: press.x,
			y0: press.y
		};
		try {
			node.setPointerCapture(press.id);
		} catch {
			/* 이미 끝난 포인터 */
		}
		select();
		place();
		drag.raf = requestAnimationFrame(edgeScroll);
		// 긴 목록 아래에서 집었으면 교복이 보이게 (메달은 손가락에 붙어 있다)
		const scope = o.scope();
		if (o.reveal && scope) {
			const s = scope.getBoundingClientRect();
			const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
			if (s.top < top || s.bottom > innerHeight) window.scrollBy({ top: s.top - top - 8, behavior: scrollBehavior() });
		}
	}

	/** 끝 — 칸에 놓았으면 그 칸으로 빨려 들어가고, 아니면 제자리로 날아간다 */
	function finish(drop: boolean) {
		clearTimeout(press?.timer);
		press = null;
		if (!drag) return;
		const { ghost, src, over, raf, cx, cy } = drag;
		drag = null;
		cancelAnimationFrame(raf);
		o.scope()?.removeAttribute('data-dropping');
		over?.removeAttribute('data-drop-over');
		swallowUntil = performance.now() + 500;
		const slot = drop && over ? Number(over.dataset.dropSlot) : NaN;
		const hit = Number.isFinite(slot);
		const done = () => {
			ghost.remove();
			src.removeAttribute('data-drag-src');
		};
		if (reducedMotion()) done();
		else {
			const to = (hit ? over! : src).getBoundingClientRect();
			ghost.style.transition = 'transform 0.2s cubic-bezier(0.3, 0.8, 0.3, 1), opacity 0.2s';
			ghost.style.transform = `translate(${to.left + to.width / 2 - cx}px, ${to.top + to.height / 2 - cy}px) scale(${hit ? 0.8 : 1})`;
			if (hit) ghost.style.opacity = '0';
			setTimeout(done, 210);
		}
		if (hit) {
			confirm();
			o.ondrop(slot);
		}
	}

	function down(e: PointerEvent) {
		if (o.enabled === false || !e.isPrimary || e.button !== 0 || drag) return;
		const mouse = e.pointerType === 'mouse';
		press = { id: e.pointerId, x: e.clientX, y: e.clientY, mouse };
		if (!mouse) press.timer = setTimeout(start, HOLD_MS);
	}
	function move(e: PointerEvent) {
		if (!press || e.pointerId !== press.id) return;
		if (drag) {
			drag.x = e.clientX;
			drag.y = e.clientY;
			if (!drag.moved && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > 12) drag.moved = true;
			place();
			return;
		}
		const d = Math.hypot(e.clientX - press.x, e.clientY - press.y);
		if (press.mouse) {
			if (d > 6) {
				press.x = e.clientX;
				press.y = e.clientY;
				start();
			}
		} else if (d > 10) {
			// 집기 전에 움직였다 — 스크롤
			clearTimeout(press.timer);
			press = null;
		}
	}
	const up = (e: PointerEvent) => press?.id === e.pointerId && finish(true);
	const cancel = (e: PointerEvent) => press?.id === e.pointerId && finish(false);
	/** 집은 뒤로는 화면이 스크롤되지 않게 (passive: false 여야 막힌다) */
	const touchmove = (e: TouchEvent) => {
		if (drag && e.cancelable) e.preventDefault();
	};
	/** 안드로이드의 길게 누르기 메뉴 · 아이폰 돋보기 대신 집기 */
	const menu = (e: Event) => {
		if (press || drag) e.preventDefault();
	};
	const click = (e: MouseEvent) => {
		if (performance.now() < swallowUntil) {
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	};

	/** 끌 수 있을 때만 표시 — 길게 누르기 메뉴 막기 · 당겨서 새로고침 빼기가 이걸 본다 */
	const mark = () => (o.enabled === false ? node.removeAttribute('data-drag') : node.setAttribute('data-drag', ''));
	mark();
	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('touchmove', touchmove, { passive: false });
	node.addEventListener('contextmenu', menu);
	node.addEventListener('click', click, true);

	return {
		update(next: BadgeDragOpts) {
			o = next;
			mark();
		},
		destroy() {
			finish(false);
			node.removeAttribute('data-drag');
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('touchmove', touchmove);
			node.removeEventListener('contextmenu', menu);
			node.removeEventListener('click', click, true);
		}
	};
}
