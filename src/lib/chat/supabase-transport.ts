import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { ChatTransport, TransportHandlers } from './transport';
import type { MsgRow, ReportReason, RoomRow, RoomSnap, SendResult, VoteResult, VoteRow } from './types';

// ★ select('*') 금지 — 항상 명시 컬럼
const MSG_COLS = 'id, room_id, sender_seat, body, client_msg_id, created_at';

/**
 * Supabase Realtime(postgres_changes) 기반 전송.
 *
 * postgres_changes 를 쓰는 이유: 행마다 RLS 가 재평가되므로 잘못된 상대에게 전달되는 것이
 * 구조적으로 불가능하다. 방당 구독자가 2명이라 비용도 작다.
 * 타이핑은 DB 에 쓰면 쿼터를 태우므로 broadcast, 접속 여부는 presence.
 */
export class SupabaseTransport implements ChatTransport {
	#ch: RealtimeChannel | null = null;
	#disposed = false;

	connect(roomId: string, seat: 1 | 2, h: TransportHandlers) {
		this.disconnect();
		this.#disposed = false;

		const ch = supabase.channel(`room:${roomId}`, {
			config: {
				// ★ presence 키는 seat. user id 를 넣으면 익명성이 한 줄로 무너진다.
				presence: { key: String(seat) },
				broadcast: { self: false }
			}
		});

		ch.on(
			'postgres_changes',
			{ event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
			(p) => h.onMessage(p.new as MsgRow)
		)
			.on(
				'postgres_changes',
				{ event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
				(p) => h.onRoom(p.new as RoomRow)
			)
			.on(
				'postgres_changes',
				// 마음 바꾸기는 upsert(UPDATE) 로 오므로 전체 이벤트를 받는다
				{ event: '*', schema: 'public', table: 'extension_votes', filter: `room_id=eq.${roomId}` },
				(p) => {
					if (p.new && 'seat' in p.new) h.onVote(p.new as VoteRow);
				}
			)
			.on('broadcast', { event: 'typing' }, ({ payload }) => {
				const s = Number(payload?.seat);
				if (s === 1 || s === 2) h.onTyping(s);
			})
			.on('presence', { event: 'sync' }, () => {
				h.onPresence(
					Object.keys(ch.presenceState())
						.map(Number)
						.filter((n) => n === 1 || n === 2)
				);
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
		if (this.#ch) {
			// 방이 닫히면 즉시 해제 — 붙들고 있으면 Realtime 동시 연결 한도를 태운다
			void supabase.removeChannel(this.#ch);
			this.#ch = null;
		}
	}

	async send(roomId: string, seat: 1 | 2, body: string, clientMsgId: string): Promise<SendResult> {
		try {
			const { data, error } = await supabase
				.from('messages')
				.insert({ room_id: roomId, sender_seat: seat, body, client_msg_id: clientMsgId })
				.select(MSG_COLS)
				.single();
			if (!error) return { ok: true, row: data as MsgRow };

			const m = error.message ?? '';
			if (error.code === '23505') return { ok: false, reason: 'duplicate' };
			if (m.includes('rate_limited')) return { ok: false, reason: 'rate_limited' };
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
			const { data, error } = await supabase
				.from('messages')
				.select(MSG_COLS)
				.eq('room_id', roomId)
				.gt('id', cursor)
				.order('id', { ascending: true })
				.limit(200);
			if (error || !data?.length) break;
			out.push(...(data as MsgRow[]));
			cursor = data[data.length - 1].id;
			if (data.length < 200) break;
		}
		return out;
	}

	async fetchRecent(roomId: string, n: number): Promise<MsgRow[]> {
		const { data } = await supabase
			.from('messages')
			.select(MSG_COLS)
			.eq('room_id', roomId)
			.order('id', { ascending: false })
			.limit(n);
		return (data as MsgRow[] | null) ?? [];
	}

	async snapshot(roomId: string): Promise<RoomSnap> {
		const { data, error } = await supabase.rpc('room_snapshot', { p_room: roomId });
		if (error) throw error;
		return data as RoomSnap;
	}

	async #rpcSnap(fn: string, args: Record<string, unknown>): Promise<RoomSnap> {
		const { data, error } = await supabase.rpc(fn, args);
		if (error) throw error;
		return data as RoomSnap;
	}

	ack(roomId: string) {
		return this.#rpcSnap('ack_room', { p_room: roomId });
	}

	closeIfExpired(roomId: string) {
		return this.#rpcSnap('close_if_expired', { p_room: roomId });
	}

	leave(roomId: string, skip: boolean) {
		return this.#rpcSnap('leave_room', { p_room: roomId, p_skip: skip });
	}

	async vote(roomId: string, agree: boolean) {
		const { data, error } = await supabase.rpc('vote_extension', { p_room: roomId, p_agree: agree });
		if (error) throw error;
		return data as { result: VoteResult; snap: RoomSnap };
	}

	async report(roomId: string, reason: ReportReason, note: string) {
		const { data, error } = await supabase.rpc('report_partner', { p_room: roomId, p_reason: reason, p_note: note });
		if (error) throw error;
		return data as { status: 'ok' | 'already'; snap: RoomSnap };
	}

	async block(roomId: string) {
		const { data, error } = await supabase.rpc('block_partner', { p_room: roomId });
		if (error) throw error;
		return (data as { snap: RoomSnap }).snap;
	}

	async markRead(roomId: string, lastId: number) {
		await supabase.rpc('mark_read', { p_room: roomId, p_last_id: lastId });
	}

	typing(seat: 1 | 2) {
		void this.#ch?.send({ type: 'broadcast', event: 'typing', payload: { seat } });
	}
}
