import type { Msg, MsgRow, MsgState } from './types';

export type MessageUpdate = Partial<MsgRow> & { client_msg_id: string };

/** 낙관적 전송 · 서버 응답 · 방송을 하나의 메시지로 합친다. 방의 연결 수명과는 독립적이다. */
export class MessageLedger {
	rows = $state<Msg[]>([]);
	maxId = 0;
	#byCid = new Map<string, Msg>();

	constructor(
		private readonly roomId: string,
		private readonly seat: () => 1 | 2,
		private readonly serverNow: () => number
	) {}

	get(clientMsgId: string) {
		return this.#byCid.get(clientMsgId);
	}

	upsert(row: MessageUpdate, state: MsgState, sort = true) {
		const prev = this.get(row.client_msg_id);
		const oldId = prev?.id;
		if (prev) {
			// 확정된 id 와 삭제는 늦게 도착한 낙관적 행 · 옛 방송으로 되돌리지 않는다.
			if (row.id != null) prev.id = row.id;
			if (row.created_at) prev.created_at = row.created_at;
			prev.state = prev.id != null ? 'sent' : state;
			if (row.deleted_at && !prev.deleted_at) {
				prev.deleted_at = row.deleted_at;
				prev.body = row.body ?? prev.body;
			}
		} else {
			this.rows.push({
				id: row.id ?? null,
				room_id: row.room_id ?? this.roomId,
				sender_seat: row.sender_seat ?? this.seat(),
				body: row.body ?? '',
				client_msg_id: row.client_msg_id,
				created_at: row.created_at ?? new Date(this.serverNow()).toISOString(),
				reply_to: row.reply_to ?? null,
				deleted_at: row.deleted_at ?? null,
				state: row.id != null ? 'sent' : state
			});
			// 배열에 들어간 $state 프록시를 보관해야 이후 확정 · 삭제가 화면에 반영된다.
			this.#byCid.set(row.client_msg_id, this.rows[this.rows.length - 1]);
		}
		if (row.id != null) this.maxId = Math.max(this.maxId, row.id);
		// 확정 id 순. 아직 id 가 없는 내 메시지는 항상 맨 아래.
		if (sort && ((!prev && (this.rows.at(-2)?.id ?? Infinity) > (row.id ?? Infinity)) || (prev && oldId !== prev.id))) {
			this.rows.sort((a, b) => (a.id ?? Infinity) - (b.id ?? Infinity));
		}
	}

	merge(rows: MessageUpdate[], state: MsgState) {
		for (const row of rows) this.upsert(row, state, false);
		this.rows.sort((a, b) => (a.id ?? Infinity) - (b.id ?? Infinity));
	}

	/** 에코로 이미 확정된 메시지는 늦은 전송 실패가 와도 성공 상태를 지킨다. */
	fail(clientMsgId: string, state: 'failed' | 'rate_limited' = 'failed') {
		const message = this.get(clientMsgId);
		if (message && message.id == null) message.state = state;
	}

	remove(clientMsgId: string) {
		const index = this.rows.findIndex((message) => message.client_msg_id === clientMsgId);
		if (index >= 0) this.rows.splice(index, 1);
		this.#byCid.delete(clientMsgId);
	}
}
