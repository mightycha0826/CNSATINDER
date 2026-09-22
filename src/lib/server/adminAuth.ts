import { error, fail } from '@sveltejs/kit';
import { adminRpc } from './supabaseAdmin';

/**
 * 운영진(moderator) / 관리자(admin) 권한 — Phase 11
 *
 * 같은 규칙을 DB 함수(private.require_staff, admin_sanction)도 한 번 더 검사한다.
 * 여기서 막는 건 화면·메시지를 위해서고, 진짜 경계는 DB 쪽이다.
 */
export const MOD_MAX_SUSPEND_DAYS = 7;

export const isAdmin = (locals: App.Locals) => locals.staff?.role === 'admin';

/** 관리자 전용 화면 — 운영진이 주소를 직접 쳐서 들어와도 403 */
export function requireAdmin(locals: App.Locals) {
	if (!isAdmin(locals)) error(403, '관리자만 볼 수 있는 화면');
}

const DB_ERR: Record<string, string> = {
	admin_only: '관리자만 할 수 있는 조치',
	mod_days_limit: `운영진은 최대 ${MOD_MAX_SUSPEND_DAYS}일까지 정지 가능`,
	not_staff: '운영진 명단에 없는 계정',
	days_required: '정지 기간을 입력해야 함'
};

/** adminRpc 에러를 화면용 문구로. 모르는 에러는 그대로 던진다. */
export function friendly(e: unknown) {
	const msg = String((e as Error)?.message ?? e);
	const key = Object.keys(DB_ERR).find((k) => msg.includes(k));
	if (!key) throw e;
	return fail(403, { error: DB_ERR[key] });
}

/**
 * 제재 폼 처리 (신고 상세·사용자 상세 공용).
 * 성공하면 action 이름을, 실패하면 ActionFailure 를 돌려준다.
 */
export async function runSanction(locals: App.Locals, user: string, f: FormData, report: string | null) {
	const action = String(f.get('action'));
	if (!['warn', 'suspend', 'ban', 'reinstate'].includes(action)) return fail(400, { error: '잘못된 조치' });
	const max = isAdmin(locals) ? 365 : MOD_MAX_SUSPEND_DAYS;
	const days = action === 'suspend' ? Math.max(1, Math.min(max, Number(f.get('days')) || 0)) : null;
	try {
		await adminRpc('admin_sanction', {
			p_user: user,
			p_action: action,
			p_days: days,
			p_staff: locals.staff!.id,
			p_report: report,
			p_note: String(f.get('note') ?? '').slice(0, 1000)
		});
	} catch (e) {
		return friendly(e);
	}
	return action;
}
