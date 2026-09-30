import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { rpc } from '../rpc';
import { notifyReaction, notifySent } from '../push';
import { requestModeration } from '../moderation';
import { ratePartner, type Reason, type Score } from '../manner';
import type { ChatTransport, TransportHandlers } from './transport';
import type {
	MsgRow,
	PartnerProfile,
	ReactResult,
	ReactionKey,
	ReactionRow,
	ReportReason,
	RoomRow,
	RoomSnap,
	SendResult,
	VoteResult,
	VoteRow
} from './types';

// ★ select('*') 금지 — 항상 명시 컬럼
const BASE_COLS = 'id, room_id, sender_seat, body, client_msg_id, created_at';
/**
 * 나중에 생긴 열 — reply_to(답장, Phase 18) · deleted_at(삭제, Phase 28)은 schema.sql 을 반영하기 전 DB 에는 없다.
 * 그 상태로 앱이 먼저 배포돼도 채팅 전체가 멈추지 않게, "없는 열" 오류가 나면 이 기기에서는 그 열을 빼고 쓴다.
 */
const optCols = new Set(['reply_to', 'deleted_at']);
const msgCols = () => [BASE_COLS, ...optCols].join(', ');
const missingCol = (e: { message?: string } | null) => [...optCols].find((c) => !!e && new RegExp(c).test(e.message ?? ''));

/** 메시지 조회·저장 — 없는 열이 있는 DB 면 그 열을 빼고 다시 */
async function withMsgCols<T extends { error: { message?: string } | null }>(run: (cols: string) => PromiseLike<T>): Promise<T> {
	let r = await run(msgCols());
	for (let c = missingCol(r.error); c; c = missingCol(r.error)) {
		optCols.delete(c);
		r = await run(msgCols());
	}
	return r;
}
const REACTION_COLS = 'message_id, room_id, seat, emoji';

/**
 * Supabase Realtime 기반 전송 — DB 방송(Broadcast) · 비공개 채널 (Phase 55).
 *
 * 메시지 · 방 상태 · 연장 투표 · 공감은 DB 트리거가 이 방 채널(room:<id>)에 직접 방송한다(schema.sql Phase 55).
 * 채널은 비공개라 참여할 때 한 번 "이 방 사람인가"를 DB 정책(rt_allowed)으로 확인한다 — 다른 사람은 참여 자체가 안 된다.
 * (예전 postgres_changes 는 변경마다 구독자마다 RLS 를 다시 돌리고 DB 가 변경 기록을 계속 훑었다 — 실DB 에서 가장 비싼 일이었다)
 * 타이핑은 DB 에 쓰면 쿼터를 태우므로 앱끼리 broadcast, 접속 여부는 presence (둘 다 같은 비공개 채널).
 */
export class SupabaseTransport implements ChatTransport {
	#ch: RealtimeChannel | null = null;
	#disposed = false;
	/**
	 * 상대가 지금 이 방 화면에 있는지 (presence). 있으면 푸시 알림 요청(/api/push)을 아예 보내지 않는다 —
	 * 서버도 "앱을 보고 있음"이면 어차피 안 보내지만, 요청 자체가 Workers 무료 한도(하루 10만)를 쓴다.
	 */
	#partnerHere = false;
	#seat: 1 | 2 = 1;

