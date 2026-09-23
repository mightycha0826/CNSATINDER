import { fail } from '@sveltejs/kit';
import { adminRpc } from '$lib/server/supabaseAdmin';
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
};

export const load: PageServerLoad = async () => ({
	s: await adminRpc<AppSettings>('admin_get_settings')
});

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
	}
};
