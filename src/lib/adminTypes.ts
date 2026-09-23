import type { LetterFmt } from './letters/rich';

export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

/** 신원 열람 결과 한 사람 — 탈퇴한 계정은 email 이 null, 명렬표에 없으면 name 이 null */
export type Identity = { email: string | null; name: string | null };

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

/** 신고 목록 탭 (채팅·편지 공용) — ?status= 값 */
export const REPORT_TABS = [
	...(Object.entries(STATUS_LABEL) as [ReportStatus, string][]).map(([v, label]) => ({ v, label })),
	{ v: 'all', label: '전체' }
] as const;

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

// ── Phase 11 — 사용자 관리 · 관리자 열람 ────────────────────────────────
export type StaffRole = 'admin' | 'moderator';

export type UserRow = {
	id: string;
	nickname: string | null;
	status: 'active' | 'suspended' | 'banned';
	suspended_until: string | null;
	strikes: number;
	verified: boolean;
	onboarded: boolean;
	created_at: string;
	online: boolean;
	last_seen: string | null;
	staff_role: StaffRole | null;
	reports_received: number;
};

/** 실시간 현황 한 줄 — rooms(살아 있는 방 id)는 관리자에게만, 운영진은 null */
export type LiveUser = {
	id: string;
	nickname: string | null;
	status: 'active' | 'suspended' | 'banned';
	suspended_until: string | null;
	onboarded: boolean;
	staff_role: StaffRole | null;
	online: boolean;
	last_seen: string | null;
	seeking: boolean;
	room_count: number;
	rooms: string[] | null;
};

export type UserDetail = {
	profile: {
		id: string;
		nickname: string | null;
		bio: string;
		interests: string[];
		mbti: string | null;
		gender: 'm' | 'f' | 'x';
		want: 'm' | 'f' | 'any';
		status: 'active' | 'suspended' | 'banned';
		suspended_until: string | null;
		strikes: number;
		verified: boolean;
		onboarded: boolean;
		created_at: string;
	};
	online: boolean;
	last_seen: string | null;
	staff_role: StaffRole | null;
	counts: { rooms: number; open_rooms: number; letters: number; comments: number; reports_filed: number; reports_dismissed: number };
	chat_reports: { id: string; created_at: string; reason: string; status: ReportStatus }[];
	letter_reports: { id: string; created_at: string; reason: string; status: ReportStatus; target_type: 'letter' | 'comment' }[];
	history: { action: string; staff_id: string | null; detail: Record<string, unknown>; created_at: string }[];
};

export type UserRoomRow = {
	id: string;
	status: 'pending' | 'active' | 'closed';
	created_at: string;
	closed_at: string | null;
	close_reason: string | null;
	live: boolean;
	alias: string;
	partner_id: string | null;
	partner_nickname: string | null;
	message_count: number;
};

export type UserLetterRow = {
	letter_id: number;
	alias: string;
	is_author: boolean;
	status: 'open' | 'removed';
	created_at: string;
	preview: string;
	my_comments: number;
};

export type RoomRow = {
	id: string;
	status: 'pending' | 'active' | 'closed';
	created_at: string;
	closed_at: string | null;
	close_reason: string | null;
	round: number;
	live: boolean;
	members: { seat: 1 | 2; user_id: string; nickname: string | null }[] | null;
	message_count: number;
};

export type RoomView = {
	room: {
		id: string;
		status: string;
		round: number;
		created_at: string;
		armed_at: string | null;
		expires_at: string;
		closed_at: string | null;
		close_reason: string | null;
		live: boolean;
	};
	members: { seat: 1 | 2; user_id: string; open: boolean; alias: string; nickname: string | null; status: string }[];
	messages: { id: number; seat: 0 | 1 | 2; body: string; created_at: string }[];
};

export type LetterPostView = {
	letter: { id: number; body: string; fmt: LetterFmt | null; status: 'open' | 'removed'; reply_status: string; created_at: string; like_count: number };
	participants: { no: number; alias: string; is_author: boolean; user_id: string; nickname: string | null; status: string }[];
	reader: { user_id: string; expires_at: string; fulfilled_at: string | null; nickname: string | null } | null;
	comments: { id: number; parent_id: number | null; author_no: number; body: string; status: 'visible' | 'removed'; created_at: string }[];
};

export const CLOSE_LABEL: Record<string, string> = {
	expired: '시간 만료',
	declined: '연장 거절',
	skipped: '넘김',
	no_show: '미입장',
	left: '나감',
	reported: '신고',
	blocked: '차단',
	admin: '운영 조치'
};

/**
 * 표에 쓰는 시각 — "9/23 14:05". 짧고 폭이 일정해서 칸 안에서 줄바꿈되지 않는다.
 * 운영자 화면은 서버(Cloudflare, UTC)에서 그리므로 시간대를 한국으로 못박는다 — 안 그러면 9시간 어긋난다.
 */
const KST = new Intl.DateTimeFormat('en-US', {
	timeZone: 'Asia/Seoul',
	month: 'numeric',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23'
});
export function fmtTime(s: string) {
	const p = Object.fromEntries(KST.formatToParts(new Date(s)).map((x) => [x.type, x.value]));
	return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

/** 메시지 시각 — "14:05:09" (한국 시간) */
export const fmtClock = (s: string | number) =>
	new Date(s).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** 사용자 id 앞 6자리 — 같은 사람인지 알아보는 용도. 신원이 아니다. */
export const shortId = (id: string | null | undefined) => (id ? id.slice(0, 6) : '—');

/** 활동 기록(audit_log.action) 표시 이름 */
export const ACTION_LABEL: Record<string, string> = {
	view_identity: '신원 열람',
	search_email: '이메일 검색',
	view_room: '대화 열람',
	view_letter_authors: '편지 작성자 확인',
	view_user_letters: '편지 활동 열람',
	auto_suspend: '자동 정지 (채팅)',
	auto_suspend_letters: '자동 정지 (편지)',
	sanction_warn: '경고',
	sanction_suspend: '기간 정지',
	sanction_ban: '영구 정지',
	sanction_reinstate: '제한 해제',
	report_open: '신고 다시 열기',
	report_reviewing: '검토 시작',
	report_actioned: '조치 완료',
	report_dismissed: '신고 기각',
	letter_report_open: '편지 신고 다시 열기',
	letter_report_reviewing: '편지 신고 검토',
	letter_report_actioned: '편지 신고 조치',
	letter_report_dismissed: '편지 신고 기각',
	remove_letter: '편지 내림',
	remove_comment: '댓글 내림',
	update_settings: '설정 변경',
	roster_import: '명렬표 반영',
	post_notice: '공지 올림',
	remove_notice: '공지 내림'
};

/** 공지사항 (admin_notices) */
export type NoticeRow = { id: number; title: string; body: string; created_at: string };
