import { supabase } from '../supabase';
import { requestModeration } from '../moderation';
import { notifyDm } from '../push';
import { waitText } from '../time';
import type { LetterFmt } from './rich';

/**
 * 익명편지 (Phase 32) — 편지 한 통 = 봉투 하나. 받은 편지함 · 보낸 편지함을 따로, 답장도 편지로만.
 * 학생을 이름으로 찾아 보내면, 받는 사람에게 보낸 사람은 "익명의 ○학생"(성별만)으로 보인다.
 * 내가 이름으로 보낸 사람이 답장하면 그 사람 이름으로 보인다 (이미 아는 사이).
 * 서버는 전부 RPC (supabase/schema.sql Phase 23 · 32). 표는 private 라 직접 읽을 수 없다.
 */
export type Gender = 'm' | 'f' | 'x';
export type Box = 'received' | 'sent';
export type DmPerson = { id: string; name: string; grade: number | null; checked: boolean };

/** 편지함의 한 통 — 봉투 겉면에 쓰일 것만 (본문은 봉투를 열어야 받는다) */
export type MailItem = {
	id: number;
	thread_id: number;
	created_at: string;
	removed: boolean;
	thread_status: 'open' | 'closed' | 'removed';
	/** 받은 편지: 모르는 사람이면 성별만, 내가 이름으로 보낸 사람의 답장이면 이름 */
	from_gender?: Gender | null;
	from_name?: string | null;
	/** 받은 사람이 봉투를 열었는지 (받은 편지 = 내가, 보낸 편지 = 상대가) */
	opened: boolean;
	/** 답장으로 온 / 보낸 편지 */
	is_reply: boolean;
	/** 보낸 편지: 이름으로 보냈으면 받는 사람 이름 · 학년, 답장이었으면 상대 성별 */
	to_name?: string | null;
	to_grade?: number | null;
	to_gender?: Gender | null;
	/** 보낸 편지에 답장이 왔는지 */
	replied?: boolean | null;
};

/** 봉투를 연 편지 한 통 */
export type Letter = MailItem & {
	status: 'ok';
	role: Box;
	body: string | null;
	fmt?: LetterFmt | null;
	closed_by: 'sender' | 'recipient' | 'staff' | null;
	/** 받은 편지이고 줄기가 열려 있으면 답장할 수 있다 */
	can_reply: boolean;
	/** 내가 답 없이 3통을 보냈다 — 상대가 답할 때까지 못 쓴다 */
	wait_reply: boolean;
	/** 방금 처음 열었다 — 봉투 여는 연출은 이때만 */
	first_open?: boolean;
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

// ── 이름표 ──
export const genderWord = (g: Gender | null | undefined) => (g === 'm' ? '남학생' : g === 'f' ? '여학생' : '학생');
export const anonName = (g: Gender | null | undefined) => `익명의 ${genderWord(g)}`;
/** 받은 편지의 From. */
export const fromLabel = (l: Pick<MailItem, 'from_name' | 'from_gender'>) => l.from_name ?? anonName(l.from_gender);
/** 보낸 편지의 To. (학년은 따로) */
export const toLabel = (l: Pick<MailItem, 'to_name' | 'to_gender'>) => l.to_name ?? anonName(l.to_gender);

/** 소인 날짜 — "9.27" */
export const stampDate = (iso: string) => {
	const d = new Date(iso);
	return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
};
/** 편지지 날짜 — "2026년 9월 27일" */
export const paperDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

// ── 읽기 ──
/** 두 글자 이상. 받기를 끈 사람 · 차단한 사이는 나오지 않는다 */
export const searchPeople = (q: string) => rpc<DmPerson[]>('dm_search', { p_q: q });

export async function fetchMailbox(box: Box, before: number | null = null): Promise<MailItem[]> {
	const r = await rpc<{ letters: MailItem[] } | null>('dm_mailbox', { p_box: box, p_before: before });
	return r?.letters ?? [];
}

/** 안 연 받은 편지 수 (하단 탭 빨간 점) */
export const fetchUnread = async () => (await rpc<number | null>('dm_unread')) ?? 0;

/** 봉투 열기 — 받은 사람이 열면 보낸 쪽에 "읽음" */
export const openLetter = (id: number) => rpc<Letter | { status: 'not_found' }>('dm_open', { p_msg: id });

// ── 쓰기 ──
/** 보내고 나면 알림 · AI 검토를 부탁한다 (기다리지 않는다) */
function afterSend(r: SendResult) {
	if (r.status !== 'ok') return;
	notifyDm(r.msg_id);
	requestModeration();
}

/** 새 편지 — body 는 앞뒤 공백을 잘라서 (서식 위치가 본문 기준이라 서버가 자른 것과 같아야 한다) */
export async function sendLetter(to: string, body: string, fmt: LetterFmt | null = null) {
	const r = await rpc<SendResult>('dm_send', { p_to: to, p_body: body, p_fmt: fmt });
	afterSend(r);
	return r;
}

/** 받은 편지 한 통에 편지로 답장 */
export async function replyToLetter(msgId: number, body: string, fmt: LetterFmt | null = null) {
	const r = await rpc<SendResult>('dm_reply_to', { p_msg: msgId, p_body: body, p_fmt: fmt });
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
			return '답장이 오기 전에는 3통까지 보낼 수 있어요';
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
