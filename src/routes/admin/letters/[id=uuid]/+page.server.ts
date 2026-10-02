import { adminRpc } from '$lib/server/supabaseAdmin';
import { reportActions, reportDetail, setReportStatus } from '$lib/server/reports';
import { guard } from '$lib/server/adminAuth';
import type { LetterReportDetail } from '$lib/adminTypes';
import type { Actions, PageServerLoad } from './$types';

const detail = (id: string) => reportDetail<LetterReportDetail>('letter', id);

// ★ load 에는 신원 정보가 없다. 이메일은 identity 액션으로만, 기록과 함께 나간다 (채팅 신고와 같은 규칙).
export const load: PageServerLoad = async ({ params, locals, url }) => {
	guard(locals, url); // 운영자 · 관리자 (Phase 49)
	return { d: await detail(params.id) };
};

export const actions: Actions = {
	...reportActions('letter'),

	/** 신고된 편지 내리기 (소프트 삭제) — 그 편지 줄기 전체 */
	remove: async ({ params, locals }) => {
		const { report: r } = await detail(params.id);
		const staff = locals.staff!.id;
		await adminRpc('admin_remove_dm', { p_thread: r.letter_id, p_staff: staff, p_report: r.id });
		if (r.status !== 'actioned') await setReportStatus('letter', r.id, 'actioned', '편지 내림', staff);
		return { done: '편지 내림' };
	}
};
