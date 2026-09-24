import { createServer } from 'vite';

/**
 * ChatRoom 클라이언트 로직 테스트 — 가짜 전송 계층으로 네트워크 경쟁 상황을 재현한다.
 * Supabase 불필요.
 *
 *   npm run test:chat
 *
 * vite 의 ssrLoadModule 로 room.svelte.ts 를 컴파일해서 불러온다(runes 포함).
 */
const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom',
	logLevel: 'error'
});

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// open() 이 거는 이벤트 리스너용 최소 DOM 스텁
globalThis.document ??= { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };

try {
	const { ChatRoom } = await vite.ssrLoadModule('/src/lib/chat/room.svelte.ts');

	const ROOM = '00000000-0000-0000-0000-00000000000r';
	const now = () => new Date().toISOString();
	let nextId = 100;
	const row = (seat, body, cid = crypto.randomUUID(), id = ++nextId) => ({
		id,
		room_id: ROOM,
		sender_seat: seat,
		body,
		client_msg_id: cid,
		created_at: now()
	});
	const snap = (over = {}) => ({
		room_id: ROOM,
		status: 'active',
		my_seat: 1,
		my_alias: '말랑복숭아',
		partner_alias: '새벽수달',
		expires_at: new Date(Date.now() + 600_000).toISOString(),
		round: 1,
		max_rounds: 0,
		extend_minutes: 10,
		vote_window_sec: 90,
		my_vote: null,
		partner_vote: null,
		partner_joined: true,
		their_read_id: null,
		close_reason: null,
		server_now: now(),
		...over
	});

	/** 테스트마다 동작을 바꿔 끼우는 가짜 전송 계층 */
	function fake() {
		const t = {
			server: [], // 서버에 커밋된 행
			snap: snap(),
			handlers: null,
			sendImpl: null,
			calls: { snapshot: 0, fetchAfter: 0, fetchRecent: 0 },
			connect(_r, _s, h) {
				t.handlers = h;
			},
			disconnect() {},
			async send(roomId, seat, body, cid, replyTo = null) {
				return t.sendImpl(roomId, seat, body, cid, replyTo);
			},
			async fetchAfter(_r, after) {
				t.calls.fetchAfter++;
				return t.server.filter((m) => m.id > after).sort((a, b) => a.id - b.id);
			},
			async fetchRecent(_r, n) {
				t.calls.fetchRecent++;
				return [...t.server].sort((a, b) => b.id - a.id).slice(0, n);
			},
			async snapshot() {
				t.calls.snapshot++;
				return { ...t.snap, server_now: now() };
			},
			async closeIfExpired() {
				t.calls.snapshot++;
				return { ...t.snap, server_now: now() };
			},
			async ack() {
				t.acked = true;
				return { ...t.snap, server_now: now() };
			},
			voteImpl: null,
			async vote(_r, agree) {
				return t.voteImpl(agree);
			},
			async leave(_r, skip) {
				t.snap = { ...t.snap, status: 'closed', close_reason: skip ? 'skipped' : 'left' };
				return { ...t.snap, server_now: now() };
			},
			async markRead() {},
			typing() {},
			// 공감 — 서버에 있는 행 / 요청 처리 방식은 테스트마다 바꿔 끼운다
			reactionRows: [],
			reactImpl: null,
			async react(_r, id, emoji) {
				return t.reactImpl ? t.reactImpl(id, emoji) : 'ok';
			},
			async fetchReactions() {
				return t.reactionRows.filter((x) => x.emoji);
			}
		};
		return t;
	}

	async function mk(t) {
		const r = new ChatRoom(ROOM, t);
		r.snap = t.snap; // open() 은 DOM 이벤트를 걸기 때문에 여기선 스냅샷만 주입
		return r;
	}
	const bodies = (r) => r.msgs.map((m) => m.body).join(',');

	console.log('\n[1] 낙관적 전송');
	{
		const t = fake();
		let release;
		t.sendImpl = (_r, seat, body, cid) =>
			new Promise((res) => {
				release = () => {
					const x = row(seat, body, cid);
					t.server.push(x);
					res({ ok: true, row: x });
				};
			});
		const r = await mk(t);
		const p = r.send('안녕');
		check('보내는 즉시 화면에 나타난다 (sending)', r.msgs.length === 1 && r.msgs[0].state === 'sending');
		check('확정 전에는 id 가 없다', r.msgs[0].id === null);
		release();
		await p;
		check('응답 후 sent 로 바뀌고 서버 id 를 받는다', r.msgs[0].state === 'sent' && r.msgs[0].id != null);
		check('여전히 1개', r.msgs.length === 1);
	}

	console.log('\n[2] ★ realtime 에코가 insert 응답보다 먼저 도착');
	{
		const t = fake();
		const r = await mk(t);
		t.sendImpl = async (_r, seat, body, cid) => {
			const x = row(seat, body, cid);
			t.server.push(x);
			r.upsert(x, 'sent'); // 에코가 먼저 온다
			await sleep(5);
			return { ok: true, row: x };
		};
		await r.send('에코 먼저');
		check('중복 없이 1개', r.msgs.length === 1, `실제 ${r.msgs.length}`);
		check('sent 상태', r.msgs[0].state === 'sent');
	}

	console.log('\n[3] 같은 행이 여러 번 와도 결과가 같다 (멱등)');
	{
		const t = fake();
		const r = await mk(t);
		const x = row(2, '반가워');
		for (let i = 0; i < 3; i++) r.upsert(x, 'sent');
		check('3번 받아도 1개', r.msgs.length === 1);
	}

	console.log('\n[4] 순서 — 늦게 커밋된 낮은 id 도 제자리로');
	{
		const t = fake();
		const r = await mk(t);
		r.upsert(row(2, 'a', undefined, 1), 'sent');
		r.upsert(row(2, 'c', undefined, 3), 'sent');
		r.upsert(row(2, 'b', undefined, 2), 'sent');
		check('id 순서대로 정렬 (a,b,c)', bodies(r) === 'a,b,c', bodies(r));
	}

	console.log('\n[5] 미확정 메시지는 항상 맨 아래');
	{
		const t = fake();
		const r = await mk(t);
		t.sendImpl = () => new Promise(() => {}); // 영원히 응답 없음
		void r.send('내 것(대기중)');
		r.upsert(row(2, '상대 새 메시지', undefined, 50), 'sent');
		check('상대 메시지가 와도 내 대기 메시지는 아래', bodies(r) === '상대 새 메시지,내 것(대기중)', bodies(r));
	}

	console.log('\n[6] 실패와 재전송');
	{
		const t = fake();
		const r = await mk(t);
		t.sendImpl = async () => ({ ok: false, reason: 'network' });
		await r.send('끊겼을 때');
		check('네트워크 실패 → failed', r.msgs[0].state === 'failed');

		const cidFirst = r.msgs[0].client_msg_id;
		let usedCid = null;
		t.sendImpl = async (_r, seat, body, cid) => {
			usedCid = cid;
			const x = row(seat, body, cid);
			t.server.push(x);
			return { ok: true, row: x };
		};
		await r.retry(r.msgs[0]);
		check('재전송은 같은 client_msg_id 를 쓴다 (서버 unique 가 중복 방지)', usedCid === cidFirst);
		check('재전송 성공 → sent, 1개', r.msgs.length === 1 && r.msgs[0].state === 'sent');
	}

	console.log('\n[7] ★ 타임아웃 후 재전송했는데 사실 서버엔 이미 들어가 있었다');
	{
		const t = fake();
		const r = await mk(t);
		let cid;
		t.sendImpl = async (_r, seat, body, c) => {
			cid = c;
			t.server.push(row(seat, body, c)); // 서버엔 들어갔는데
			return { ok: false, reason: 'network' }; // 응답을 못 받음
		};
		await r.send('유령');
		check('일단 failed 로 보인다', r.msgs[0].state === 'failed');
		t.sendImpl = async () => ({ ok: false, reason: 'duplicate' });
		await r.retry(r.msgs[0]);
		check('duplicate 응답 → 서버 행을 읽어 sent 로 확정', r.msgs[0].state === 'sent' && r.msgs[0].id != null);
		check('여전히 1개', r.msgs.length === 1);
	}

	console.log('\n[8] 방이 만료된 뒤 전송');
	{
		const t = fake();
		const r = await mk(t);
		t.sendImpl = async () => ({ ok: false, reason: 'closed' });
		t.snap = snap({ status: 'closed', close_reason: 'expired' });
		await r.send('늦음');
		await sleep(10);
		check('실패 표시', r.msgs[0].state === 'failed');
		check('스냅샷을 다시 받아 종료 상태로 전환', r.closed === true && r.snap.close_reason === 'expired');
		const before = r.msgs.length;
		await r.send('닫힌 방에 또');
		check('닫힌 방에서는 전송 시도 자체를 하지 않는다', r.msgs.length === before);
	}

	console.log('\n[9] ★ 재연결 갭 메우기 + 커밋 순서 역전 보정');
	{
		const t = fake();
		const r = await mk(t);
		// 연결돼 있던 동안 받은 것
		const m1 = row(2, 'm1', undefined, 1);
		t.server.push(m1);
		r.upsert(m1, 'sent');
		// 끊겨 있는 동안 서버에 쌓인 것 (realtime 으로는 안 옴)
		t.server.push(row(2, 'm2', undefined, 2), row(2, 'm4', undefined, 4));
		await r.resync();
		check('재연결 직후 놓친 메시지가 채워진다', bodies(r) === 'm1,m2,m4', bodies(r));
		// id=3 을 먼저 받은 트랜잭션이 이제서야 커밋됨 → gt(maxId=4) 로는 영영 못 본다
		t.server.push(row(2, 'm3', undefined, 3));
		await sleep(1700);
		check('잠시 뒤 tail sweep 이 늦게 커밋된 id=3 을 제자리에 넣는다', bodies(r) === 'm1,m2,m3,m4', bodies(r));
		check('놓친 것 없이 정확히 한 번씩', r.msgs.length === 4);
	}

	console.log('\n[10] 서버 시계 보정');
	{
		const t = fake();
		t.snap = snap({ server_now: new Date(Date.now() + 5 * 60_000).toISOString() });
		t.snapshot = async () => ({ ...t.snap });
		t.closeIfExpired = async () => ({ ...t.snap });
		const r = await mk(t);
		await r.resync();
		const skewMin = Math.round(r.skew / 60_000);
		check('기기 시계가 5분 느려도 skew 로 보정된다', skewMin === 5, `skew=${skewMin}분`);
		check('serverNow() 가 서버 기준 시각을 준다', Math.abs(r.serverNow() - (Date.now() + 5 * 60_000)) < 2000);
	}
	console.log('\n[11] 입장 확인 — 화면을 여는 것이 곧 ack');
	{
		const t = fake();
		t.snap = snap({ status: 'pending', partner_joined: false });
		const r = new ChatRoom(ROOM, t);
		await r.open();
		check('open() 이 ack_room 을 부른다', t.acked === true);
		check('pending 상태로 시작', r.snap.status === 'pending');
		t.handlers.onRoom({ id: ROOM, status: 'active', round: 1, expires_at: new Date(Date.now() + 600_000).toISOString(), close_reason: null, alias1: 'a', alias2: 'b', read1: null, read2: null });
		check('상대가 들어와 active 가 되면 Realtime 으로 즉시 반영', r.snap.status === 'active' && r.snap.partner_joined === true);
		r.dispose();
	}

	console.log('\n[12] 연장 투표');
	{
		const t = fake();
		const r = new ChatRoom(ROOM, t);
		await r.open();
		t.handlers.onVote({ room_id: ROOM, round: 1, seat: 2, agree: true });
		check('상대의 동의가 Realtime 으로 오면 partner_vote=true', r.snap.partner_vote === true);
		t.handlers.onVote({ room_id: ROOM, round: 1, seat: 1, agree: true });
		check('내 표도 반영', r.snap.my_vote === true);
		t.handlers.onVote({ room_id: ROOM, round: 0, seat: 2, agree: false });
		check('이전 라운드의 늦은 표는 무시', r.snap.partner_vote === true);

		const later = new Date(Date.parse(r.snap.expires_at) + 600_000).toISOString();
		t.handlers.onRoom({ id: ROOM, status: 'active', round: 2, expires_at: later, close_reason: null, alias1: 'a', alias2: 'b', read1: null, read2: null });
		check('★ 연장되어 round 가 바뀌면 표가 초기화된다', r.snap.round === 2 && r.snap.my_vote === null && r.snap.partner_vote === null);
		check('마감 시각이 늘어난다', r.snap.expires_at === later);

		t.voteImpl = async (agree) => ({ result: 'waiting', snap: { ...t.snap, round: 2, my_vote: agree, server_now: now() } });
		const res = await r.vote(true);
		check('vote() 는 결과를 돌려주고 스냅샷을 흡수한다', res === 'waiting' && r.snap.my_vote === true);

		let calls = 0;
		t.voteImpl = async () => {
			calls++;
			await sleep(30);
			return { result: 'waiting', snap: { ...t.snap, server_now: now() } };
		};
		await Promise.all([r.vote(true), r.vote(true), r.vote(true)]);
		check('연타해도 요청은 한 번만 나간다', calls === 1, `${calls}회`);

		t.voteImpl = async () => ({ result: 'declined', snap: { ...t.snap, status: 'closed', close_reason: 'declined', server_now: now() } });
		await r.vote(false);
		check('그만하기 → 즉시 종료 상태', r.closed && r.snap.close_reason === 'declined');
		r.dispose();
	}

	console.log('\n[13] ★ 만료 판정은 서버에게 묻는다');
	{
		const t = fake();
		const r = new ChatRoom(ROOM, t);
		await r.open();
		const before = t.calls.snapshot;
		t.snap = snap({ status: 'closed', close_reason: 'expired' });
		await r.checkExpiry();
		check('카운트다운 0 → close_if_expired 로 서버 판정을 받아 종료', r.closed && r.snap.close_reason === 'expired');
		await r.checkExpiry();
		await r.checkExpiry();
		check('닫힌 뒤에는 더 묻지 않는다', t.calls.snapshot === before + 1);
		r.dispose();
	}
	{
		const t = fake();
		const r = new ChatRoom(ROOM, t);
		await r.open();
		// 기기 시계가 2분 빨라서 먼저 0 이 됐지만 서버는 아직 1분 남았다고 한다
		const serverNow = Date.now() - 120_000;
		t.snap = snap({ expires_at: new Date(serverNow + 60_000).toISOString() });
		t.closeIfExpired = async () => ({ ...t.snap, server_now: new Date(serverNow).toISOString() });
		await r.checkExpiry();
		const remain = Date.parse(r.snap.expires_at) - r.serverNow();
		check('★ 서버가 아직이라고 하면 skew 가 보정되어 카운트다운이 되살아난다', r.snap.status === 'active' && Math.abs(remain - 60_000) < 2000, `남은 ${Math.round(remain / 1000)}초`);
		const n = t.calls.snapshot;
		await r.checkExpiry();
		check('3초 안에 다시 묻지 않는다 (throttle)', t.calls.snapshot === n);
		r.dispose();
	}

	console.log('\n[15] ★ Realtime 이 연결된 채로 메시지를 조용히 떨어뜨릴 때');
	{
		const t = fake();
		const r = new ChatRoom(ROOM, t, { safetySyncMs: 200 });
		await r.open();
		t.handlers.onSubscribed();
		await sleep(50);
		t.server.push(row(2, '떨어진 메시지', undefined, 500)); // 서버엔 있는데 Realtime 으로는 안 옴
		check('처음엔 화면에 없다', !r.msgs.some((m) => m.body === '떨어진 메시지'));
		await sleep(350);
		check('★ 안전망 동기화가 재연결 없이도 채운다', r.msgs.some((m) => m.body === '떨어진 메시지'));
		r.dispose();
		const n = t.calls.snapshot;
		await sleep(450);
		check('dispose 후에는 더 동기화하지 않는다', t.calls.snapshot === n);
	}

	console.log('\n[14] 나가기');
	{
		const t = fake();
		const r = new ChatRoom(ROOM, t);
		await r.open();
		await r.leave(false);
		check('나가기 → left 로 종료', r.closed && r.snap.close_reason === 'left');
		r.dispose();
	}

	console.log('\n[15] 공감 — 바로 보이고, 거절되면 되돌리고, 늦은 에코에 흔들리지 않는다');
	{
		const t = fake();
		const r = await mk(t);
		r.upsert(row(2, '공감할 메시지', 'c1', 900), 'sent');
		const mine = () => r.reactions[900]?.[1];

		let release;
		t.reactImpl = () => new Promise((res) => (release = res));
		const p1 = r.toggleReaction(900, 'heart');
		check('누르자마자 화면에 ❤️ (서버 응답 전)', mine() === 'heart');
		release('ok');
		check('서버가 받으면 그대로', (await p1) === 'ok' && mine() === 'heart');

		t.reactImpl = async () => 'ok';
		await r.toggleReaction(900, 'heart');
		check('같은 걸 또 누르면 취소', mine() === undefined);

		t.reactImpl = async () => 'closed';
		const res = await r.toggleReaction(900, 'fire');
		check('★ 시간이 끝나 거절되면 되돌린다', res === 'closed' && mine() === undefined);

		t.handlers = null;
		const room = new ChatRoom(ROOM, t);
		await room.open();
		room.upsert(row(1, '내 메시지', 'c2', 901), 'sent');
		t.handlers.onReaction({ message_id: 901, room_id: ROOM, seat: 2, emoji: 'laugh' });
		check('상대 공감이 실시간으로 온다', room.reactions[901]?.[2] === 'laugh');
		t.handlers.onReaction({ message_id: 901, room_id: ROOM, seat: 2, emoji: null });
		check('상대가 취소하면 사라진다', room.reactions[901]?.[2] === undefined);

		// ❤️ → 😂 를 빨리 누르는 사이 ❤️ 에코가 늦게 도착
		let rel2;
		t.reactImpl = () => new Promise((res) => (rel2 = res));
		const p2 = room.react(901, 'laugh');
		t.handlers.onReaction({ message_id: 901, room_id: ROOM, seat: 1, emoji: 'heart' });
		check('★ 보내는 중엔 내 자리의 옛 에코를 무시', room.reactions[901]?.[1] === 'laugh');
		rel2('ok');
		await p2;

		// 재연결 동기화: 서버 목록으로 통째로 맞추되, 보내는 중인 내 공감은 지킨다
		t.reactionRows = [
			{ message_id: 901, room_id: ROOM, seat: 1, emoji: 'laugh' },
			{ message_id: 900, room_id: ROOM, seat: 2, emoji: 'wow' }
		];
		let rel3;
		t.reactImpl = () => new Promise((res) => (rel3 = res));
		const p3 = room.react(900, 'sad');
		await room.resync();
		check('동기화로 놓친 상대 공감이 채워진다', room.reactions[900]?.[2] === 'wow');
		check('★ 동기화가 보내는 중인 내 공감을 되돌리지 않는다', room.reactions[900]?.[1] === 'sad');
		rel3('ok');
		await p3;
		t.fetchReactions = async () => {
			throw new Error('network');
		};
		await room.resync();
		check('목록을 못 받으면 화면의 공감을 지우지 않는다', room.reactions[901]?.[1] === 'laugh');
		room.dispose();
	}

	console.log('\n[16] 답장 — 대상 id 가 전송까지 가고, 실패 후 다시 보내도 유지된다');
	{
		const t = fake();
		const r = await mk(t);
		r.upsert(row(2, '원래 메시지', 'o1', 950), 'sent');
		const sent = [];
		t.sendImpl = async (_r, seat, body, cid, replyTo) => {
			sent.push(replyTo);
			if (sent.length === 1) return { ok: false, reason: 'network' };
			const x = { ...row(seat, body, cid), reply_to: replyTo };
			t.server.push(x);
			return { ok: true, row: x };
		};
		await r.send('답장이에요', 950);
		const m = r.msgs.find((x) => x.body === '답장이에요');
		check('보내기 전부터 화면의 메시지에 답장 대상', m.reply_to === 950);
		check('첫 전송에 대상 id 가 실린다', sent[0] === 950 && m.state === 'failed');
		await r.retry(m);
		check('★ 다시 보내도 같은 대상으로', sent[1] === 950 && m.state === 'sent' && m.reply_to === 950);
		await r.send('그냥 메시지');
		check('답장이 아니면 null', sent[2] === null && r.msgs.at(-1).reply_to === null);
	}
	console.log('\n[17] 검열 1단에 막힌 메시지 — 화면에서 지우고 이유를 돌려준다');
	{
		const t = fake();
		const r = await mk(t);
		t.sendImpl = async () => ({ ok: false, reason: 'blocked', code: 'personal_info' });
		const before = r.msgs.length;
		const res = await r.send('내 번호 01012345678');
		check('이유 코드를 돌려준다', res?.blocked === 'personal_info');
		check('★ 화면에 "실패"로 남지 않는다 (다시 보내도 똑같이 막히므로)', r.msgs.length === before && !r.msgs.some((m) => m.body.includes('0101')));
		t.sendImpl = async (_r, seat, body, cid) => {
			const x = { ...row(seat, body, cid), reply_to: null };
			t.server.push(x);
			return { ok: true, row: x };
		};
		check('막힌 뒤에도 다음 메시지는 보내진다', (await r.send('안녕하세요')) === null && r.msgs.at(-1).body === '안녕하세요');
	}
} catch (e) {
	fail++;
	console.error(e);
} finally {
	await vite.close();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
