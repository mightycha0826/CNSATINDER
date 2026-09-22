import { error, fail } from '@sveltejs/kit';
import { adminRpc, emailOf } from '$lib/server/supabaseAdmin';
import type { LetterReportDetail } from '$lib/adminTypes';
import type { Actions, PageServerLoad } from './$types';

const UUID = /^[0-9a-f-]{36}$/i;

async function detail(id: string) {
	if (!UUID.test(id)) error(404, '신고를 찾을 수 없습니다');
	const d = await adminRpc<LetterReportDetail | null>('admin_letter_report', { p_id: id });
	if (!d) error(404, '신고를 찾을 수 없습니다');
	return d;
}

// ★ load 에는 신원 정보가 없다. 이메일은 identity 액션으로만, 기록과 함께 나간다 (채팅 신고와 같은 규칙).
export const load: PageServerLoad = async ({ params }) => ({ d: await detail(params.id) });

export const actions: Actions = {
	identity: async ({ params, locals }) => {
		const d = await detail(params.id);
		const users = [d.report.reported_id, d.report.reporter_id];
		await adminRpc('admin_log_identity_view', { p_staff: locals.staff!.id, p_users: users, p_report: d.report.id });
		const [reported, reporter] = await Promise.all(users.map(emailOf));
		return { identity: { reported, reporter } };
	},

	status: async ({ params, request, locals }) => {
		const f = await request.formData();
		const status = String(f.get('status'));
		if (!['open', 'reviewing', 'actioned', 'dismissed'].includes(status)) return fail(400, { error: '잘못된 상태' });
		await adminRpc('admin_set_letter_report', {
			p_id: params.id,
			p_status: status,
			p_note: String(f.get('note') ?? '').slice(0, 1000),
			p_staff: locals.staff!.id
		});
		return { done: '상태 변경 완료' };
	},

	/** 신고된 글 내리기 (소프트 삭제) — 편지 신고면 편지 전체, 댓글 신고면 그 댓글만 */
	remove: async ({ params, locals }) => {
		const d = await detail(params.id);
		await adminRpc('admin_remove_letter_content', {
			p_letter: d.report.letter_id,
			p_comment: d.report.comment_id,
			p_staff: locals.staff!.id,
			p_report: d.report.id
		});
		if (d.report.status !== 'actioned') {
			await adminRpc('admin_set_letter_report', {
				p_id: d.report.id,
				p_status: 'actioned',
				p_note: '글 내림',
				p_staff: locals.staff!.id
			});
		}
		return { done: d.report.comment_id ? '댓글 내림' : '편지 내림' };
	},

	sanction: async ({ params, request, locals }) => {
		const d = await detail(params.id);
		const f = await request.formData();
		const target = f.get('target') === 'reporter' ? d.report.reporter_id : d.report.reported_id;
		const action = String(f.get('action'));
		if (!['warn', 'suspend', 'ban', 'reinstate'].includes(action)) return fail(400, { error: '잘못된 조치' });
		const days = action === 'suspend' ? Math.max(1, Math.min(365, Number(f.get('days')) || 0)) : null;
		const note = String(f.get('note') ?? '').slice(0, 1000);

		// admin_sanction 은 채널과 무관 — profiles 기준. 정지되면 그 사람 편지는 피드에서 자동으로 빠진다.
		await adminRpc('admin_sanction', {
			p_user: target,
			p_action: action,
			p_days: days,
			p_staff: locals.staff!.id,
			p_report: d.report.id,
			p_note: note
		});
		if (target === d.report.reported_id && action !== 'reinstate' && d.report.status !== 'actioned') {
			await adminRpc('admin_set_letter_report', {
				p_id: d.report.id,
				p_status: 'actioned',
				p_note: note,
				p_staff: locals.staff!.id
			});
		}
		return { done: '조치 완료' };
	}
};
