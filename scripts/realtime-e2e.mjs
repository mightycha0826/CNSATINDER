import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/**
 * 실서버 Realtime E2E — 실제 Supabase 프로젝트에서 두 계정이 대화하는 것을 자동 검증한다.
 *
 *   npm run test:e2e
 *
 * 필요: .env 의 PUBLIC_SUPABASE_URL / PUBLIC 키 / SUPABASE_SERVICE_ROLE_KEY 가 **같은 프로젝트**.
 * 동작: 일회용 테스트 계정 3개 생성(메일 발송 없음) → 방 생성 → 실제 Realtime 으로 검증 → 전부 삭제.
 *
 * 이 스크립트가 재는 전달 지연은 학술탐구의 B=0(write-through) 기준선이기도 하다.
 */
const env = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const URL_ = env.PUBLIC_SUPABASE_URL;
const PUB = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;

const ref = (u) => (u ?? '').match(/\/\/([^.]+)/)?.[1];
const keyRef = (() => {
	try {
		return JSON.parse(Buffer.from(SVC.split('.')[1], 'base64url').toString()).ref;
	} catch {
		return null; // 신형 sb_secret_ 키는 ref 를 담지 않는다
	}
})();
if (!SVC) {
	console.error('SUPABASE_SERVICE_ROLE_KEY 가 없습니다.');
	process.exit(2);
}
if (ref(env.SUPABASE_URL) !== ref(URL_) || (keyRef && keyRef !== ref(URL_))) {
	console.error(
		`서버 키가 다른 프로젝트를 가리킵니다. 앱=${ref(URL_)} / SUPABASE_URL=${ref(env.SUPABASE_URL)} / 키=${keyRef}`
	);
	process.exit(2);
}

const admin = createClient(URL_, SVC, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
const PW = 'e2e-' + crypto.randomUUID();
const emails = ['a', 'b', 'c'].map((x) => `simbun-e2e-${x}-${tag}@cnsa.hs.kr`);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const created = [];

async function user(email) {
	// 확인된 계정을 먼저 만들고 비밀번호는 그다음에 — 한 번에 넣으면 계정 선점 방지 트리거가 비밀번호를 지운다
	const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
	if (!error) await admin.auth.admin.updateUserById(data.user.id, { password: PW });
	if (error) throw new Error(`createUser ${email}: ${error.message}`);
	created.push(data.user.id);
	const c = createClient(URL_, PUB, { auth: { persistSession: false } });
	const { error: e2 } = await c.auth.signInWithPassword({ email, password: PW });
	if (e2) throw new Error(`signIn ${email}: ${e2.message}`);
	await c.rpc('ensure_self');
	return { id: data.user.id, c };
}

/** 채널을 붙이고 SUBSCRIBED 까지 기다린다. 받은 페이로드를 전부 기록. */
function listen(c, roomId, seat) {
	const got = { msgs: [], rooms: [], raw: [] };
	const ch = c.channel(`room:${roomId}`, { config: { presence: { key: String(seat) } } });
	ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (p) => {
		got.msgs.push({ ...p.new, _at: Date.now() });
		got.raw.push(JSON.stringify(p));
	}).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (p) => {
		got.rooms.push(p.new);
		got.raw.push(JSON.stringify(p));
	});
	const ready = new Promise((res, rej) => {
		const t = setTimeout(() => rej(new Error('subscribe timeout')), 15000);
		ch.subscribe((s) => {
			if (s === 'SUBSCRIBED') {
				clearTimeout(t);
				res();
			}
		});
	});
	return { ch, got, ready };
}

