/**
 * 햅틱 (docs/UX-GUIDELINES.md G9) — navigator.vibrate 를 직접 부르지 말고 이 함수들만 쓴다.
 * 안드로이드 크롬에서만 느껴진다. iOS 는 Vibration API 가 없어 아무 일도 없다 — 그래서 진동에만 기대는 신호를 만들지 않는다
 * (항상 화면 반응과 함께). 동작 줄이기와는 별개(진동은 움직임이 아니다). 설정 › 알림 › 진동을 끄면 울리지 않는다 (Phase 43).
 */
import { PREFS } from './prefs.svelte';

function buzz(pattern: number | number[]) {
	if (!PREFS.haptics) return;
	try {
		navigator.vibrate?.(pattern);
	} catch {
		/* 권한 · 정책으로 막힌 환경 */
	}
}

/** 고르기가 열림 · 하트 · 밀어서 답장 문턱 · 당겨서 새로고침 문턱 */
export const select = () => buzz(8);
/** 메시지 보냄 · 투표 · 저장 */
export const confirm = () => buzz(12);
/** 편지 보냄 · 업적 */
export const success = () => buzz([10, 40, 18]);
/** 되돌릴 수 없는 동작을 한 번 더 확인할 때 */
export const warn = () => buzz([30, 60, 30]);
/** 매칭 연결 */
export const match = () => buzz(60);
