import { adminRpc } from '$lib/server/supabaseAdmin';
import { friendly, isAdmin, studentLabels } from '$lib/server/adminAuth';
import type { UserRow } from '$lib/adminTypes';
import type { PageServerLoad } from './$types';

const FILTERS = ['all', 'restricted', 'staff'] as const;

/**
 * 사용자 검색 — 익명 이름 / ID 앞자리 (운영진·관리자), 이메일 (관리자만, 검색 기록 남음).
 * 검색 결과에는 이메일이 없다. 이메일은 사용자 상세의 "이메일 확인" 으로만.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const f = url.searchParams.get('filter');
	const filter = (FILTERS as readonly string[]).includes(f ?? '') ? (f as (typeof FILTERS)[number]) : 'all';

	const none = {} as Record<string, string>;
	if (q.includes('@') && !isAdmin(locals)) {
		return { q, filter, users: [] as UserRow[], students: none, error: '이메일 검색은 관리자만 가능' };
	}
	try {
		const users = await adminRpc<UserRow[]>('admin_find_users', {
			p_query: q,
			p_filter: filter,
			p_staff: locals.staff!.id,
			p_limit: 100
		});
		const students = await studentLabels(locals, users.map((u) => u.id));
		return { q, filter, users, students, error: null };
	} catch (e) {
		const r = friendly(e);
		return { q, filter, users: [] as UserRow[], students: none, error: r.data.error };
	}
};
