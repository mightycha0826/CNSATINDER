import { supabase } from '../supabase';
import { notifyLetterComment } from '../push';
import type {
	CommentRow,
	CommentThread,
	LetterDetail,
	LetterListItem,
	PostCommentResult,
	PostLetterResult,
	ReplyTaskResult,
	ReportReason
} from './types';

/**
 * 익명편지 서버 호출 — 전부 RPC. 편지·댓글 테이블에는 insert 권한이 아예 없다
 * (이름 발급이 잠금 + 재시도가 필요한 절차라 RPC 안에서만 한다).
 *
 * 채팅의 ChatTransport 같은 인터페이스는 두지 않는다. 그건 실시간 전송을 나중에
 * Durable Object 로 갈아끼우기 위한 것이고, 편지는 실시간이 필요 없다.
 */

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
	// 개발 전용 — /dev/letters 미리보기가 가짜 서버를 끼운다 (배포 빌드에서는 이 분기가 통째로 빠진다)
	if (import.meta.env.DEV && typeof window !== 'undefined') {
		const fake = (window as unknown as { __LETTERS_FAKE__?: (fn: string, a?: Record<string, unknown>) => unknown })
			.__LETTERS_FAKE__;
		if (fake) return (await fake(fn, args)) as T;
	}
	const { data, error } = await supabase.rpc(fn, args);
	if (error) throw error;
	return data as T;
}

export async function fetchFeed(cursor: number | null = null) {
	return rpc<{ letters: LetterListItem[]; server_now: string }>('letter_feed', { p_cursor: cursor });
}

export function fetchLetter(id: number) {
	return rpc<LetterDetail>('letter_detail', { p_letter: id });
}

export function postLetter(body: string) {
	return rpc<PostLetterResult>('post_letter', { p_body: body });
}

/** 댓글·대댓글. 성공하면 받을 사람(편지 작성자 또는 부모 댓글 작성자)에게 알림을 요청한다. */
export async function postComment(letterId: number, parentId: number | null, body: string, clientId: string) {
	const r = await rpc<PostCommentResult>('post_comment', {
		p_letter: letterId,
		p_parent: parentId,
		p_body: body,
		p_client_id: clientId
	});
	if (r.status === 'ok') notifyLetterComment(r.comment_id);
	return r;
}

export function deleteMyLetter(id: number) {
	return rpc<{ status: 'ok' }>('delete_my_letter', { p_letter: id });
}

export function deleteMyComment(id: number) {
	return rpc<{ status: 'ok' }>('delete_my_comment', { p_comment: id });
}

export function requestReplyTask() {
	return rpc<ReplyTaskResult>('request_letter_reply_task');
}

export function reportLetter(letterId: number, commentId: number | null, reason: ReportReason, note: string) {
	return rpc<{ status: 'ok' | 'already' | 'self' | 'not_found' }>('report_letter', {
		p_letter: letterId,
		p_comment: commentId,
		p_reason: reason,
		p_note: note
	});
}

export function blockLetterAuthor(letterId: number, commentId: number | null) {
	return rpc<{ status: 'ok' | 'self' | 'not_found' }>('block_letter_author', {
		p_letter: letterId,
		p_comment: commentId
	});
}

/** 평면 댓글 목록 → 최상위 댓글 + 그 아래 대댓글 (딱 두 단계) */
export function threadComments(rows: CommentRow[]): CommentThread[] {
	const top: CommentThread[] = [];
	const byId = new Map<number, CommentThread>();
	for (const r of rows) {
		if (r.parent_id == null) {
			const t = { ...r, replies: [] };
			top.push(t);
			byId.set(r.id, t);
		}
	}
	for (const r of rows) {
		if (r.parent_id != null) byId.get(r.parent_id)?.replies.push(r);
	}
	return top;
}
