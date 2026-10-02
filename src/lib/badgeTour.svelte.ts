import { onAccountChange } from './accountScope';

/**
 * CNSA 뱃지 안내 (Phase 84 · 89) — 프로필 안내(lib/ui/Tour.svelte)의 끝에 이어서 한 번 (lib/ui/CnsaBadgeTour.svelte).
 * 끝까지 보거나 닫으면 이 기기에 "봤음" — 이미 본 기기는 프로필 안내에서 다시 잇지 않는다. 업적 화면 CNSA 탭 · 설정 › 뱃지에서 언제든 다시.
 * (Phase 84 에는 CNSA 뱃지를 처음 받았을 때 축하 창 뒤에 저절로 떴다 — 처음 가입하면 안내 · 축하 · 알림 안내와 한꺼번에 겹쳐서 옮겼다.)
 */
const KEY = 'cnsa-tour-v1';

export const BADGE_TOUR = $state({ open: false });
onAccountChange(() => { BADGE_TOUR.open = false; });

export function badgeTourSeen(): boolean {
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return true;
	}
}

export function openBadgeTour() {
	BADGE_TOUR.open = true;
}

export function closeBadgeTour() {
	BADGE_TOUR.open = false;
	try {
		localStorage.setItem(KEY, '1');
	} catch {
		/* 무시 */
	}
}
