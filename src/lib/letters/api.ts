import { supabase } from '../supabase';
import { requestModeration } from '../moderation';
import { notifyDm } from '../push';
import { waitText } from '../time';
import type { LetterFmt } from './rich';

/**
 * 이름 편지 (Phase 23) — 학생을 이름으로 찾아 익명으로 편지를 보내고, 둘이 주고받는다.
 * 받는 사람에게는 보낸 사람이 편지마다 붙는 익명 이름으로만 보인다. 보낸 사람은 받는 사람의 이름 · 학년을 안다.
 * 서버는 전부 RPC (supabase/schema.sql Phase 23). 표는 private 라 직접 읽을 수 없다.
 */
export type DmPerson = { id: string; name: string; grade: number | null; checked: boolean };

export type DmRole = 'sent' | 'received';
export type DmItem = {
	id: number;
	role: DmRole;
	/** 받은 편지 = 보낸 사람의 익명 이름, 보낸 편지 = 받는 사람 이름 */
	title: string;
	grade: number | null;
	status: 'open' | 'closed';
	last_at: string;
	last_body: string | null;
	unread: number;
};

/** fmt = 서식 (편지 쓰기 편집기로 쓴 새 편지만, 답장은 null) */
export type DmMsg = { id: number; mine: boolean; body: string | null; fmt?: LetterFmt | null; removed: boolean; created_at: string };
export type DmThread = {
	status: 'ok';
	id: number;
	role: DmRole;
	title: string;
	grade: number | null;
	thread_status: 'open' | 'closed';
	closed_by: 'sender' | 'recipient' | 'staff' | null;
	/** 답 없이 3개를 보냈다 — 상대가 답할 때까지 못 쓴다 */
	wait_reply: boolean;
	messages: DmMsg[];
	server_now: string;
};

export type SendResult =
	| { status: 'ok'; thread_id: number; msg_id: number }
	| { status: 'rate_limited'; retry_after_ms: number }
	| { status: 'wait_reply'; thread_id?: number }
	| { status: 'not_available' | 'restricted' | 'no_name' | 'bad_text' | 'closed' | 'not_found' };

const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
	const { data, error } = await supabase.rpc(fn, args);
	if (error) throw error;
	return data as T;
};

/** 두 글자 이상. 받기를 끈 사람 · 차단한 사이는 나오지 않는다 */
export const searchPeople = (q: string) => rpc<DmPerson[]>('dm_search', { p_q: q });

export const fetchInbox = () => rpc<{ threads: DmItem[]; server_now: string }>('dm_inbox');

export const fetchThread = (id: number) => rpc<DmThread | { status: 'not_found' }>('dm_thread', { p_thread: id });

/** 보내고 나면 알림 · AI 검토를 부탁한다 (기다리지 않는다) */
function afterSend(r: SendResult) {
	if (r.status !== 'ok') return;
	notifyDm(r.msg_id);
	requestModeration();
}

/** body 는 앞뒤 공백을 잘라서 — 서식 위치가 본문 기준이라 서버가 자른 것과 같아야 한다 */
export async function sendLetter(to: string, body: string, fmt: LetterFmt | null = null) {
	const r = await rpc<SendResult>('dm_send', { p_to: to, p_body: body, p_fmt: fmt });
	afterSend(r);
	return r;
}

export async function replyLetter(thread: number, body: string) {
	const r = await rpc<SendResult>('dm_reply', { p_thread: thread, p_body: body });
	afterSend(r);
	return r;
}

export const closeThread = (id: number) => rpc<{ status: string }>('dm_close', { p_thread: id });
export const blockThread = (id: number) => rpc<{ status: string }>('dm_block', { p_thread: id });
export const reportThread = (id: number, reason: string, note: string) =>
	rpc<{ status: string }>('dm_report', { p_thread: id, p_reason: reason, p_note: note });

/** 편지 받기 (설정) — 끄면 검색에 나오지 않고 새 편지를 받지 않는다 */
export async function setLettersOpen(on: boolean, uid: string) {
	const { error } = await supabase.from('profiles').update({ letters_open: on }).eq('id', uid);
	if (error) throw error;
}

/** 상태 코드 → 사용자 문구 (ok 는 null) */
export function sendError(r: SendResult): string | null {
	switch (r.status) {
		case 'ok':
			return null;
		case 'rate_limited':
			return `새 편지는 하루에 몇 통만 보낼 수 있어요. ${waitText(r.retry_after_ms)} 다시 보낼 수 있어요`;
		case 'wait_reply':
			return '상대가 답하기 전에는 3개까지 보낼 수 있어요';
		case 'not_available':
			return '이 사람에게는 지금 편지를 보낼 수 없어요';
		case 'restricted':
			return '이용이 제한된 계정이에요';
		case 'no_name':
			return '먼저 내 이름을 확인해 주세요';
		case 'bad_text':
			return '1~1000자로 적어 주세요';
		case 'closed':
			return '끝난 편지예요';
		default:
			return '편지를 찾을 수 없어요';
	}
}
