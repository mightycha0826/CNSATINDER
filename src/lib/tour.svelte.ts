/**
 * 처음 사용법 안내 (튜토리얼, Phase 44) — 처음 홈에 왔을 때 한 단계씩 (lib/ui/Tour.svelte). 건너뛰거나 끝까지 보면 이 기기에 "봤음".
 * 설정 › 앱 › "사용법 다시 보기"로 언제든 다시 (replayTour → 홈으로 가면 처음부터).
 * 자동 화면 테스트(navigator.webdriver)에서는 저절로 띄우지 않는다 — 모든 테스트가 안내를 먼저 닫아야 하므로. 주소에 ?tour 를 붙이면 띄운다.
 */
const KEY = 'tour-v1';

export const TOUR = $state({ replay: false });

export function tourSeen(): boolean {
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return true; // 저장소를 못 쓰면 매번 띄우지 않게
	}
}

export function markTourSeen() {
	TOUR.replay = false;
	try {
		localStorage.setItem(KEY, '1');
	} catch {
		/* 무시 */
	}
}

/** 설정에서 — 다음에 홈에 가면 처음부터 */
export function replayTour() {
	TOUR.replay = true;
}

/** 저절로 띄워도 되는 환경인가 — 자동 테스트는 ?tour 가 있을 때만 */
export const autoTourAllowed = () =>
	typeof navigator === 'undefined' || !navigator.webdriver || new URLSearchParams(location.search).has('tour');
