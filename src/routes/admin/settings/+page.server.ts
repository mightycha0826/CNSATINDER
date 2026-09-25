import { fail } from '@sveltejs/kit';
import { adminRpc } from '$lib/server/supabaseAdmin';
import { checkAi } from '$lib/server/ai';
import { friendly, isAdmin } from '$lib/server/adminAuth';
import type { Actions, PageServerLoad } from './$types';

export type AppSettings = {
	is_open: boolean;
	notice: string;
	room_minutes: number;
	extend_minutes: number;
	vote_window_sec: number;
	max_rounds: number;
	rematch_cooldown_days: number;
	auto_suspend_reports: number;
	max_open_rooms: number;
	/** Phase 19 — DB 패치 전이면 없음 */
	ai_moderation?: boolean;
	ai_mod_daily_cap?: number;
	ai_chat?: boolean;
	ai_chat_per_user?: number;
	ai_chat_daily_cap?: number;
	ai_chat_minutes?: number;
	ai_chat_max_turns?: number;
};

export type AiUsage = {
	mod_checked_today: number;
	mod_flagged_today: number;
	mod_pending: number;
	ai_chats_today: number;
};

export const load: PageServerLoad = async () => {
	const [s, usage, terms] = await Promise.all([
		adminRpc<AppSettings>('admin_get_settings'),
		// Phase 19 함수 — DB 에 아직 없으면 null (화면이 "패치 필요"를 띄운다)
		adminRpc<AiUsage>('admin_ai_usage').catch(() => null),
		adminRpc<string[]>('admin_banned_terms').catch(() => null)
	]);
	return { s, usage, terms };
};

const AI_INT: [keyof AppSettings, number, number][] = [
	['ai_mod_daily_cap', 0, 100000],
	['ai_chat_per_user', 0, 50],
	['ai_chat_daily_cap', 0, 100000],
	['ai_chat_minutes', 1, 30],
	['ai_chat_max_turns', 1, 100]
];

const INT: [keyof AppSettings, number, number][] = [
	['room_minutes', 1, 60],
	['extend_minutes', 1, 60],
	['vote_window_sec', 15, 300],
	['max_rounds', 0, 50],
	['rematch_cooldown_days', 0, 365],
	['auto_suspend_reports', 1, 50],
	['max_open_rooms', 1, 20]
];

export const actions: Actions = {
	/** 킬 스위치 — 한 번 눌러서 바로 */
	toggle: async ({ request, locals }) => {
		const open = (await request.formData()).get('open') === 'true';
		try {
			await adminRpc('admin_update_settings', { p_patch: { is_open: open }, p_staff: locals.staff!.id });
		} catch (e) {
			return friendly(e);
		}
		return { done: open ? '서비스 열림' : '서비스 닫힘. 진행 중인 대화는 유지됩니다' };
	},

	save: async ({ request, locals }) => {
		if (!isAdmin(locals)) return fail(403, { error: '관리자만 바꿀 수 있어요' });
		const f = await request.formData();
		const patch: Record<string, unknown> = { notice: String(f.get('notice') ?? '').slice(0, 300) };
		for (const [k, min, max] of INT) {
			const n = Number(f.get(k));
			if (!Number.isInteger(n) || n < min || n > max)
				return fail(400, { error: `${k} 는 ${min}~${max} 사이의 정수여야 해요` });
			patch[k] = n;
		}
		try {
			await adminRpc('admin_update_settings', { p_patch: patch, p_staff: locals.staff!.id });
		} catch (e) {
			// 범위는 위에서 걸렀지만, DB check 제약과 어긋나면 여기로 온다
			if (String((e as Error)?.message).includes('check')) return fail(400, { error: '허용 범위를 벗어난 값이 있어요' });
			return friendly(e);
		}
		return { done: '저장 완료' };
	},

	/** 검열봇 · AI 대화 상대 (관리자만) */
	ai: async ({ request, locals }) => {
		if (!isAdmin(locals)) return fail(403, { error: '관리자만 바꿀 수 있어요' });
		const f = await request.formData();
		const patch: Record<string, unknown> = {
			ai_moderation: f.get('ai_moderation') === 'on',
			ai_chat: f.get('ai_chat') === 'on'
		};
		for (const [k, min, max] of AI_INT) {
			const n = Number(f.get(k));
			if (!Number.isInteger(n) || n < min || n > max)
				return fail(400, { error: `${k} 는 ${min}~${max} 사이의 정수여야 해요` });
			patch[k] = n;
		}
		try {
			await adminRpc('admin_update_settings', { p_patch: patch, p_staff: locals.staff!.id });
		} catch (e) {
			if (String((e as Error)?.message).includes('check')) return fail(400, { error: '허용 범위를 벗어난 값이 있어요' });
			return friendly(e);
		}
		return { done: 'AI 설정 저장 완료' };
	},

	/** AI 연결 확인 — 짧은 질문 하나를 보내서 되는지, 안 되면 Cloudflare 가 준 오류를 그대로 보여 준다 (관리자만) */
	aiCheck: async ({ locals, platform }) => {
		if (!isAdmin(locals)) return fail(403, { error: '관리자만 확인할 수 있어요' });
		return { aiCheck: await checkAi(platform?.env?.AI) };
	},

	/** 금칙어 — 한 줄에 하나 (정규식). 통째로 바꾼다 */
	terms: async ({ request, locals }) => {
		if (!isAdmin(locals)) return fail(403, { error: '관리자만 바꿀 수 있어요' });
		const lines = String((await request.formData()).get('terms') ?? '')
			.split('\n')
			.map((t) => t.trim())
			.filter(Boolean);
		try {
			await adminRpc('admin_set_banned_terms', { p_terms: lines, p_staff: locals.staff!.id });
		} catch (e) {
			const m = String((e as Error)?.message ?? '');
			const bad = m.match(/bad_pattern:(.*)$/)?.[1];
			if (bad) return fail(400, { error: `"${bad.trim()}" 는 올바른 패턴이 아니에요 (괄호 짝 등을 확인해 주세요)` });
			if (m.includes('too_many_terms')) return fail(400, { error: '금칙어는 300개까지 넣을 수 있어요' });
			return friendly(e);
		}
		return { done: `금칙어 ${lines.length}개 저장 완료` };
	}
};
