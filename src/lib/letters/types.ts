/**
 * 익명편지 — 서버 RPC 응답 모양.
 * ★ uuid 가 없다. 이름(alias)은 편지마다 새로 뽑은 임시 이름이고, 채팅 닉네임과는 다른 공간이다.
 */
export type { ReportReason } from '../chat/types';
import type { LetterFmt } from './rich';

export type ReplyStatus = 'unassigned' | 'assigned' | 'replied';

/** letter_feed() 의 한 줄 */
export type LetterListItem = {
	id: number;
	/** 280자까지 잘린 미리보기 */
	body: string;
	/** 서식 — 전체 본문 기준이라 잘린 미리보기에서는 범위 밖이 무시된다 */
	fmt: LetterFmt | null;
	truncated: boolean;
	author_alias: string;
	is_mine: boolean;
	reply_status: ReplyStatus;
	comment_count: number;
	/** 하트 수 · 내가 눌렀는지 — 누가 눌렀는지는 오지 않는다 */
	like_count: number;
	liked: boolean;
	/** 내가 지정 답장자로 맡은 편지 */
	assigned_to_me: boolean;
	created_at: string;
};

/** letter_detail() 의 편지 본문 */
export type LetterBody = {
	id: number;
	body: string;
	fmt: LetterFmt | null;
	author_alias: string;
	is_mine: boolean;
	reply_status: ReplyStatus;
	like_count: number;
	liked: boolean;
	assigned_to_me: boolean | null;
	task_expires_at: string | null;
	created_at: string;
};

/** letter_detail() 의 댓글 한 개 — 평면 목록, parent_id 로 한 단계만 묶는다 */
export type CommentRow = {
	id: number;
	parent_id: number | null;
	/** 지워진 댓글이면 null */
	author_alias: string | null;
	/** 편지 작성자(OP)가 쓴 댓글 */
	is_op: boolean;
	is_mine: boolean;
	/** 지정 답장자의 답장 */
	is_designated: boolean;
	/** removed: 지워짐 / blocked: 내가 차단한(또는 나를 차단한) 사람 — 내용은 가린다 */
	hidden: 'removed' | 'blocked' | null;
	body: string | null;
	created_at: string;
};

export type CommentThread = CommentRow & { replies: CommentRow[] };

export type LetterDetail = {
	letter: LetterBody | null;
	comments: CommentRow[];
	/** 이 편지에서 내 이름. 아직 글을 안 썼으면 null (구경만 하면 이름이 생기지 않는다) */
	my_alias: string | null;
	server_now: string;
};

export type PostLetterResult =
	| { status: 'ok'; letter_id: number; alias: string }
	| { status: 'rate_limited'; retry_after_ms: number }
	| { status: 'not_eligible' | 'service_closed'; notice?: string };

export type PostCommentResult =
	| { status: 'ok'; comment_id: number; my_alias: string; designated: boolean }
	| { status: 'duplicate'; comment_id: number }
	| { status: 'rate_limited'; retry_after_ms: number }
	| { status: 'max_depth_exceeded' | 'parent_missing' | 'closed' | 'not_eligible' | 'service_closed' };

export type LikeResult =
	| { status: 'ok'; liked: boolean; like_count: number }
	| { status: 'closed' | 'not_eligible' | 'service_closed' };

export type ReplyTaskResult =
	| { status: 'assigned'; letter_id: number; expires_at: string }
	| { status: 'waiting'; reason: 'empty' | 'filtered'; poll_ms?: number }
	| { status: 'cooldown'; retry_after_ms?: number }
	| { status: 'not_eligible' }
	| { status: 'service_closed'; notice?: string };
