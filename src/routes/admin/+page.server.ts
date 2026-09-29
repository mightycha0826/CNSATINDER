import { adminRpc } from '$lib/server/supabaseAdmin';
import { listReports, reportFilter } from '$lib/server/reports';
import { guard } from '$lib/server/adminAuth';
import type { ReportRow, Stats } from '$lib/adminTypes';
import type { PageServerLoad } from './$types';

/** 채팅 신고 큐 */
export const load: PageServerLoad = async ({ url, locals }) => {
	guard(locals, url); // 운영자 · 관리자 (Phase 49 — 개발자는 실시간으로)
	const status = reportFilter(url);
	const [stats, reports] = await Promise.all([adminRpc<Stats>('admin_stats'), listReports<ReportRow>('chat', status)]);
	return { stats, reports, status };
};
