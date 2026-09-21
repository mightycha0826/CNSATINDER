export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

export type ReportRow = {
	id: string;
	created_at: string;
	reason: string;
	note: string;
	status: ReportStatus;
	reported_id: string;
	reporter_id: string;
	reported_30d: number;
	evidence_count: number;
	reported_status: 'active' | 'suspended' | 'banned' | null;
};

export type ReportDetail = {
	report: ReportRow & { room_id: string; handled_by: string | null; handled_at: string | null; action_note: string | null };
	evidence: { ord: number; sender: 0 | 1 | 2; body: string; sent_at: string }[];
	reported: { status: string; strikes: number; suspended_until: string | null; gender: string; created_at: string } | null;
	history: { id: string; created_at: string; reason: string; status: ReportStatus }[];
	reporter_filed: number;
	reporter_dismissed: number;
};

export type Stats = {
	open_reports: number;
	reviewing: number;
	active_rooms: number;
	seeking_now: number;
	restricted_users: number;
	rooms_24h: number;
	is_open: boolean;
};

export const REASON_LABEL: Record<string, string> = {
	personal_info: '신상 캐묻기',
	sexual: '성적 발언',
	harassment: '욕설·괴롭힘',
	hate: '혐오 표현',
	impersonation: '사칭',
	spam: '도배·광고',
	other: '기타'
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
	open: '미처리',
	reviewing: '검토 중',
	actioned: '조치 완료',
	dismissed: '기각'
};
