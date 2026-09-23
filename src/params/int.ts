import type { ParamMatcher } from '@sveltejs/kit';

/** [id=int] — 편지 번호 (1 이상의 정수) */
export const match: ParamMatcher = (p) => /^[1-9]\d{0,15}$/.test(p) && Number.isSafeInteger(Number(p));
