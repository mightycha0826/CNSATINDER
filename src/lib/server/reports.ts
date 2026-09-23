import { error, fail, type Actions } from '@sveltejs/kit';
import { adminRpc } from './supabaseAdmin';
import { isAdmin, revealIdentity, runSanction } from './adminAuth';
import type { ReportStatus } from '$lib/adminTypes';

/**
 * 채팅 신고(/admin/reports)와 편지 신고(/admin/letters)는 테이블만 다르고 처리 절차가 같다.
 * RPC 이름만 바꿔 끼워 같은 로드·액션을 쓴다.
 */
export type ReportKind = 'chat' | 'letter';

const RPC = {
	chat: { list: 'admin_list_reports', detail: 'admin_report', set: 'admin_set_report' },
	letter: { list: 'admin_list_letter_reports', detail: 'admin_letter_report', set: 'admin_set_letter_report' }
} as const;

const STATUSES: readonly ReportStatus[] = ['open', 'reviewing', 'actioned', 'dismissed'];
const FILTERS = [...STATUSES, 'all'] as const;
export type ReportFilter = (typeof FILTERS)[number];

/** 목록 탭 (?status=) — 모르는 값이면 미처리 */
export function reportFilter(url: URL): ReportFilter {
	const f = url.searchParams.get('status') as ReportFilter | null;
	return f && FILTERS.includes(f) ? f : 'open';
}

export const listReports = <T>(kind: ReportKind, status: ReportFilter) =>
	adminRpc<T[]>(RPC[kind].list, { p_status: status, p_limit: 200 });

type ReportCore = { report: { id: string; reported_id: string; reporter_id: string; status: ReportStatus } };

export async function reportDetail<D extends ReportCore>(kind: ReportKind, id: string): Promise<D> {
	const d = await adminRpc<D | null>(RPC[kind].detail, { p_id: id });
	if (!d) error(404, '신고를 찾을 수 없습니다');
	return d;
}

const noteOf = (f: FormData) => String(f.get('note') ?? '').slice(0, 1000);

export const setReportStatus = (kind: ReportKind, id: string, status: ReportStatus, note: string, staff: string) =>
	adminRpc(RPC[kind].set, { p_id: id, p_status: status, p_note: note, p_staff: staff });

/** 신고 상세의 공용 액션 — 신원 열람 · 상태 변경 · 제재 */
export function reportActions(kind: ReportKind) {
	return {
		/** 신원 열람 — 관리자만. 먼저 기록하고 그다음 조회한다. 기록이 실패하면 열람도 안 된다. */
		identity: async ({ params, locals }) => {
			if (!isAdmin(locals)) return fail(403, { error: '이메일 확인은 관리자만 가능' });
			const d = await reportDetail(kind, params.id!);
			const [reported, reporter] = await revealIdentity(locals, [d.report.reported_id, d.report.reporter_id], d.report.id);
			return { identity: { reported, reporter } };
		},

		status: async ({ params, request, locals }) => {
			const f = await request.formData();
			const status = String(f.get('status')) as ReportStatus;
			if (!STATUSES.includes(status)) return fail(400, { error: '잘못된 상태' });
			await setReportStatus(kind, params.id!, status, noteOf(f), locals.staff!.id);
			return { done: '상태 변경 완료' };
		},

		sanction: async ({ params, request, locals }) => {
			const d = await reportDetail(kind, params.id!);
			const f = await request.formData();
			const target = f.get('target') === 'reporter' ? d.report.reporter_id : d.report.reported_id;
			const res = await runSanction(locals, target, f, d.report.id);
			if (typeof res !== 'string') return res;
			// 피신고자에게 조치했으면 신고는 조치 완료로
			if (target === d.report.reported_id && res !== 'reinstate' && d.report.status !== 'actioned') {
				await setReportStatus(kind, d.report.id, 'actioned', noteOf(f), locals.staff!.id);
			}
			return { done: '조치 완료' };
		}
	} satisfies Actions;
}
