import { rpc } from './rpc';

/**
 * 업적 (Phase 31) — 동 · 은 · 금 메달. 업적 정의(이름 · 기준)는 DB 가 유일한 출처라 여기엔 타입과 RPC · 표시용 도움 함수만.
 * 서버: supabase/schema.sql Phase 31 (private.achievement_defs · user_stats · user_achievements).
 */
export type Tier = 0 | 1 | 2 | 3;
export type Category = 'chat' | 'manner' | 'letter' | 'special';

/** 상대 프로필 · 대표 업적에 쓰는 짧은 모양 */
export type BadgeLite = { code: string; title: string; icon: string; tier: Tier };

export type Achievement = BadgeLite & {
	description: string;
	category: Category;
	unit: string;
	/** 개척자처럼 작을수록 좋은 것 */
	lower_better: boolean;
	/** [동, 은, 금] 기준 */
	tiers: [number, number, number];
	earned_at: string | null;
	value: number;
	/** 마지막으로 본 뒤에 새로 땄거나 올랐다 */
	new: boolean;
};

export type MyAchievements = { items: Achievement[]; featured: BadgeLite[]; chosen: string[] };

export const TIER_NAME: Record<Tier, string> = { 0: '잠김', 1: '동', 2: '은', 3: '금' };

export const CATEGORIES: { k: Category | 'all'; label: string }[] = [
	{ k: 'all', label: '전체' },
	{ k: 'chat', label: '대화' },
	{ k: 'manner', label: '매너' },
	{ k: 'letter', label: '편지' },
	{ k: 'special', label: '특별' }
];

/** 비어 있으면(Phase 31 전 DB 등) 오류로 — 화면이 "불러오지 못했어요"를 띄운다 */
export async function fetchMyAchievements(): Promise<MyAchievements> {
	const r = await rpc<MyAchievements | null>('my_achievements');
	if (!r?.items) throw new Error('no_achievements');
	return r;
}
/** 새로 딴 업적 — Phase 31 전 DB 면 빈 목록 */
export const fetchNewAchievements = () =>
	rpc<BadgeLite[] | null>('new_achievements').then((r) => r ?? [], () => [] as BadgeLite[]);
export const markAchievementsSeen = () => rpc<void>('mark_achievements_seen');
export const setFeaturedBadges = (codes: string[]) =>
	rpc<{ status: 'ok' | 'too_many' | 'not_owned'; featured?: BadgeLite[] }>('set_featured_badges', { p_codes: codes });

/** 다음 등급 기준 (금이면 null) */
export function nextGoal(a: Achievement): number | null {
	return a.tier >= 3 ? null : a.tiers[a.tier as 0 | 1 | 2];
}

/** 다음 등급까지 얼마나 왔는지 (0~1) — 작을수록 좋은 것(개척자)은 이미 정해져 있어 따로 채우지 않는다 */
export function progress(a: Achievement): number {
	if (a.tier >= 3) return 1;
	if (a.lower_better) return a.tier > 0 ? 1 : 0;
	const goal = a.tiers[a.tier as 0 | 1 | 2];
	const from = a.tier > 0 ? a.tiers[a.tier - 1] : 0;
	return Math.max(0, Math.min(1, (a.value - from) / Math.max(1, goal - from)));
}

/** "12 / 20번" · "41.2 / 42도" · "가입 7번째" */
export function progressText(a: Achievement): string {
	const v = a.unit === '도' ? a.value.toFixed(1) : String(Math.floor(a.value));
	if (a.lower_better) return `가입 ${v}${a.unit}`;
	const goal = nextGoal(a);
	return goal == null ? `${v}${a.unit} · 최고 등급` : `${v} / ${goal}${a.unit}`;
}

/** 등급 기준 한 줄 — "동 5번 · 은 20번 · 금 50번" / 개척자 "1000번째 안" */
export function tierLine(a: Achievement, t: 1 | 2 | 3): string {
	const n = a.tiers[t - 1];
	return a.lower_better ? `${n}${a.unit} 안` : `${n}${a.unit}`;
}
