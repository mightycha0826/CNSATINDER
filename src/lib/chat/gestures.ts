/**
 * 말풍선 제스처 — 길게 누르기(손가락) · 두 번 톡 · 오른쪽 클릭.
 * pointer 이벤트로 직접 판정한다 (모바일 브라우저의 dblclick 은 믿을 수 없다).
 *  · 마우스는 길게 누르기 대신 오른쪽 클릭 — 누른 채 드래그로 글자를 고르는 중일 수 있다
 *  · 10px 넘게 움직이면 스크롤로 보고 길게 누르기를 취소한다
 */
export function pressGestures<T extends { id: number | null }>(opts: {
	onLong(item: T, el: Element): void;
	onDouble(item: T): void;
	longMs?: number;
	doubleMs?: number;
}) {
	const LONG_MS = opts.longMs ?? 450;
	const DOUBLE_MS = opts.doubleMs ?? 320;
	let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
	let longFired = false;
	let last = { id: -1, at: 0 };

	function cancel() {
		if (press) clearTimeout(press.timer);
		press = null;
	}

	return {
		cancel,
		down(e: PointerEvent, item: T) {
			longFired = false;
			cancel();
			if (e.button !== 0 || e.pointerType === 'mouse') return;
			const el = e.currentTarget as Element;
			press = {
				x: e.clientX,
				y: e.clientY,
				timer: setTimeout(() => {
					press = null;
					longFired = true;
					opts.onLong(item, el);
				}, LONG_MS)
			};
		},
		move(e: PointerEvent) {
			if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancel();
		},
		up(item: T) {
			cancel();
			if (longFired || item.id == null) return;
			const now = Date.now();
			if (last.id === item.id && now - last.at < DOUBLE_MS) {
				last = { id: -1, at: 0 };
				getSelection()?.removeAllRanges(); // 데스크톱 더블클릭이 고른 단어는 풀어 준다
				opts.onDouble(item);
			} else last = { id: item.id, at: now };
		},
		menu(e: MouseEvent, item: T) {
			e.preventDefault();
			cancel();
			longFired = true;
			opts.onLong(item, e.currentTarget as Element);
		}
	};
}
