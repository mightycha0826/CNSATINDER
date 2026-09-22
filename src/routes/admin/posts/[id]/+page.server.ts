import { error } from '@sveltejs/kit';
import { adminRpc } from '$lib/server/supabaseAdmin';
import { requireAdmin } from '$lib/server/adminAuth';
import type { LetterPostView } from '$lib/adminTypes';
import type { PageServerLoad } from './$types';

/** 편지 한 통 + 작성자·댓글 작성자 계정 — 관리자 전용, 열 때마다 기록(view_letter_authors) */
export const load: PageServerLoad = async ({ params, locals }) => {
	requireAdmin(locals);
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id < 1) error(404, '편지를 찾을 수 없습니다');
	const v = await adminRpc<LetterPostView | null>('admin_letter_post', { p_letter: id, p_staff: locals.staff!.id });
	if (!v) error(404, '편지를 찾을 수 없습니다');
	return { v };
};
