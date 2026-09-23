import { adminRpc } from '$lib/server/supabaseAdmin';
import { listReports, reportFilter } from '$lib/server/reports';
import type { ReportRow, Stats } from '$lib/adminTypes';
import type { PageServerLoad } from './$types';

/** 채팅 신고 큐 */
export const load: PageServerLoad = async ({ url }) => {
	const status = reportFilter(url);
	const [stats, reports] = await Promise.all([adminRpc<Stats>('admin_stats'), listReports<ReportRow>('chat', status)]);
	return { stats, reports, status };
};
