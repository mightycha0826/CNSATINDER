import type { BadgeLite } from './achievements';
import { onAccountChange } from './accountScope';

/**
 * 남의 업적 메달 자세히 (Phase 44) — 대화 맨 위 소개 · 상대 프로필 시트의 메달을 누르면 뜬다 (BadgeSheet, 루트 레이아웃에 하나).
 * 프로필 시트 안에서 또 시트를 열면 겹친 시트가 틀 안에 갇히므로, 창은 앱 맨 위에 하나만 두고 여기서 연다.
 */
export const BADGE_SHEET = $state({ cur: null as BadgeLite | null });
onAccountChange(() => { BADGE_SHEET.cur = null; });

export const openBadge = (b: BadgeLite) => (BADGE_SHEET.cur = b);
export const closeBadge = () => (BADGE_SHEET.cur = null);
