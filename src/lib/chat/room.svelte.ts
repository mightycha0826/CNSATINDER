import type { ChatTransport } from './transport';
import { SupabaseTransport } from './supabase-transport';
import type {
	Msg,
	MsgRow,
	PartnerProfile,
	ReactResult,
	ReactionKey,
	ReactionRow,
	ReportReason,
	RoomRow,
	RoomSnap,
	VoteResult,
	VoteRow
} from './types';

const TYPING_SHOW_MS = 3000;
const TYPING_SEND_EVERY_MS = 1500;
const TAIL_SWEEP_DELAY_MS = 1500;
const BG_RECREATE_MS = 10_000;
/**
 * 안전망 동기화 주기. Supabase Realtime 은 전달을 보장하지 않는다 —
 * 소켓이 멀쩡히 연결된 채로 메시지 하나가 조용히 빠질 수 있고, 그러면 재연결 전까지 안 보인다.
 * 실서버 E2E 에서 10건 중 1건이 2초 안에 오지 않은 적이 있어서 추가했다.
 */
const SAFETY_SYNC_MS = 30_000;

/**
 * 대화방 하나의 상태 전부.
 *
 * 화면은 이 클래스의 $state 만 읽는다. 실시간 세부는 transport 에 갇혀 있다.
 *
 * 핵심 불변식:
 *  1. upsert() 가 유일한 진입점 — 낙관적 행 / insert 응답 / realtime 에코가 전부 여기로 온다.
 *     realtime 에코가 insert 응답보다 먼저 오는 일이 흔하므로 도착 순서에 무관해야 한다.
 *  2. 구독을 먼저 붙이고 그 다음에 조회한다. 반대로 하면 그 사이의 메시지가 영원히 사라진다.
 *  3. SUBSCRIBED 는 재연결마다 다시 온다 — 갭 메우기를 그 콜백 안에서 한다.
 */
export class ChatRoom {
	snap = $state<RoomSnap | null>(null);
	msgs = $state<Msg[]>([]);
	partnerTypingUntil = $state(0);
	partnerHere = $state(false);
	connected = $state(false);
	/** serverNow - clientNow (ms). 모든 서버 응답의 server_now 로 갱신. */
	skew = $state(0);
	/** 메시지 id → 자리별 공감 { 1?: 'heart', 2?: 'laugh' } */
	reactions = $state<Record<number, Partial<Record<1 | 2, ReactionKey>>>>({});

	#t: ChatTransport;
	#byCid = new Map<string, Msg>();
	#maxId = 0;
	#retry = 0;
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#tailTimer: ReturnType<typeof setTimeout> | null = null;
	#hiddenAt = 0;
	#lastTypingSent = 0;
	#disposed = false;
	#onVisibility = () => this.#visibility();
	#onOnline = () => this.#reconnectNow();

	#safetyTimer: ReturnType<typeof setInterval> | null = null;
	#safetyMs: number;

	constructor(
		readonly roomId: string,
		transport: ChatTransport = new SupabaseTransport(),
		opts: { safetySyncMs?: number } = {}
	) {
		this.#t = transport;
		this.#safetyMs = opts.safetySyncMs ?? SAFETY_SYNC_MS;
	}

	get seat() {
		return this.snap?.my_seat ?? 1;
	}
	get closed() {
		return this.snap?.status === 'closed';
	}

	serverNow(clientNow = Date.now()) {
		return clientNow + this.skew;
	}

