import { adminRpc } from '$lib/server/supabaseAdmin';
import { requireAdmin } from '$lib/server/adminAuth';
import type { RoomRow } from '$lib/adminTypes';
import type { PageServerLoad } from './$types';

/** 전체 대화 목록 — 관리자 전용. 목록은 기록하지 않고, 내용을 열면(/admin/rooms/[id]) 기록한다. */
export const load: PageServerLoad = async ({ url, locals }) => {
	requireAdmin(locals);
	const filter = url.searchParams.get('filter') === 'all' ? 'all' : 'live';
	const rooms = await adminRpc<RoomRow[]>('admin_rooms', { p_filter: filter, p_staff: locals.staff!.id, p_limit: 200 });
	return { filter, rooms };
};
