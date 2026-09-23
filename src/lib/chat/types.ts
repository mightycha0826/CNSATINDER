/** 서버의 messages 행. ★ 식별 컬럼이 없다 — sender_seat(0=시스템, 1, 2)뿐. */
export type MsgRow = {
	id: number;
	room_id: string;
	sender_seat: 0 | 1 | 2;
	body: string;
	client_msg_id: string;
	created_at: string;
};

export type MsgState = 'sending' | 'sent' | 'failed' | 'rate_limited';

/** 화면이 들고 있는 메시지. 서버 확정 전에는 id 가 null. */
export type Msg = Omit<MsgRow, 'id'> & { id: number | null; state: MsgState };

/** rooms 행 (Realtime UPDATE 로 오는 형태). uuid 는 room id 뿐. */
export type RoomRow = {
	id: string;
	status: 'pending' | 'active' | 'closed';
	round: number;
	expires_at: string;
	close_reason: string | null;
	alias1: string;
	alias2: string;
	read1: number | null;
	read2: number | null;
};

/** room_snapshot() RPC 응답 — 클라가 방에 대해 아는 모든 것. */
export type RoomSnap = {
	room_id: string;
	status: RoomRow['status'];
	my_seat: 1 | 2;
	my_alias: string;
	partner_alias: string;
	expires_at: string;
	round: number;
	/** 0 = 무제한 */
	max_rounds: number;
	extend_minutes: number;
	vote_window_sec: number;
	/** 현재 라운드의 내 표 / 상대 표 (null = 아직 안 누름) */
	my_vote: boolean | null;
	partner_vote: boolean | null;
	/** pending 방에서 상대가 화면을 열었는지 */
	partner_joined: boolean;
	/** 상대가 앱을 켜 두었는지 (방 화면이 아니어도) */
	partner_online: boolean;
	their_read_id: number | null;
	close_reason: string | null;
	server_now: string;
};

/** extension_votes 행 — seat 만 있고 사용자 식별자는 없다 */
export type VoteRow = { room_id: string; round: number; seat: 1 | 2; agree: boolean };

export type VoteResult = 'waiting' | 'extended' | 'declined' | 'expired' | 'closed' | 'too_early' | 'max_rounds';

/** 대화 상대의 기본 정보 — partner_profile(room) 응답. ★ uuid·성별·선호는 없다. */
export type PartnerProfile = {
	nickname: string;
	bio: string;
	interests: string[];
	mbti: string | null;
	online: boolean;
};

export type ReportReason =
	| 'harassment'
	| 'sexual'
	| 'spam'
	| 'personal_info'
	| 'hate'
	| 'impersonation'
	| 'other';

export type SendResult =
	| { ok: true; row: MsgRow }
	| { ok: false; reason: 'duplicate' | 'closed' | 'rate_limited' | 'network' | 'other'; message?: string };

/**
 * 메시지 공감 — 서버 check 제약(message_reactions.emoji)과 같은 값. 이 순서대로 고르기 줄에 보인다.
 * 화나요·싫어요는 일부러 없다: 모르는 사람과의 대화에서 부정 반응은 공감보다 상처가 되기 쉽다.
 */
export const REACTIONS = [
	{ k: 'heart', e: '❤️', label: '하트' },
	{ k: 'laugh', e: '😂', label: '웃겨요' },
	{ k: 'wow', e: '😮', label: '놀라워요' },
	{ k: 'sad', e: '😢', label: '슬퍼요' },
	{ k: 'like', e: '👍', label: '좋아요' },
	{ k: 'fire', e: '🔥', label: '최고예요' }
] as const;
export type ReactionKey = (typeof REACTIONS)[number]['k'];
export const REACTION_EMOJI = Object.fromEntries(REACTIONS.map((r) => [r.k, r.e])) as Record<ReactionKey, string>;

/** message_reactions 행 — ★ 자리(seat)만, 사용자 식별자 없음. emoji = null 이면 취소된 것 */
export type ReactionRow = { message_id: number; room_id: string; seat: 1 | 2; emoji: ReactionKey | null };

export type ReactResult = 'ok' | 'closed' | 'not_found' | 'system' | 'bad_emoji' | 'network';
