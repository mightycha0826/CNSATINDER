<script lang="ts">
	/**
	 * 개발 전용 — 대화방 화면 미리보기. Supabase 없이 가짜 전송 계층으로 상태를 재현한다.
	 * 연장 배너처럼 실계정으로는 8분 넘게 기다려야 보이는 화면을 바로 확인하기 위한 것.
	 *
	 *   /dev/chat?s=chat | vote | waiting | pending | ended   (&sheet=menu|report|block|profile 로 시트 열기)
	 *
	 * 배포 빌드에서는 아무것도 그리지 않고 홈으로 보낸다.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ChatRoom } from '$lib/chat/room.svelte';
	import ChatView from '$lib/chat/ChatView.svelte';
	import { toast } from '$lib/state.svelte';
	import type { ChatTransport, TransportHandlers } from '$lib/chat/transport';
	import type { MsgRow, RoomSnap } from '$lib/chat/types';

	const ROOM = 'preview-room';
	const scenario = page.url.searchParams.get('s') ?? 'chat';

	const sec = (n: number) => new Date(Date.now() + n * 1000).toISOString();
	const base: RoomSnap = {
		room_id: ROOM,
		status: 'active',
		my_seat: 1,
		my_alias: '말랑복숭아',
		partner_alias: '새벽수달',
		expires_at: sec(372),
		round: 1,
		max_rounds: 0,
		extend_minutes: 10,
		vote_window_sec: 90,
		my_vote: null,
		partner_vote: null,
		partner_joined: true,
		partner_online: true,
		their_read_id: 7,
		close_reason: null,
		server_now: new Date().toISOString()
	};
	const SNAPS: Record<string, Partial<RoomSnap>> = {
		chat: {},
		vote: { expires_at: sec(72), partner_vote: true },
		waiting: { expires_at: sec(48), my_vote: true },
		pending: { status: 'pending', expires_at: sec(47), partner_joined: false, their_read_id: null },
		ended: { status: 'closed', close_reason: 'expired', expires_at: sec(-1) }
	};

	let id = 0;
	const m = (seat: 0 | 1 | 2, body: string): MsgRow => ({
		id: ++id,
		room_id: ROOM,
		sender_seat: seat,
		body,
		client_msg_id: crypto.randomUUID(),
		created_at: new Date().toISOString()
	});
	const MSGS: MsgRow[] =
		scenario === 'pending'
			? []
			: [
					m(0, '10분 동안 이야기할 수 있어요. 이름·학번·SNS는 묻지도 말하지도 않기로 해요.'),
					m(2, '안녕하세요!'),
					m(2, '혹시 요즘 뭐 듣는 노래 있어요?'),
					m(1, '저 요즘 밴드 음악만 들어요'),
					m(1, '실리카겔 좋아하세요?'),
					m(2, '헐 저도 좋아해요 ㅋㅋㅋ 무드 좋던데'),
					m(1, '와 진짜요? 반갑네요'),
					m(2, '공연도 가봤어요?'),
					m(1, '아직이요… 이번에 가보고 싶어요')
				];

	/** 인메모리 가짜 전송 — 보내면 바로 성공, 상대는 이따금 타이핑 */
	class PreviewTransport implements ChatTransport {
		snap: RoomSnap = { ...base, ...SNAPS[scenario] };
		rows = [...MSGS];
		h: TransportHandlers | null = null;
		connect(_r: string, _s: 1 | 2, h: TransportHandlers) {
			this.h = h;
			setTimeout(() => {
				h.onSubscribed();
				h.onPresence(scenario === 'pending' ? [1] : [1, 2]);
				if (scenario === 'chat') h.onTyping(2);
			}, 50);
		}
		disconnect() {}
		async send(_r: string, seat: 1 | 2, body: string, cid: string) {
			const row: MsgRow = { ...m(seat, body), client_msg_id: cid };
			this.rows.push(row);
			// &read : 보낸 메시지를 상대가 1초 뒤 읽음 ("읽음" 표시가 화면 안으로 따라오는지 확인용)
			if (page.url.searchParams.has('read')) {
				setTimeout(() => {
					this.snap = { ...this.snap, their_read_id: row.id };
					this.h?.onRoom({
						id: ROOM, status: this.snap.status, round: this.snap.round, expires_at: this.snap.expires_at,
						close_reason: null, alias1: this.snap.my_alias, alias2: this.snap.partner_alias, read1: null, read2: row.id
					});
				}, 1000);
			}
			return { ok: true as const, row };
		}
		async fetchAfter(_r: string, after: number) {
			return this.rows.filter((x) => x.id > after);
		}
		async fetchRecent() {
			return this.rows.slice(-50);
		}
		#s() {
			return { ...this.snap, server_now: new Date().toISOString() };
		}
		async snapshot() {
			return this.#s();
		}
		async ack() {
			return this.#s();
		}
		async closeIfExpired() {
			return this.#s();
		}
		async vote(_r: string, agree: boolean) {
			this.snap = agree
				? { ...this.snap, my_vote: true }
				: { ...this.snap, status: 'closed', close_reason: 'declined' };
			return { result: agree ? ('waiting' as const) : ('declined' as const), snap: this.#s() };
		}
		async leave(_r: string, skip: boolean) {
			this.snap = { ...this.snap, status: 'closed', close_reason: skip ? 'skipped' : 'left' };
			return this.#s();
		}
		async report() {
			this.snap = { ...this.snap, status: 'closed', close_reason: 'reported' };
			return { status: 'ok' as const, snap: this.#s() };
		}
		async block() {
			this.snap = { ...this.snap, status: 'closed', close_reason: 'blocked' };
			return this.#s();
		}
		async markRead() {}
		async partnerProfile() {
			return {
				nickname: this.snap.partner_alias,
				bio: '밴드 음악 좋아해요. 공연 같이 얘기해요',
				interests: ['밴드', '기타', '영화'],
				mbti: 'INFP',
				online: true
			};
		}
		typing() {}
	}

	let room = $state<ChatRoom | null>(null);
	let loading = $state(true);

	$effect(() => {
		if (!import.meta.env.DEV) {
			void goto('/', { replaceState: true });
			return;
		}
		const r = new ChatRoom(ROOM, new PreviewTransport());
		room = r;
		void r.open().then(() => (loading = false));
		// &toast : 알림이 2.4초 뒤 사라지는지 확인용
		if (page.url.searchParams.has('toast')) toast('테스트 알림'); // toast() 는 내부에서 untrack
		return () => r.dispose();
	});
</script>

{#if import.meta.env.DEV}
	<ChatView {room} {loading} initialSheet={page.url.searchParams.get('sheet') as never} />
{/if}