try {
	console.log('\n[0] 준비 — 일회용 계정 3개 (메일 발송 없음)');
	const [A, B, C] = await Promise.all(emails.map(user));
	check('계정 생성 + 로그인', true);

	// 방 생성 (service_role — dev_open_room 과 같은 일을 public 테이블에 직접)
	const { data: room, error: re } = await admin
		.from('rooms')
		.insert({
			status: 'active',
			armed_at: new Date().toISOString(),
			expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
			alias1: '말랑복숭아',
			alias2: '새벽수달'
		})
		.select('id')
		.single();
	if (re) throw re;
	const { error: me } = await admin.from('room_members').insert([
		{ room_id: room.id, user_id: A.id, seat: 1, joined_at: new Date().toISOString() },
		{ room_id: room.id, user_id: B.id, seat: 2, joined_at: new Date().toISOString() }
	]);
	if (me) throw me;

	console.log('\n[1] RLS 실서버 확인');
	const { data: rmA } = await A.c.from('room_members').select('user_id, seat');
	check('A 는 room_members 에서 자기 행만 본다', rmA?.length === 1 && rmA[0].user_id === A.id);
	const { data: snapA } = await A.c.rpc('room_snapshot', { p_room: room.id });
	check('★ 스냅샷에 사용자 uuid 가 없다', !JSON.stringify(snapA).includes(A.id) && !JSON.stringify(snapA).includes(B.id));
	const { data: cMsgs } = await C.c.from('messages').select('id').eq('room_id', room.id);
	check('제3자 C 는 메시지 0건', (cMsgs ?? []).length === 0);
	const { error: cSend } = await C.c
		.from('messages')
		.insert({ room_id: room.id, sender_seat: 1, body: '끼어들기', client_msg_id: crypto.randomUUID() });
	check('제3자 C 는 보낼 수 없다', !!cSend);

	console.log('\n[2] ★ 실시간 전달');
	const LB = listen(B.c, room.id, 2);
	const LC = listen(C.c, room.id, 1); // 제3자가 같은 채널명으로 구독을 시도
	await Promise.all([LB.ready, LC.ready]);
	await sleep(800);

	const N = 20;
	const sent = [];
	for (let i = 0; i < N; i++) {
		const cid = crypto.randomUUID();
		const t0 = Date.now();
		const { error } = await A.c
			.from('messages')
			.insert({ room_id: room.id, sender_seat: 1, body: `ping ${i}`, client_msg_id: cid });
		if (error) throw error;
		sent.push({ i, cid, t0 });
		for (let w = 0; w < 100 && !LB.got.msgs.some((m) => m.client_msg_id === cid); w++) await sleep(20);
	}
	await sleep(5000); // 늦게라도 오는지 충분히 기다린다
	const arrivals = sent.map((s) => {
		const hit = LB.got.msgs.find((m) => m.client_msg_id === s.cid);
		return { ...s, ms: hit ? hit._at - s.t0 : null };
	});
	const lat = arrivals.filter((a) => a.ms != null).map((a) => a.ms).sort((a, b) => a - b);
	const lost = arrivals.filter((a) => a.ms == null).map((a) => a.i);
	const late = arrivals.filter((a) => a.ms != null && a.ms > 2000).map((a) => `#${a.i}(${a.ms}ms)`);
	// Supabase Realtime 은 전달을 보장하지 않는다 (진단 약 520건 중 유실 사례 3회, 조건 재현 불가).
	// 그래서 Realtime 전달률은 경고로만 보고하고, 합격 기준은 아래 '복구'다 — 앱은 Realtime 을 믿지 않고
	// 재연결·30초 안전망·포그라운드 복귀 때 DB 에서 채운다.
	if (lost.length) console.log(`  WARN  Realtime 이 ${lost.length}/${N}건을 전달하지 않음 (#${lost.join(', #')}) — 아래 복구 검사로 판정`);
	else check(`A 가 보낸 ${N}건을 B 가 Realtime 으로 받았다`, true);
	const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))];
	console.log(`         전달 지연 (insert 요청 → B 수신): p50 ${pct(0.5)}ms · p95 ${pct(0.95)}ms · max ${lat.at(-1)}ms`);
	if (late.length) console.log(`         2초 넘게 걸린 것: ${late.join(', ')}`);

	// Realtime 이 놓친 것이 있어도, 앱은 재연결·복귀 때 fetchAfter 로 채운다 — 그 경로가 실제로 메우는지
	const { data: all } = await B.c.from('messages').select('client_msg_id').eq('room_id', room.id);
	const have = new Set((all ?? []).map((m) => m.client_msg_id));
	check('★ Realtime 이 놓친 것까지 DB 조회(갭 메우기)로는 전부 복구된다', sent.every((s) => have.has(s.cid)));

	await sleep(1000);
	check('★ 제3자 C 는 같은 채널을 구독해도 한 건도 못 받는다 (RLS)', LC.got.msgs.length === 0, `${LC.got.msgs.length}건`);
	const leaked = LB.got.raw.some((r) => r.includes(A.id) || r.includes(B.id));
	check('★ Realtime 페이로드 어디에도 사용자 uuid 가 없다', !leaked);

	console.log('\n[3] ★ 오프라인 동안의 갭 메우기');
	await B.c.removeChannel(LB.ch);
	const missed = [];
	for (let i = 0; i < 5; i++) {
		const cid = crypto.randomUUID();
		missed.push(cid);
		await A.c.from('messages').insert({ room_id: room.id, sender_seat: 1, body: `missed ${i}`, client_msg_id: cid });
	}
	const maxSeen = Math.max(...LB.got.msgs.map((m) => m.id));
	const { data: filled } = await B.c
		.from('messages')
		.select('id, client_msg_id')
		.eq('room_id', room.id)
		.gt('id', maxSeen)
		.order('id');
	const ids = new Set((filled ?? []).map((m) => m.client_msg_id));
	check('끊긴 동안 보낸 5건이 재연결 후 정확히 채워진다', missed.every((c) => ids.has(c)) && filled.length === 5, `${filled?.length}건`);

	console.log('\n[4] 방 종료가 실시간으로 전파된다');
	const LB2 = listen(B.c, room.id, 2);
	await LB2.ready;
	await sleep(500);
	await admin.from('rooms').update({ status: 'closed', closed_at: new Date().toISOString(), close_reason: 'expired' }).eq('id', room.id);
	for (let w = 0; w < 100 && !LB2.got.rooms.length; w++) await sleep(30);
	check('B 가 종료 UPDATE 를 받는다', LB2.got.rooms[0]?.status === 'closed');
	const { data: after } = await B.c.from('messages').select('id').eq('room_id', room.id);
	check('종료 후 B 는 과거 대화를 볼 수 없다', (after ?? []).length === 0);

	for (const c of [A.c, B.c, C.c]) await c.removeAllChannels();

	console.log('\n[5] ★ 계정 선점 방지 (실서버 GoTrue)');
	{
		// 공격자가 피해자 이메일 + 자기 비밀번호로 미리 가입한 상태를 재현 (메일 발송 없는 관리자 API 사용)
		const victim = `simbun-e2e-victim-${tag}@cnsa.hs.kr`;
		const attackerPw = 'attacker-' + crypto.randomUUID();
		const { data: pre, error: pe } = await admin.auth.admin.createUser({
			email: victim,
			password: attackerPw,
			email_confirm: false
		});
		if (pe) throw pe;
		created.push(pre.user.id);
		// 진짜 학생이 OTP 로 확인했다고 가정
		await admin.auth.admin.updateUserById(pre.user.id, { email_confirm: true });
		const probe = createClient(URL_, PUB, { auth: { persistSession: false } });
		const { error: le } = await probe.auth.signInWithPassword({ email: victim, password: attackerPw });
		check('★ 공격자가 미리 정한 비밀번호로는 로그인할 수 없다', !!le, le ? `(${le.message})` : '로그인 성공 — 취약!');
	}
} catch (e) {
	fail++;
	console.error('\n  ERROR', e.message ?? e);
} finally {
	console.log('\n[정리] 테스트 계정 삭제');
	for (const id of created) await admin.auth.admin.deleteUser(id);
	console.log(`  ${created.length}개 삭제 (방·메시지는 cascade)`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
