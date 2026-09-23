import { fail } from '@sveltejs/kit';
import { adminRpc } from '$lib/server/supabaseAdmin';
import { friendly, isAdmin } from '$lib/server/adminAuth';
import type { NoticeRow } from '$lib/adminTypes';
import type { Actions, PageServerLoad } from './$types';

/**
 * 공지사항 — 학생 앱의 종 아이콘으로 보인다. 새 공지를 올리면 학생들 종에 빨간 점이 뜬다.
 * 올리기·내리기는 관리자만 (DB 도 한 번 더 막는다), 운영진은 목록만.
 */
export const load: PageServerLoad = async ({ locals }) => ({
	notices: await adminRpc<NoticeRow[]>('admin_notices', { p_staff: locals.staff!.id })
});

export const actions: Actions = {
	post: async ({ request, locals }) => {
		if (!isAdmin(locals)) return fail(403, { error: '공지는 관리자만 올릴 수 있어요' });
		const f = await request.formData();
		const title = String(f.get('title') ?? '').trim();
		const body = String(f.get('body') ?? '').trim();
		if (!title) return fail(400, { error: '제목을 적어 주세요', title, body });
		if (title.length > 80) return fail(400, { error: '제목은 80자까지', title, body });
		if (body.length > 2000) return fail(400, { error: '내용은 2000자까지', title, body });
		try {
			await adminRpc('admin_post_notice', { p_staff: locals.staff!.id, p_title: title, p_body: body });
		} catch (e) {
			return friendly(e);
		}
		return { done: '공지 올림 · 학생들 종 아이콘에 빨간 점이 떠요' };
	},

	remove: async ({ request, locals }) => {
		if (!isAdmin(locals)) return fail(403, { error: '공지는 관리자만 내릴 수 있어요' });
		const id = Number((await request.formData()).get('id'));
		if (!Number.isSafeInteger(id) || id < 1) return fail(400, { error: '잘못된 공지' });
		try {
			await adminRpc('admin_remove_notice', { p_staff: locals.staff!.id, p_id: id });
		} catch (e) {
			return friendly(e);
		}
		return { done: '공지 내림' };
	}
};