	// ── 수명 ─────────────────────────────────────────────────────
	async open() {
		// 화면을 연 것 자체가 입장 확인. 양쪽이 모두 열어야 10분 타이머가 시작된다.
		this.#absorb(await this.#t.ack(this.roomId));
		if (this.closed) return;
		this.#connect();
		document.addEventListener('visibilitychange', this.#onVisibility);
		window.addEventListener('online', this.#onOnline);
		this.#safetyTimer = setInterval(() => {
			// 연결돼 있고 화면을 보고 있을 때만 — 백그라운드는 복귀 시 resync 가 처리한다
			if (this.connected && !this.closed && document.visibilityState === 'visible') void this.resync();
		}, this.#safetyMs);
	}

	dispose() {
		this.#disposed = true;
		this.#t.disconnect();
		if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
		if (this.#tailTimer) clearTimeout(this.#tailTimer);
		if (this.#safetyTimer) clearInterval(this.#safetyTimer);
		document.removeEventListener('visibilitychange', this.#onVisibility);
		window.removeEventListener('online', this.#onOnline);
	}

	#connect() {
		if (this.#disposed) return;
		this.#t.connect(this.roomId, this.seat, {
			onMessage: (row) => this.upsert(row, 'sent'),
			onRoom: (row) => this.#applyRoom(row),
			onVote: (v) => this.#applyVote(v),
			onReaction: (r) => {
				// 내가 방금 바꾸는 중인 공감의 옛 에코는 건너뛴다 (❤️→😂 를 빨리 누르면 ❤️ 에코가 늦게 온다)
				if (r.seat === this.seat && this.#pendingReact.has(r.message_id)) return;
				this.#applyReaction(r);
			},
			onTyping: (s) => {
				if (s !== this.seat) this.partnerTypingUntil = Date.now() + TYPING_SHOW_MS;
			},
			onPresence: (seats) => {
				this.partnerHere = seats.some((s) => s !== this.seat);
			},
			onSubscribed: () => {
				this.connected = true;
				this.#retry = 0;
				void this.resync();
			},
			onDown: () => {
				this.connected = false;
				this.#scheduleReconnect();
			}
		});
	}

	#scheduleReconnect() {
		if (this.#disposed || this.closed || this.#reconnectTimer) return;
		// 지수 백오프 + 지터 (0.5s → 30s)
		const delay = Math.min(30_000, 500 * 2 ** this.#retry++) + Math.random() * 300;
		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = null;
			this.#connect();
		}, delay);
	}

	#reconnectNow() {
		if (this.#disposed || this.closed) return;
		if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
		this.#reconnectTimer = null;
		this.#retry = 0;
		this.#connect();
	}

	/**
	 * iOS Safari 는 백그라운드에서 웹소켓을 조용히 죽이고 status 콜백도 주지 않는다.
	 * 오래 나가 있었으면 채널을 통째로 재생성, 잠깐이면 갭만 메운다.
	 */
	#visibility() {
		if (document.visibilityState !== 'visible') {
			this.#hiddenAt = Date.now();
			return;
		}
		if (this.#hiddenAt && Date.now() - this.#hiddenAt > BG_RECREATE_MS) this.#reconnectNow();
		else void this.resync();
	}

	// ── 동기화 ───────────────────────────────────────────────────
	/** 방 상태 + 메시지 갭을 한꺼번에 메운다. 재연결·포그라운드 복귀 때마다 호출. */
	async resync() {
		try {
			// 스냅샷 대신 close_if_expired — 오프라인 동안 만료됐다면 서버가 여기서 닫아준다
			this.#absorb(await this.#t.closeIfExpired(this.roomId));
		} catch {
			return; // 멤버가 아니게 됐거나 네트워크 오류 — 다음 기회에
		}
		if (this.closed) {
			this.#t.disconnect();
			return;
		}
		for (const r of await this.#t.fetchAfter(this.roomId, this.#maxId)) this.upsert(r, 'sent');
		// 끊겨 있던 동안 바뀐 공감도 — 방 전체를 다시 읽어 통째로 맞춘다 (방 하나에 많아야 메시지 수 × 2)
		try {
			this.#setReactions(await this.#t.fetchReactions(this.roomId));
		} catch {
			/* 다음 동기화 때 */
		}

		// ★ 커밋 순서 역전 보정
		// identity 는 id 를 먼저 받은 트랜잭션이 나중에 커밋될 수 있다.
		// id=101 이 먼저 보이고 id=100 이 0.2초 뒤 커밋되면 gt(maxId=101) 로는 100 을 영영 못 본다.
		// upsert 가 멱등이므로 잠시 뒤 최근 50개를 무조건 다시 읽어 병합한다.
		if (this.#tailTimer) clearTimeout(this.#tailTimer);
		this.#tailTimer = setTimeout(async () => {
			this.#tailTimer = null;
			if (this.#disposed || this.closed) return;
			for (const r of await this.#t.fetchRecent(this.roomId, 50)) this.upsert(r, 'sent');
		}, TAIL_SWEEP_DELAY_MS);
	}

	#absorb(s: RoomSnap) {
		this.skew = Date.parse(s.server_now) - Date.now();
		this.snap = s;
		if (s.status === 'closed') this.#t.disconnect();
	}

	#applyRoom(r: RoomRow) {
		if (!this.snap) return;
		const s = this.snap;
		const wasPending = s.status === 'pending';
		if (r.round !== s.round) {
			// 새 라운드 — 이전 표는 의미가 없다
			s.my_vote = null;
			s.partner_vote = null;
		}
		if (wasPending && r.status === 'active') s.partner_joined = true;
		s.status = r.status;
		s.round = r.round;
		s.expires_at = r.expires_at;
		s.close_reason = r.close_reason;
		s.their_read_id = s.my_seat === 1 ? r.read2 : r.read1;
		if (r.status === 'closed') this.#t.disconnect();
	}

	#applyVote(v: VoteRow) {
		const s = this.snap;
		if (!s || v.round !== s.round) return;
		if (v.seat === s.my_seat) s.my_vote = v.agree;
		else s.partner_vote = v.agree;
	}

	// ── 타임박스 ─────────────────────────────────────────────────
	voting = $state(false);

	async vote(agree: boolean): Promise<VoteResult | null> {
		if (!this.snap || this.voting) return null;
		this.voting = true;
		try {
			const { result, snap } = await this.#t.vote(this.roomId, agree);
			this.#absorb(snap);
			return result;
		} catch {
			return null;
		} finally {
			this.voting = false;
		}
	}

	#checking = false;
	#lastCheck = 0;
	/**
	 * 카운트다운이 0 이 됐을 때 화면이 부른다. 클라는 만료를 "판정"하지 않고 서버에 "질문"한다.
	 * 서버가 아직 아니라고 하면 skew 가 재동기화되어 카운트다운이 되살아난다.
	 */
	async checkExpiry() {
		if (this.#checking || this.closed || Date.now() - this.#lastCheck < 3000) return;
		this.#checking = true;
		this.#lastCheck = Date.now();
		try {
			this.#absorb(await this.#t.closeIfExpired(this.roomId));
		} catch {
			/* 다음 틱에 다시 */
		} finally {
			this.#checking = false;
		}
	}

	/** 내가 끝냈는지 — 종료 문구를 다르게 보여주기 위해 (상대에게는 사유를 숨긴다) */
	endedByMe = $state(false);
	reported = $state(false);

	async report(reason: ReportReason, note: string): Promise<boolean> {
		try {
			const { snap } = await this.#t.report(this.roomId, reason, note);
			this.endedByMe = true;
			this.reported = true;
			this.#absorb(snap);
			return true;
		} catch {
			return false;
		}
	}

	async block(): Promise<boolean> {
		try {
			this.endedByMe = true;
			this.#absorb(await this.#t.block(this.roomId));
			return true;
		} catch {
			return false;
		}
	}

	async leave(skip: boolean) {
		this.endedByMe = true;
		try {
			this.#absorb(await this.#t.leave(this.roomId, skip));
		} catch {
			/* 이미 닫혔을 수 있다 */
		}
	}

	// ── 메시지 ───────────────────────────────────────────────────
	/** 유일한 진입점. 멱등 — 같은 행이 몇 번 와도 결과가 같다. */
	upsert(row: Partial<MsgRow> & { client_msg_id: string }, state: Msg['state']) {
		const prev = this.#byCid.get(row.client_msg_id);
		if (prev) {
			// 확정된 id 를 null 로 되돌리지 않는다
			if (row.id != null) prev.id = row.id;
			if (row.created_at) prev.created_at = row.created_at;
			prev.state = prev.id != null ? 'sent' : state;
		} else {
			const m: Msg = {
				id: row.id ?? null,
				room_id: row.room_id ?? this.roomId,
				sender_seat: (row.sender_seat ?? this.seat) as Msg['sender_seat'],
				body: row.body ?? '',
				client_msg_id: row.client_msg_id,
				created_at: row.created_at ?? new Date(this.serverNow()).toISOString(),
				state: row.id != null ? 'sent' : state
			};
			this.msgs.push(m);
			// $state 배열에 넣은 뒤의 프록시를 맵에 보관해야 이후 변경이 화면에 반영된다
			this.#byCid.set(m.client_msg_id, this.msgs[this.msgs.length - 1]);
		}
		if (row.id != null && row.id > this.#maxId) this.#maxId = row.id;
		// 확정 id 순. 미확정(null)은 항상 맨 아래.
		this.msgs.sort((a, b) => (a.id ?? Infinity) - (b.id ?? Infinity));
	}

	async send(raw: string) {
		const body = raw.trim();
		if (!body || !this.snap || this.closed) return;
		const cid = crypto.randomUUID();
		this.upsert({ client_msg_id: cid, sender_seat: this.seat, body }, 'sending');
		await this.#flush(cid, body);
	}

	/** 재전송 — 같은 client_msg_id 로 보내므로 unique index 가 중복을 막는다 */
	async retry(m: Msg) {
		if (m.state === 'sending' || this.closed) return;
		m.state = 'sending';
		await this.#flush(m.client_msg_id, m.body);
	}

	async #flush(cid: string, body: string) {
		const res = await this.#t.send(this.roomId, this.seat, body, cid);
		const m = this.#byCid.get(cid);
		if (res.ok) {
			this.upsert(res.row, 'sent');
			return;
		}
		if (res.reason === 'duplicate') {
			// 타임아웃 후 재시도였는데 서버엔 이미 들어가 있다 → 그 행을 읽어 확정
			for (const r of await this.#t.fetchRecent(this.roomId, 50)) this.upsert(r, 'sent');
			if (m && m.id == null) m.state = 'failed';
			return;
		}
		if (m) m.state = res.reason === 'rate_limited' ? 'rate_limited' : 'failed';
		if (res.reason === 'closed') void this.resync(); // 만료/종료 — 스냅샷으로 확인
	}

	// ── 공감 ─────────────────────────────────────────────────────
	/** 보내는 중인 내 공감 (메시지 id → 바라는 값). 그 사이 온 옛 목록이 화면을 되돌리지 않게. */
	#pendingReact = new Map<number, ReactionKey | null>();

	#applyReaction(r: Pick<ReactionRow, 'message_id' | 'seat' | 'emoji'>) {
		const cur = { ...this.reactions[r.message_id] };
		if (r.emoji) cur[r.seat] = r.emoji;
		else delete cur[r.seat];
		this.reactions[r.message_id] = cur;
	}

	#setReactions(rows: ReactionRow[]) {
		const next: typeof this.reactions = {};
		for (const r of rows) if (r.emoji) (next[r.message_id] ??= {})[r.seat] = r.emoji;
		this.reactions = next;
		for (const [id, emoji] of this.#pendingReact) this.#applyReaction({ message_id: id, seat: this.seat, emoji });
	}

	/** 내 공감을 바꾼다 (null = 취소). 화면에는 바로 반영하고, 서버가 거절하면 되돌린다. */
	async react(messageId: number, emoji: ReactionKey | null): Promise<ReactResult> {
		if (this.closed) return 'closed';
		const seat = this.seat;
		const before = this.reactions[messageId]?.[seat] ?? null;
		if (before === emoji) return 'ok';
		this.#pendingReact.set(messageId, emoji);
		this.#applyReaction({ message_id: messageId, seat, emoji });
		const res = await this.#t.react(this.roomId, messageId, emoji).catch((): ReactResult => 'network');
		if (this.#pendingReact.get(messageId) === emoji) this.#pendingReact.delete(messageId);
		if (res !== 'ok' && (this.reactions[messageId]?.[seat] ?? null) === emoji) {
			this.#applyReaction({ message_id: messageId, seat, emoji: before });
			if (res === 'closed') void this.resync(); // 시간이 끝났다 — 스냅샷으로 확인
		}
		return res;
	}

	/** 같은 공감을 다시 누르면 취소, 다른 걸 누르면 바꾸기 */
	toggleReaction(messageId: number, emoji: ReactionKey) {
		return this.react(messageId, this.reactions[messageId]?.[this.seat] === emoji ? null : emoji);
	}

	// ── 부가 ─────────────────────────────────────────────────────
	/** 상대 기본 정보 — 프로필 시트를 열 때 한 번 불러온다 */
	async partnerProfile(): Promise<PartnerProfile | null> {
		try {
			return await this.#t.partnerProfile(this.roomId);
		} catch {
			return null;
		}
	}

	onInput() {
		const now = Date.now();
		if (now - this.#lastTypingSent < TYPING_SEND_EVERY_MS) return;
		this.#lastTypingSent = now;
		this.#t.typing(this.seat);
	}

	#readSent = 0;
	#readTimer: ReturnType<typeof setTimeout> | null = null;
	/** 스크롤이 맨 아래일 때만 호출. 2초 스로틀 — rooms UPDATE 브로드캐스트 폭증 방지. */
	markRead() {
		if (this.#readTimer || this.closed) return;
		this.#readTimer = setTimeout(() => {
			this.#readTimer = null;
			const last = this.#maxId;
			if (last > this.#readSent) {
				this.#readSent = last;
				void this.#t.markRead(this.roomId, last);
			}
		}, 2000);
	}
}