	connect(roomId: string, seat: 1 | 2, h: TransportHandlers) {
		this.disconnect();
		this.#disposed = false;
		this.#seat = seat;
		this.#partnerHere = false;

		const ch = supabase.channel(`room:${roomId}`, {
			config: {
				private: true,
				// ★ presence 키는 seat. user id 를 넣으면 익명성이 한 줄로 무너진다.
				presence: { key: String(seat) },
				broadcast: { self: false }
			}
		});

		// 이 방 행이 맞을 때만 — 방송 페이로드는 DB 트리거가 만든 행 그대로다
		const mine = (p: unknown): p is { room_id: string } => !!p && (p as { room_id?: string }).room_id === roomId;
		ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
			// 새 메시지 · 보낸 사람이 지움 (Phase 28)
			if (mine(payload) && 'client_msg_id' in payload) h.onMessage(payload as unknown as MsgRow);
		})
			.on('broadcast', { event: 'room' }, ({ payload }) => {
				if (payload && (payload as { id?: string }).id === roomId) h.onRoom(payload as RoomRow);
			})
			.on('broadcast', { event: 'vote' }, ({ payload }) => {
				// 마음 바꾸기도 같은 이벤트로 온다
				if (mine(payload) && 'seat' in payload) h.onVote(payload as unknown as VoteRow);
			})
			.on('broadcast', { event: 'reaction' }, ({ payload }) => {
				// 공감은 지우지 않고 emoji = null 로 바꾼다 — 취소도 같은 이벤트
				if (mine(payload) && 'seat' in payload) h.onReaction(payload as unknown as ReactionRow);
			})
			.on('broadcast', { event: 'typing' }, ({ payload }) => {
				const s = Number(payload?.seat);
				if (s === 1 || s === 2) h.onTyping(s);
			})
			.on('presence', { event: 'sync' }, () => {
				const seats = Object.keys(ch.presenceState())
					.map(Number)
					.filter((n) => n === 1 || n === 2);
				this.#partnerHere = seats.some((s) => s !== this.#seat);
				h.onPresence(seats);
			})
			.subscribe(async (status, err) => {
				if (this.#disposed) return;
				if (status === 'SUBSCRIBED') {
					// ★ presence 에는 seat 외 아무것도 싣지 않는다
					await ch.track({ seat });
					h.onSubscribed();
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
					h.onDown(err?.message ?? status);
				}
			});

		this.#ch = ch;
	}

	disconnect() {
		this.#disposed = true;
		this.#partnerHere = false; // 연결이 끊기면 모른다 — 알림은 보내는 쪽으로
		if (this.#ch) {
			// 방이 닫히면 즉시 해제 — 붙들고 있으면 Realtime 동시 연결 한도를 태운다
			void supabase.removeChannel(this.#ch);
			this.#ch = null;
		}
	}

	async send(roomId: string, seat: 1 | 2, body: string, clientMsgId: string, replyTo: number | null = null): Promise<SendResult> {
		try {
			// 답장일 때만 reply_to 를 싣는다 — 보통 메시지는 Phase 18 전 DB 에서도 그대로 된다
			const row = { room_id: roomId, sender_seat: seat, body, client_msg_id: clientMsgId, ...(replyTo != null && { reply_to: replyTo }) };
			const { data, error } = await withMsgCols((cols) => supabase.from('messages').insert(row).select(cols).single());
			if (!error) {
				const sent = data as unknown as MsgRow; // 열 목록이 문자열 변수라 supabase 타입 추론이 안 된다
				if (!this.#partnerHere) notifySent(sent.id); // 상대가 이 방에 없으면 — 보낼지는 서버가 한 번 더 판단
				requestModeration(); // 검열봇 2단 (AI 검토가 켜져 있을 때만)
				return { ok: true, row: sent };
			}

			const m = error.message ?? '';
			if (error.code === '23505') return { ok: false, reason: 'duplicate' };
			if (m.includes('rate_limited')) return { ok: false, reason: 'rate_limited' };
			// 검열 1단 — DB 트리거가 신상정보·금칙어를 막았다
			if (m.includes('personal_info')) return { ok: false, reason: 'blocked', code: 'personal_info' };
			if (m.includes('blocked_word')) return { ok: false, reason: 'blocked', code: 'blocked_word' };
			// room_is_writable 위반 = 방이 만료/종료됐다 (클라 시계가 틀렸거나 상대가 나감)
			if (error.code === '42501' || m.includes('row-level security'))
				return { ok: false, reason: 'closed' };
			return { ok: false, reason: 'other', message: m };
		} catch (e) {
			return { ok: false, reason: 'network', message: String(e) };
		}
	}

	async fetchAfter(roomId: string, afterId: number): Promise<MsgRow[]> {
		const out: MsgRow[] = [];
		let cursor = afterId;
		for (;;) {
			const { data, error } = await withMsgCols((cols) =>
				supabase.from('messages').select(cols).eq('room_id', roomId).gt('id', cursor).order('id', { ascending: true }).limit(200)
			);
			const rows = data as unknown as MsgRow[] | null;
			if (error || !rows?.length) break;
			out.push(...rows);
			cursor = rows[rows.length - 1].id;
			if (rows.length < 200) break;
		}
		return out;
	}

	async fetchRecent(roomId: string, n: number): Promise<MsgRow[]> {
		const { data } = await withMsgCols((cols) =>
			supabase.from('messages').select(cols).eq('room_id', roomId).order('id', { ascending: false }).limit(n)
		);
		return (data as unknown as MsgRow[] | null) ?? [];
	}

	snapshot(roomId: string) {
		return rpc<RoomSnap>('room_snapshot', { p_room: roomId });
	}

	ack(roomId: string) {
		return rpc<RoomSnap>('ack_room', { p_room: roomId });
	}

	closeIfExpired(roomId: string) {
		return rpc<RoomSnap>('close_if_expired', { p_room: roomId });
	}

	leave(roomId: string, skip: boolean) {
		return rpc<RoomSnap>('leave_room', { p_room: roomId, p_skip: skip });
	}

	vote(roomId: string, agree: boolean, hint: string | null = null) {
		// 힌트는 적을 차례일 때만 보낸다 (Phase 28 전 DB 에는 p_hint 가 없다)
		const args = hint ? { p_room: roomId, p_agree: agree, p_hint: hint } : { p_room: roomId, p_agree: agree };
		return rpc<{ result: VoteResult; snap: RoomSnap }>('vote_extension', args);
	}

	view(roomId: string, on: boolean) {
		return rpc<RoomSnap>('room_view', { p_room: roomId, p_on: on });
	}

	async deleteMessage(messageId: number) {
		return (await rpc<{ status: 'ok' | 'closed' | 'not_found' }>('delete_message', { p_msg: messageId })).status;
	}

	report(roomId: string, reason: ReportReason, note: string) {
		return rpc<{ status: 'ok' | 'already'; snap: RoomSnap }>('report_partner', { p_room: roomId, p_reason: reason, p_note: note });
	}

	async block(roomId: string) {
		return (await rpc<{ snap: RoomSnap }>('block_partner', { p_room: roomId })).snap;
	}

	async markRead(roomId: string, lastId: number) {
		await supabase.rpc('mark_read', { p_room: roomId, p_last_id: lastId });
	}

	async react(roomId: string, messageId: number, emoji: ReactionKey | null): Promise<ReactResult> {
		try {
			const { data, error } = await supabase.rpc('react_message', { p_message: messageId, p_emoji: emoji });
			if (error) return 'network';
			const status = (data as { status: ReactResult }).status;
			// 공감을 달았을 때만 (취소는 알리지 않는다). 보낼지 말지는 서버가 정한다.
			if (status === 'ok' && emoji && !this.#partnerHere) notifyReaction(messageId);
			return status;
		} catch {
			return 'network';
		}
	}

	async fetchReactions(roomId: string): Promise<ReactionRow[]> {
		const { data, error } = await supabase
			.from('message_reactions')
			.select(REACTION_COLS)
			.eq('room_id', roomId)
			.not('emoji', 'is', null);
		if (error) throw error; // 빈 목록으로 착각해 화면의 공감을 지우지 않게
		return (data as ReactionRow[] | null) ?? [];
	}

	rate(roomId: string, score: Score, reasons: Reason[]) {
		return ratePartner(roomId, score, reasons);
	}

	partnerProfile(roomId: string) {
		return rpc<PartnerProfile>('partner_profile', { p_room: roomId });
	}

	typing(seat: 1 | 2) {
		void this.#ch?.send({ type: 'broadcast', event: 'typing', payload: { seat } });
	}
}
