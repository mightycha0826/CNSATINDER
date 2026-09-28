import { innerWidth } from 'svelte/reactivity/window';
import { reducedMotion } from '../motion';
import { PREFS } from '../prefs.svelte';

/**
 * 봉투 연출 단계 (Phase 32) — [시각(ms), 할 일] 을 차례로 실행한다. 돌려준 함수를 부르면 남은 단계를 멈춘다 (화면을 떠날 때).
 * 동작 줄이기 · 설정 › 편지 › "봉투 여는 장면"을 껐으면(Phase 43) 중간 단계 없이 마지막 단계만 곧바로.
 */
export function play(steps: [number, () => void][]): () => void {
	if (reducedMotion() || !PREFS.envelope) {
		steps.at(-1)?.[1]();
		return () => {};
	}
	const timers = steps.map(([t, fn]) => setTimeout(fn, t));
	return () => timers.forEach(clearTimeout);
}

/** 화면 폭에 맞춘 봉투 너비 — 양옆 여백을 두고 최대 max. 창 폭(innerWidth)을 읽으므로 $derived 안에서 부르면 화면을 돌려도 따라 바뀐다 */
export const envWidth = (max = 340, gutter = 48) => Math.max(240, Math.min(max, (innerWidth.current ?? 390) - gutter));

/** 봉투를 살짝씩 비뚤게 — 책상 위에 막 도착한 편지처럼 (편지함 · 보관함) */
export const tilt = (i: number) => [-1.6, 1.2, -0.6, 1.8, -1.2, 0.8][i % 6];
