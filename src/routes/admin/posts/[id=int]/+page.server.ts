import { error } from '@sveltejs/kit';
import { adminRpc } from '$lib/server/supabaseAdmin';
import { requireAdmin, studentLabels } from '$lib/server/adminAuth';
import type { LetterPostView } from '$lib/adminTypes';
import type { PageServerLoad } from './$types';

/** 편지 한 통 + 작성자·댓글 작성자 계정 — 관리자 전용, 열 때마다 기록(view_letter_authors) */
export const load: PageServerLoad = async ({ params, locals }) => {
	requireAdmin(locals);
	const v = await adminRpc<LetterPostView | null>('admin_letter_post', {
		p_letter: Number(params.id),
		p_staff: locals.staff!.id
	});
	if (!v) error(404, '편지를 찾을 수 없습니다');
	const students = await studentLabels(locals, [...v.participants.map((p) => p.user_id), v.reader?.user_id]);
	return { v, students };
};
