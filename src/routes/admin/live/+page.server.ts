import { adminRpc } from '$lib/server/supabaseAdmin';
import { studentLabels } from '$lib/server/adminAuth';
import type { LiveUser } from '$lib/adminTypes';
import type { PageServerLoad } from './$types';

/**
 * 실시간 현황 — 전체 사용자와 지금 상태. 상태는 화면에서 status 엔드포인트로 10초마다 다시 받는다.
 * 학번·이름(관리자만, 활동 기록 남음)은 페이지를 열 때 한 번만 받는다 — 새로고침마다 기록이 쌓이지 않게.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const users = await adminRpc<LiveUser[]>('admin_live_users', { p_staff: locals.staff!.id });
	const students = await studentLabels(locals, users.map((u) => u.id));
	return { users, students };
};
