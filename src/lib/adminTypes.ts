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
	open_letter_reports: number;
	active_rooms: number;
	seeking_now: number;
	restricted_users: number;
	rooms_24h: number;
	letters_24h: number;
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

// ── 익명편지 신고 (private.letter_reports) ─────────────────────────────
export type LetterReportRow = {
	id: string;
	created_at: string;
	target_type: 'letter' | 'comment';
	letter_id: number;
	comment_id: number | null;
	reason: string;
	note: string;
	status: ReportStatus;
	reported_id: string;
	reporter_id: string;
	reported_30d: number;
	/** 신고한 글 앞부분 (증거 사본에서) */
	preview: string | null;
	reported_status: 'active' | 'suspended' | 'banned' | null;
};

export type LetterReportDetail = {
	report: LetterReportRow & { handled_by: string | null; handled_at: string | null; action_note: string | null };
	/** letter = 편지 본문 / parent = 대댓글이 달린 댓글 / comment = 신고한 댓글 */
	evidence: { ord: number; kind: 'letter' | 'parent' | 'comment'; alias: string | null; body: string; sent_at: string }[];
	/** 지금 그 글이 아직 떠 있는지 */
	target: { letter_status: 'open' | 'removed' | null; comment_status: 'visible' | 'removed' | null };
	reported: { status: string; strikes: number; suspended_until: string | null; created_at: string } | null;
	history: { id: string; created_at: string; reason: string; status: ReportStatus }[];
	/** 같은 사람이 채팅에서 받은 신고 수 (교차 확인용) */
	chat_reports: number;
	reporter_filed: number;
	reporter_dismissed: number;
};
