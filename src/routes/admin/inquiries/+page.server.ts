import { fail } from '@sveltejs/kit';
import { adminRpc } from '$lib/server/supabaseAdmin';
import { friendly, studentLabels } from '$lib/server/adminAuth';
import { deliver, type PushNote } from '$lib/server/pushSend';
import type { InquiryRow } from '$lib/adminTypes';
import type { Actions, PageServerLoad } from './$types';

/**
 * 학생 문의 (Phase 37) — 설정 › 운영진에게 문의하기 로 온 글. 답을 기다리는 것부터 오래된 순.
 * 답변을 적으면 그 학생에게 개인 공지로 가고(하트 · 공지 · 푸시) 활동 기록에 남는다. 운영진 누구나.
 * 누가 보냈는지(학번 · 이름)는 관리자에게만 — 이름표를 부르면 활동 기록에 남는다 (studentLabels).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const r = await adminRpc<{ open: number; items: InquiryRow[] }>('admin_inquiries', { p_staff: locals.staff!.id });
	const students = await studentLabels(locals, r.items.filter((x) => !x.answered_at).map((x) => x.user_id));
	return { open: r.open, items: r.items, students };
};

export const actions: Actions = {
	answer: async ({ request, locals, platform }) => {
		const f = await request.formData();
		const id = Number(f.get('id'));
		const answer = String(f.get('answer') ?? '').trim();
		if (!Number.isSafeInteger(id) || id < 1) return fail(400, { error: '잘못된 문의' });
		if (!answer) return fail(400, { error: '답변을 적어 주세요', id, answer });
		if (answer.length > 2000) return fail(400, { error: '답변은 2000자까지', id, answer });
		let notice: number;
		try {
			notice = await adminRpc<number>('admin_answer_inquiry', { p_staff: locals.staff!.id, p_id: id, p_answer: answer });
		} catch (e) {
			return friendly(e);
		}
		// 알림은 실패해도 답변은 이미 갔다
		const p = await adminRpc<{ skip: string } | Omit<PushNote, 'kind'>>('personal_notice_push', { p_id: notice }).catch(() => ({ skip: 'error' }));
		if (!('skip' in p)) await deliver({ ...p, kind: 'notice' }, platform).catch(() => null);
		return { done: '답변을 보냈어요 · 학생의 알림(하트)과 공지에 떠요' };
	}
};
