import { autoTourAllowed } from './tour.svelte';
import { onAccountChange } from './accountScope';

/**
 * CNSA 뱃지 안내 (Phase 84) — CNSA 뱃지를 처음 받으면(새 업적 축하를 닫을 때) 한 번 (lib/ui/CnsaBadgeTour.svelte).
 * 끝까지 보거나 닫으면 이 기기에 "봤음". 업적 화면 CNSA 탭 · 설정 › 뱃지에서 언제든 다시.
 * 자동 화면 테스트(navigator.webdriver)에서는 저절로 띄우지 않는다 — 주소에 ?tour 를 붙이면 띄운다 (lib/tour.svelte.ts 와 같은 규칙).
 */
const KEY = 'cnsa-tour-v1';

export const BADGE_TOUR = $state({ open: false });
onAccountChange(() => { BADGE_TOUR.open = false; });

function badgeTourSeen(): boolean {
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return true;
	}
}

export function openBadgeTour() {
	BADGE_TOUR.open = true;
}

/** 새 업적 축하를 닫을 때 — CNSA 뱃지를 받았고 아직 안내를 못 봤으면 */
export function maybeOpenBadgeTour(gotCnsa: boolean) {
	if (gotCnsa && !badgeTourSeen() && autoTourAllowed()) BADGE_TOUR.open = true;
}

export function closeBadgeTour() {
	BADGE_TOUR.open = false;
	try {
		localStorage.setItem(KEY, '1');
	} catch {
		/* 무시 */
	}
}
