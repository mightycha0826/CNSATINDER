import { error, fail } from '@sveltejs/kit';
import { adminRpc, emailOf, rosterNameOf } from '$lib/server/supabaseAdmin';
import { isAdmin, runSanction } from '$lib/server/adminAuth';
import type { UserDetail, UserLetterRow, UserRoomRow } from '$lib/adminTypes';
import type { Actions, PageServerLoad } from './$types';

const UUID = /^[0-9a-f-]{36}$/i;

async function detail(id: string, staff: string) {
	if (!UUID.test(id)) error(404, '계정을 찾을 수 없습니다');
	const d = await adminRpc<UserDetail | null>('admin_user', { p_user: id, p_staff: staff });
	if (!d) error(404, '계정을 찾을 수 없습니다');
	return d;
}

// ★ load 에는 이메일이 없다. 이메일·편지 활동은 아래 액션으로만, 기록과 함께 나간다.
export const load: PageServerLoad = async ({ params, locals }) => {
	const staff = locals.staff!.id;
	const [d, rooms] = await Promise.all([
		detail(params.id, staff),
		isAdmin(locals)
			? adminRpc<UserRoomRow[]>('admin_user_rooms', { p_user: params.id, p_staff: staff })
			: Promise.resolve(null)
	]);
	return { d, rooms };
};

export const actions: Actions = {
	identity: async ({ params, locals }) => {
		if (!isAdmin(locals)) return fail(403, { error: '이메일 확인은 관리자만 가능' });
		await detail(params.id, locals.staff!.id);
		await adminRpc('admin_log_identity_view', { p_staff: locals.staff!.id, p_users: [params.id], p_report: null });
		const email = (await emailOf(params.id)) ?? '(탈퇴)';
		const name = await rosterNameOf(email, locals.staff!.id);
		return { email, name };
	},

	letters: async ({ params, locals }) => {
		if (!isAdmin(locals)) return fail(403, { error: '편지 활동은 관리자만 확인 가능' });
		const letters = await adminRpc<UserLetterRow[]>('admin_user_letters', {
			p_user: params.id,
			p_staff: locals.staff!.id
		});
		return { letters };
	},

	sanction: async ({ params, request, locals }) => {
		await detail(params.id, locals.staff!.id);
		const res = await runSanction(locals, params.id, await request.formData(), null);
		if (typeof res !== 'string') return res;
		return { done: '조치 완료' };
	}
};
