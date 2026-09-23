import { error, fail } from '@sveltejs/kit';
import { adminRpc, emailOf, rosterNameOf } from './supabaseAdmin';
import type { Identity } from '$lib/adminTypes';

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

/**
 * 화면에 나오는 사용자들의 "학번 이름" { user_id: '20529 홍길동' }.
 * 관리자만 받는다 (운영진은 빈 객체). 한 번 부를 때마다 DB 가 활동 기록(view_identity)을 남긴다.
 */
export async function studentLabels(
	locals: App.Locals,
	ids: (string | null | undefined)[]
): Promise<Record<string, string>> {
	const users = [...new Set(ids.filter((x): x is string => !!x))];
	if (!isAdmin(locals) || users.length === 0) return {};
	return adminRpc<Record<string, string>>('admin_student_labels', { p_staff: locals.staff!.id, p_users: users });
}

/**
 * 신원 열람 (이메일 확인) — 관리자만. 먼저 활동 기록을 남기고, 기록이 실패하면 열람도 하지 않는다.
 * 그다음 이메일과 명렬표 이름을 찾는다. 탈퇴한 계정은 email 이 null.
 */
export async function revealIdentity(locals: App.Locals, users: string[], report: string | null): Promise<Identity[]> {
	const staff = locals.staff!.id;
	await adminRpc('admin_log_identity_view', { p_staff: staff, p_users: users, p_report: report });
	return Promise.all(
		users.map(async (u) => {
			const email = await emailOf(u);
			return { email, name: await rosterNameOf(email, staff) };
		})
	);
}

const DB_ERR: Record<string, string> = {
	admin_only: '관리자만 할 수 있는 조치',
	mod_days_limit: `운영진은 최대 ${MOD_MAX_SUSPEND_DAYS}일까지 정지 가능`,
	not_staff: '운영진 명단에 없는 계정',
	days_required: '정지 기간을 입력해야 함',
	user_not_found: '탈퇴한 계정이라 조치할 수 없음'
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
