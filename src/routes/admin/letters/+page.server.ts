import { adminRpc } from '$lib/server/supabaseAdmin';
import type { LetterReportRow, Stats } from '$lib/adminTypes';
import type { PageServerLoad } from './$types';

const FILTERS = ['open', 'reviewing', 'actioned', 'dismissed', 'all'] as const;

/** 익명편지 신고 큐 — 채팅 신고 큐(/admin)와 같은 모양, 별도 테이블 */
export const load: PageServerLoad = async ({ url }) => {
	const f = url.searchParams.get('status');
	const status = (FILTERS as readonly string[]).includes(f ?? '') ? (f as (typeof FILTERS)[number]) : 'open';
	const [stats, reports] = await Promise.all([
		adminRpc<Stats>('admin_stats'),
		adminRpc<LetterReportRow[]>('admin_list_letter_reports', { p_status: status, p_limit: 200 })
	]);
	return { stats, reports, status };
};
