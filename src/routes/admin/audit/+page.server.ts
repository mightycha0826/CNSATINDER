import { adminRpc } from '$lib/server/supabaseAdmin';
import { guard } from '$lib/server/adminAuth';
import type { PageServerLoad } from './$types';

export type AuditRow = {
	id: number;
	staff_id: string | null;
	action: string;
	target_user: string | null;
	report_id: string | null;
	detail: Record<string, unknown>;
	created_at: string;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	guard(locals, url); // 활동 기록 권한 (Phase 51 표)
	return { log: await adminRpc<AuditRow[]>('admin_audit', { p_limit: 200 }) };
};
