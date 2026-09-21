import { untrack } from 'svelte';

/**
 * 화면 아래 알림(토스트).
 *
 * ★ 버그 수정 기록 (2026-09-21) — "알림이 시간이 지나도 사라지지 않음"
 *   Svelte 5 의 $state 배열은 넣은 객체를 감시용 proxy 로 감싸 저장한다.
 *   예전 코드는 원본 객체로 indexOf(t) 를 했기 때문에 항상 -1 → 지워지지 않았고,
 *   원본의 t.out = true 도 화면에 반영되지 않았다.
 *   → 항상 id 로 찾는다. 배열에서 꺼낸 값(proxy)만 수정한다.
 *
 * ★ untrack: toast() 는 목록을 읽고 쓰므로, $effect 안에서 부르면 그 effect 가 목록을 구독해
 *   자기가 바꾼 값에 다시 반응하는 무한 반복(effect_update_depth_exceeded)이 생길 수 있다.
 *   어디서 불러도 안전하도록 내부를 추적에서 뺀다.
 */
export type Toast = { id: number; text: string; out: boolean };

export const toasts = $state<Toast[]>([]);

const SHOW_MS = 2400;
const FADE_MS = 260;
const MAX = 3; // 한꺼번에 여러 개가 쌓여 화면을 덮지 않게

let seq = 0;

export function toast(text: string, ms = SHOW_MS) {
	untrack(() => {
		const id = ++seq;
		toasts.push({ id, text, out: false });
		while (toasts.length > MAX) toasts.shift();

		setTimeout(() => {
			const t = toasts.find((x) => x.id === id); // proxy 를 꺼내 수정해야 화면이 바뀐다
			if (t) t.out = true;
			setTimeout(() => {
				const i = toasts.findIndex((x) => x.id === id);
				if (i >= 0) toasts.splice(i, 1);
			}, FADE_MS);
		}, ms);
	});
}
