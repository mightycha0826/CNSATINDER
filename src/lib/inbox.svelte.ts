import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** my_rooms() 의 한 줄. ★ uuid 는 room_id 뿐. */
export type InboxRoom = {
	room_id: string;
	status: 'pending' | 'active' | 'closed';
	my_seat: 1 | 2;
	partner_alias: string;
	expires_at: string;
	round: number;
	/** 내가 이 방 화면을 한 번이라도 열었는지 — 아니면 "새 대화" */
	joined: boolean;
	partner_online: boolean;
	last_body: string | null;
	last_seat: 0 | 1 | 2 | null;
	last_at: string | null;
	unread: number;
};

const POLL_MS = 20_000;
const DEBOUNCE_MS = 300;

/**
 * 대화 목록 (인스타 DM 받은편지함).
 *
 * 실시간: 열린 방들의 새 메시지·방 상태 변화를 채널 하나로 받는다 (filter room_id=in.(…)).
 *   행 내용은 쓰지 않고 "바뀌었다"는 신호로만 쓴다 — 목록은 언제나 my_rooms() 한 번으로 다시 그린다.
 *   (미리보기·안 읽은 수·온라인 표시를 한 곳에서 계산하기 위해)
 * 안전망: 20초마다 다시 읽는다. Realtime 은 전달을 보장하지 않고, 상대 온라인 표시는 이벤트가 없다.
 */
export class Inbox {
	rooms = $state<InboxRoom[]>([]);
	loaded = $state(false);
	/** serverNow - clientNow (ms) — 남은 시간 표시용 */
	skew = $state(0);

	#ch: RealtimeChannel | null = null;
	#ids = '';
	#poll: ReturnType<typeof setInterval> | null = null;
	#debounce: ReturnType<typeof setTimeout> | null = null;
	#stopped = false;
	#onVis = () => {
		if (document.visibilityState === 'visible') void this.load();
	};

	start() {
		this.#stopped = false;
		void this.load();
		this.#poll = setInterval(() => {
			if (document.visibilityState === 'visible') void this.load();
		}, POLL_MS);
		document.addEventListener('visibilitychange', this.#onVis);
	}

	stop() {
		this.#stopped = true;
		if (this.#poll) clearInterval(this.#poll);
		if (this.#debounce) clearTimeout(this.#debounce);
		document.removeEventListener('visibilitychange', this.#onVis);
		this.#unsubscribe();
		this.#ids = '';
	}

	async load() {
		const { data, error } = await supabase.rpc('my_rooms');
		if (this.#stopped || error || !data) return;
		const res = data as { rooms: InboxRoom[]; server_now: string };
		this.skew = Date.parse(res.server_now) - Date.now();
		this.rooms = res.rooms;
		this.loaded = true;
		this.#resubscribe(res.rooms.map((r) => r.room_id));
	}

	#soon() {
		if (this.#debounce) clearTimeout(this.#debounce);
		this.#debounce = setTimeout(() => void this.load(), DEBOUNCE_MS);
	}

	#resubscribe(ids: string[]) {
		const key = [...ids].sort().join(',');
		if (key === this.#ids) return;
		this.#ids = key;
		this.#unsubscribe();
		if (!ids.length) return;

		const list = `(${ids.join(',')})`;
		const ch = supabase.channel(`inbox:${crypto.randomUUID()}`);
		ch.on(
			'postgres_changes',
			{ event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=in.${list}` },
			() => this.#soon()
		)
			.on(
				'postgres_changes',
				{ event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=in.${list}` },
				() => this.#soon()
			)
			.subscribe();
		this.#ch = ch;
	}

	#unsubscribe() {
		if (this.#ch) void supabase.removeChannel(this.#ch);
		this.#ch = null;
	}
}
