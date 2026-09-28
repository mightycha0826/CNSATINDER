import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { whileVisible } from './visible';

/** my_rooms() 의 한 줄. ★ uuid 는 room_id 뿐. */
export type InboxRoom = {
	room_id: string;
	status: 'pending' | 'active' | 'closed';
	my_seat: 1 | 2;
	partner_alias: string;
	expires_at: string;
	round: number;
	/** 한쪽이라도 대화 화면을 안 봐서 시간이 멈춤 (Phase 28) — 남은 시간 = expires_at - server_now */
	paused?: boolean;
	/** 둘 다 고정한 대화 (Phase 29) — 시간 제한 없음(expires_at = infinity), 목록 맨 위, 동시 대화 개수에 안 셈 */
	pinned?: boolean;
	/** 내가 이 방 화면을 한 번이라도 열었는지 — 아니면 "새 대화" */
	joined: boolean;
	partner_online: boolean;
	last_body: string | null;
	last_seat: 0 | 1 | 2 | null;
	last_at: string | null;
	unread: number;
};

const POLL_MS = 60_000;
const DEBOUNCE_MS = 300;

/**
 * 대화 목록 (인스타 DM 받은편지함).
 *
 * 실시간: 열린 방들의 새 메시지·방 상태 변화를 채널 하나로 받는다 (filter room_id=in.(…)).
 *   행 내용은 쓰지 않고 "바뀌었다"는 신호로만 쓴다 — 목록은 언제나 my_rooms() 한 번으로 다시 그린다.
 *   (미리보기·안 읽은 수·온라인 표시를 한 곳에서 계산하기 위해)
 * 안전망: 60초마다 다시 읽는다. Realtime 은 전달을 보장하지 않고, 상대 온라인 표시는 이벤트가 없다.
 *
 * 앱 전체가 하나를 같이 쓴다 (INBOX, Phase 35) — 앱 틀((app)/+layout)이 켜 두고, 홈은 기억해 둔 목록을 바로 그린다.
 * 새 메시지 · 새 대화가 오면 onNew 로 알린다 → 앱 안 알림 띠 (다른 화면을 보고 있을 때).
 */
export class Inbox {
	rooms = $state<InboxRoom[]>([]);
	loaded = $state(false);
	/** serverNow - clientNow (ms) — 남은 시간 표시용 */
	skew = $state(0);
	/** 마지막으로 불러온 서버 시각 (ms) — 멈춘 방의 남은 시간 계산용 */
	serverAt = $state(0);

	#ch: RealtimeChannel | null = null;
	#ids = '';
	#stopPoll: (() => void) | null = null;
	#debounce: ReturnType<typeof setTimeout> | null = null;
	#stopped = false;
	#running = 0;
	/** 방마다 지난번 안 읽은 수 — 늘었으면 새 메시지 (처음 불러올 때는 알리지 않는다) */
	#seen: Map<string, number> | null = null;
	/** 새 메시지 · 새로 연결된 대화 */
	onNew: ((r: InboxRoom) => void) | null = null;

	start() {
		if (this.#running++ > 0) return; // 이미 켜져 있다
		this.#stopped = false;
		void this.load();
		this.#stopPoll = whileVisible(() => void this.load(), POLL_MS);
	}

	stop() {
		if (--this.#running > 0) return;
		this.#running = 0;
		this.#stopped = true;
		this.#stopPoll?.();
		this.#stopPoll = null;
		if (this.#debounce) clearTimeout(this.#debounce);
		this.#unsubscribe();
		this.#ids = '';
	}

	async load() {
		const { data, error } = await supabase.rpc('my_rooms');
		if (this.#stopped || error || !data) return;
		const res = data as { rooms: InboxRoom[]; server_now: string };
		this.skew = Date.parse(res.server_now) - Date.now();
		this.serverAt = Date.parse(res.server_now);
		this.#announce(res.rooms);
		this.rooms = res.rooms;
		this.loaded = true;
		this.#resubscribe(res.rooms.map((r) => r.room_id));
	}

	#announce(rooms: InboxRoom[]) {
		const prev = this.#seen;
		this.#seen = new Map(rooms.map((r) => [r.room_id, r.unread]));
		if (!prev || !this.onNew) return;
		for (const r of rooms) {
			const was = prev.get(r.room_id);
			const fresh = was === undefined ? !r.joined : r.unread > was && r.last_seat !== r.my_seat && r.last_seat !== 0;
			if (fresh) this.onNew(r);
		}
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

/** 앱 전체가 같이 쓰는 대화 목록 */
export const INBOX = new Inbox();
