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

/**
 * 밀어서 답장 — 말풍선을 옆으로(왼쪽이든 오른쪽이든) 밀었다 놓으면 답장 (인스타 · 카톡처럼).
 *  · 손가락(터치 · 펜)만. 마우스는 드래그가 글자 고르기라 오른쪽 클릭 → "답장"
 *  · 처음 움직임이 옆으로 더 크면 밀기, 위아래가 크면 스크롤로 보고 손을 뗀다 (말풍선의 touch-action: pan-y)
 *  · threshold 를 넘으면 한 번 진동 · 놓으면 onReply. 넘은 뒤로는 덜 따라와서(고무줄) 멀리 끌려가지 않는다
 * 보여 줄 거리는 onMove(item, dx) 로 넘기고(0 = 제자리), 화면은 부르는 쪽이 그린다.
 */
export function swipeReply<T>(opts: {
	onMove(item: T | null, dx: number): void;
	onReply(item: T): void;
	threshold?: number;
}) {
	const LIMIT = opts.threshold ?? 64;
	let s: { item: T; x: number; y: number; id: number; on: boolean; hit: boolean } | null = null;

	/** 끌린 거리 → 보여 줄 거리 (threshold 뒤로는 30% 만, 최대 threshold + 28) */
	const shown = (dx: number) => {
		const a = Math.abs(dx);
		return Math.sign(dx) * (a <= LIMIT ? a : Math.min(LIMIT + (a - LIMIT) * 0.3, LIMIT + 28));
	};

	function reset() {
		if (s?.on) opts.onMove(null, 0);
		s = null;
	}

	return {
		down(e: PointerEvent, item: T) {
			s = null;
			if (e.pointerType === 'mouse' || e.button !== 0) return;
			s = { item, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, hit: false };
		},
		move(e: PointerEvent) {
			if (!s || e.pointerId !== s.id) return;
			const dx = e.clientX - s.x, dy = e.clientY - s.y;
			if (!s.on) {
				if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) return void (s = null); // 스크롤
				if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
				s.on = true;
				// 말풍선 밖으로 나가도 계속 받는다 (pointerleave 로 끊기지 않게)
				try {
					(e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId);
				} catch {
					/* 이미 끝난 포인터 — 캡처 없이도 밀기는 된다 */
				}
			}
			const hit = Math.abs(dx) >= LIMIT;
			if (hit && !s.hit) navigator.vibrate?.(10);
			s.hit = hit;
			opts.onMove(s.item, shown(dx));
		},
		/** 손을 뗐다 — 밀기였으면 true (그 탭은 두 번 톡 · 길게 누르기로 세지 않는다) */
		up(): boolean {
			if (!s?.on) return (s = null), false;
			const { item, hit } = s;
			reset();
			if (hit) opts.onReply(item);
			return true;
		},
		cancel() {
			reset();
		},
		/** 지금 옆으로 미는 중인가 — 말풍선의 손 떼기가 줄(row)의 손 떼기보다 먼저 와서, 톡으로 셀지 여기서 묻는다 */
		get active() {
			return !!s?.on;
		}
	};
}
