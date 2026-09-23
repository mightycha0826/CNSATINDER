import { adminRpc } from '$lib/server/supabaseAdmin';
import { listReports, reportFilter } from '$lib/server/reports';
import type { LetterReportRow, Stats } from '$lib/adminTypes';
import type { PageServerLoad } from './$types';

/** 익명편지 신고 큐 — 채팅 신고 큐(/admin)와 같은 모양, 별도 테이블 */
export const load: PageServerLoad = async ({ url }) => {
	const status = reportFilter(url);
	const [stats, reports] = await Promise.all([
		adminRpc<Stats>('admin_stats'),
		listReports<LetterReportRow>('letter', status)
	]);
	return { stats, reports, status };
};
