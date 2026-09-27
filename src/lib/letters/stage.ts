import { reducedMotion } from '../motion';

/**
 * 봉투 연출 단계 (Phase 32) — [시각(ms), 할 일] 을 차례로 실행한다. 돌려준 함수를 부르면 남은 단계를 멈춘다 (화면을 떠날 때).
 * 동작 줄이기면 중간 단계 없이 마지막 단계만 곧바로.
 */
export function play(steps: [number, () => void][]): () => void {
	if (reducedMotion()) {
		steps.at(-1)?.[1]();
		return () => {};
	}
	const timers = steps.map(([t, fn]) => setTimeout(fn, t));
	return () => timers.forEach(clearTimeout);
}

/** 화면 폭에 맞춘 봉투 너비 — 양옆 여백을 두고 최대 max */
export const envWidth = (vw: number, max = 340, gutter = 48) => Math.max(240, Math.min(max, vw - gutter));
