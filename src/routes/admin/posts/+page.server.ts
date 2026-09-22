import { redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/adminAuth';
import type { PageServerLoad } from './$types';

/** "편지 번호로 찾기" 폼 → /admin/posts/[번호]. 학생 앱 주소(/letters/123)를 붙여 넣어도 번호만 뽑는다. */
export const load: PageServerLoad = ({ url, locals }) => {
	requireAdmin(locals);
	const n = (url.searchParams.get('n') ?? '').match(/(\d+)\s*$/)?.[1];
	redirect(303, n ? `/admin/posts/${n}` : '/admin/letters');
};
