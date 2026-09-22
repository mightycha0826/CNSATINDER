import { error } from '@sveltejs/kit';
import { adminRpc } from '$lib/server/supabaseAdmin';
import { requireAdmin } from '$lib/server/adminAuth';
import type { RoomView } from '$lib/adminTypes';
import type { PageServerLoad } from './$types';

const UUID = /^[0-9a-f-]{36}$/i;

/** 대화 열람 — 관리자 전용. admin_room 이 열 때마다 활동 기록(view_room)을 남긴다. */
export const load: PageServerLoad = async ({ params, locals }) => {
	requireAdmin(locals);
	if (!UUID.test(params.id)) error(404, '대화를 찾을 수 없습니다');
	const v = await adminRpc<RoomView | null>('admin_room', { p_room: params.id, p_staff: locals.staff!.id });
	if (!v) error(404, '대화를 찾을 수 없습니다 (이미 지워졌을 수 있음)');
	return { v };
};
