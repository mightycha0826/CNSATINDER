import { fail } from '@sveltejs/kit';
import { adminRpc } from '$lib/server/supabaseAdmin';
import { friendly, guard } from '$lib/server/adminAuth';
import type { StaffRole, StaffRow } from '$lib/adminRoles';
import type { Actions, PageServerLoad } from './$types';

/**
 * 운영진 관리 (Phase 50) — 최고 관리자 한 사람만. 학번으로 운영자 · 개발자 · 관리자를 지정 · 바꾸기 · 빼기.
 * 화면(guard) · DB 함수(private.require_owner) 두 겹으로 막는다. 모든 변경은 활동 기록(set_staff)에 남는다.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	guard(locals, url);
	return { list: await adminRpc<StaffRow[]>('admin_staff_list', { p_staff: locals.staff!.id }) };
};

const ROLES: StaffRole[] = ['moderator', 'developer', 'admin'];

async function set(locals: App.Locals, no: string, role: StaffRole | null, name: string | null) {
	if (!locals.staff?.owner) return fail(403, { error: '최고 관리자만 할 수 있어요' });
	if (!/^[0-9a-zA-Z._-]{1,40}$/.test(no)) return fail(400, { error: '학번(학교 이메일 앞부분)을 확인해 주세요' });
	try {
		await adminRpc('admin_staff_set', { p_staff: locals.staff.id, p_no: no, p_role: role, p_name: name });
	} catch (e) {
		return friendly(e);
	}
	return null;
}

export const actions: Actions = {
	/** 지정 · 역할 바꾸기 · 표시 이름 (같은 학번이면 고친다) */
	save: async ({ request, locals }) => {
		const f = await request.formData();
		const no = String(f.get('no') ?? '').trim();
		const role = String(f.get('role') ?? '') as StaffRole;
		if (!ROLES.includes(role)) return fail(400, { error: '역할을 골라 주세요' });
		const name = String(f.get('name') ?? '').trim().slice(0, 20) || null;
		const r = await set(locals, no, role, name);
		return r ?? { done: f.get('add') ? `${no} 지정됨` : '저장됨' };
	},
	/** 운영진에서 빼기 */
	remove: async ({ request, locals }) => {
		const no = String((await request.formData()).get('no') ?? '').trim();
		const r = await set(locals, no, null, null);
		return r ?? { done: `${no} 운영진에서 뺐어요` };
	}
};
