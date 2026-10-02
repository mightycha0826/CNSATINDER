import { rpc } from './rpc';

/**
 * 매너 온도 (Phase 30) — 모두 40.0도에서 시작. 대화가 끝난 뒤(또는 고정한 대화에서) 상대를 평가하고,
 * 서버가 매일 새벽 모아서 반영한다 (supabase/schema.sql Phase 30). 여기는 화면 쪽: 온도의 색 · 말, 평가 선택지, RPC.
 */
export const BASE_TEMP = 40;

export type Score = 'good' | 'ok' | 'bad';
export type Reason = 'kind' | 'fun' | 'listen' | 'fast' | 'manner' | 'rude' | 'dry' | 'uncomfy' | 'spam';

/** 왼쪽부터 아쉬움 → 좋음 (서버 check 와 같은 값) */
export const SCORES: { k: Score; label: string; face: string }[] = [
	{ k: 'bad', label: '아쉬웠어요', face: '😕' },
	{ k: 'ok', label: '괜찮았어요', face: '🙂' },
	{ k: 'good', label: '좋았어요', face: '😊' }
];
/** 좋았어요 · 괜찮았어요일 때 고르는 칩 / 아쉬웠어요일 때 고르는 칩 — 서버가 섞인 것은 거절한다 */
const GOOD_REASONS: { k: Reason; label: string }[] = [
	{ k: 'kind', label: '친절해요' },
	{ k: 'fun', label: '대화가 재밌어요' },
	{ k: 'listen', label: '잘 들어줘요' },
	{ k: 'fast', label: '답이 빨라요' },
	{ k: 'manner', label: '예의 발라요' }
];
const BAD_REASONS: { k: Reason; label: string }[] = [
	{ k: 'rude', label: '무례해요' },
	{ k: 'dry', label: '성의가 없어요' },
	{ k: 'uncomfy', label: '불편한 질문을 해요' },
	{ k: 'spam', label: '도배해요' }
];
export const reasonsFor = (s: Score) => (s === 'bad' ? BAD_REASONS : GOOD_REASONS);

/**
 * 온도 → 색 · 말 · 표정 (당근식 온도계 톤: 차가울수록 파랑, 따뜻할수록 주황 · 빨강).
 * color = 밝은 바탕용(흰 바탕 위 4.5:1), dark = 어두운 바탕용 — 한 색으로는 두 바탕 모두에서 읽히게 할 수 없다.
 */
export function tempLook(t: number) {
	if (t < 30) return { color: '#1f58c2', dark: '#6ea1ff', label: '차가워요', face: '🥶' };
	if (t < 36.5) return { color: '#2267d8', dark: '#6aa6ff', label: '조금 서늘해요', face: '😶' };
	if (t < 40.5) return { color: '#0e8577', dark: '#2cc7b3', label: '보통이에요', face: '🙂' };
	if (t < 44) return { color: '#26843a', dark: '#4fcb67', label: '따뜻해요', face: '😊' };
	if (t < 50) return { color: '#b45a09', dark: '#ffa04d', label: '아주 따뜻해요', face: '😄' };
	return { color: '#d13438', dark: '#ff7074', label: '뜨거워요', face: '🥰' };
}

/** 막대 채움 (%) — 20도 ~ 60도를 막대 전체로 (40도 = 가운데) */
export const tempFill = (t: number) => Math.max(4, Math.min(100, ((t - 20) / 40) * 100));

export const fmtTemp = (t: number) => `${t.toFixed(1)}°C`;

export type PendingRating = { room_id: string; partner_alias: string; pinned: boolean };
export type RateStatus = 'ok' | 'already' | 'not_eligible' | 'bad_input';

/** 아직 평가하지 않은 대화 (홈 카드) — Phase 30 전 DB 면 빈 목록 */
export const fetchPendingRatings = () =>
	rpc<PendingRating[] | null>('pending_ratings').then((r) => r ?? [], () => [] as PendingRating[]);

export async function ratePartner(roomId: string, score: Score, reasons: Reason[]): Promise<RateStatus> {
	return (await rpc<{ status: RateStatus }>('rate_partner', { p_room: roomId, p_score: score, p_reasons: reasons })).status;
}

/** 홈 카드에서 "건너뛰기"한 대화 — 이 기기에만 */
const SKIP_KEY = 'rate-skip-v1';
export function skippedRatings(): Set<string> {
	try {
		return new Set(JSON.parse(localStorage.getItem(SKIP_KEY) ?? '[]') as string[]);
	} catch {
		return new Set();
	}
}
export function skipRating(roomId: string) {
	try {
		const s = [...skippedRatings(), roomId].slice(-50);
		localStorage.setItem(SKIP_KEY, JSON.stringify(s));
	} catch {
		/* 저장소를 못 쓰면 이번만 숨긴다 */
	}
}
