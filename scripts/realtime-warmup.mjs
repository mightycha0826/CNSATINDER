import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/**
 * 진단: SUBSCRIBED 신호 이후 postgres_changes 가 실제로 전달되기 시작하기까지 몇 초 걸리는가.
 * 구독 직후 0.25초 간격으로 메시지를 넣고 어느 시점부터 도착하는지 본다. 3회 반복.
 *
 *   node scripts/realtime-warmup.mjs
 */
const env = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const URL_ = env.PUBLIC_SUPABASE_URL;
const PUB = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 어떤 경우에도 멈추지 않게 — 강제 종료되면 finally 가 돌지 않아 계정이 남는다
const HARD = setTimeout(() => {
	console.log('\n[시간 초과] 정리 후 종료합니다');
	cleanup().finally(() => process.exit(3));
}, 600_000);
const events = [];
const log = (who, what) => events.push(`${String(Date.now() % 100000).padStart(5)} ${who} ${what}`);
/** SUBSCRIBED 를 기다리되, 10초 안에 안 되면 상태를 기록하고 넘어간다 */
function subscribeLogged(ch, who) {
	return new Promise((res) => {
		const t = setTimeout(() => {
			log(who, 'subscribe 10초 초과');
			res(false);
		}, 10_000);
		ch.subscribe((s, err) => {
			log(who, `status=${s}${err ? ' err=' + err.message : ''}`);
			if (s === 'SUBSCRIBED') {
				clearTimeout(t);
				res(true);
			}
		});
	});
}
const tag = Date.now().toString(36);
const PW = 'warm-' + crypto.randomUUID();
const created = [];
let concurrentC = null;

async function user(x) {
	const email = `simbun-warm-${x}-${tag}@cnsa.hs.kr`;
	// 확인된 계정을 먼저 만들고 비밀번호는 그다음에 — 한 번에 넣으면 계정 선점 방지 트리거가 비밀번호를 지운다
	const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
	if (!error) await admin.auth.admin.updateUserById(data.user.id, { password: PW });
	if (error) throw error;
	created.push(data.user.id);
	const c = createClient(URL_, PUB, { auth: { persistSession: false } });
	await c.auth.signInWithPassword({ email, password: PW });
	return { id: data.user.id, c };
}

try {
	const [A, B, C] = await Promise.all([user('a'), user('b'), user('c')]);
	const TRIALS = Number((process.argv.find((a) => a.startsWith('--trials=')) ?? '--trials=3').split('=')[1]);
	const tally = { ok: 0, lost: 0, failed: 0 };
	for (let trial = 1; trial <= TRIALS; trial++) {
		await admin.from('room_members').update({ open: false }).in('user_id', [A.id, B.id]);
		const { data: room } = await admin
			.from('rooms')
			.insert({ status: 'active', armed_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600_000).toISOString(), alias1: 'a', alias2: 'b' })
			.select('id')
			.single();
		await admin.from('room_members').insert([
			{ room_id: room.id, user_id: A.id, seat: 1 },
			{ room_id: room.id, user_id: B.id, seat: 2 }
		]);

		const got = new Set();
		// 실제 앱과 같은 채널 이름 · 설정
		const topic = `room:${room.id}`;
		const ch = B.c.channel(topic, { config: { presence: { key: '2' } } });
		ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` }, (p) => {
			got.add(p.new.body);
			log('B', 'recv ' + p.new.body);
		});
		// 실제 앱처럼 한 채널에 postgres_changes 구독을 여러 개 건다
		if (process.argv.includes('--multi')) {
			ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, () => {});
			ch.on('postgres_changes', { event: '*', schema: 'public', table: 'extension_votes', filter: `room_id=eq.${room.id}` }, () => {});
		}
		ch.on('system', {}, (p) => log('B', 'system ' + JSON.stringify(p).slice(0, 160)));
		// --concurrent: E2E 처럼 B 와 제3자 C 가 같은 채널에 '동시에' 구독을 시작한다
		if (process.argv.includes('--concurrent')) {
			const cc = C.c.channel(topic, { config: { presence: { key: '1' } } });
			cc.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` }, () => {});
			await Promise.all([subscribeLogged(ch, 'B'), subscribeLogged(cc, 'C')]);
			await sleep(800);
			concurrentC = cc;
		} else {
			await subscribeLogged(ch, 'B');
		}

		// ★ 실제 앱처럼 상대(A)도 같은 채널을 구독한다 — B 가 구독한 직후
		let chA = null;
		if (process.argv.includes('--partner')) {
			chA = A.c.channel(topic, { config: { presence: { key: '1' } } });
			chA.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` }, () => {});
			chA.on('system', {}, (p) => log('A', 'system ' + JSON.stringify(p).slice(0, 160)));
			await subscribeLogged(chA, 'A');
		}
		// 방 멤버가 아닌 제3자가 같은 채널 이름으로 구독 (E2E 의 RLS 검증 조건)
		let chC = null;
		if (process.argv.includes('--intruder')) {
			chC = C.c.channel(topic, { config: { presence: { key: '1' } } });
			chC.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` }, () => {});
			await subscribeLogged(chC, 'C');
		}
		if (process.argv.includes('--track')) {
			await ch.track({ seat: 2 });
			if (chA) await chA.track({ seat: 1 });
		}
		const t0 = Date.now();

		const offsets = [0, 250, 500, 750, 1000, 1500, 2000, 3000, 4000];
		for (const off of offsets) {
			const wait = t0 + off - Date.now();
			if (wait > 0) await sleep(wait);
			const { error: ie } = await A.c
				.from('messages')
				.insert({ room_id: room.id, sender_seat: 1, body: `+${off}ms`, client_msg_id: crypto.randomUUID() });
			if (ie) {
				log('A', `insert 실패 +${off}ms: ${ie.message}`);
				got.add(`실패:+${off}ms`);
			}
		}
		await sleep(4000);
		console.log(
			`시도 ${trial}: ` +
				offsets.map((o) => `${got.has(`실패:+${o}ms`) ? '✕' : got.has(`+${o}ms`) ? '●' : '○'} +${o}`).join('  ')
		);
		if (offsets.some((o) => !got.has(`+${o}ms`)) || process.argv.includes('--verbose')) for (const e of events) console.log('      ' + e);
		events.length = 0;
		for (const o of offsets) got.has(`실패:+${o}ms`) ? tally.failed++ : got.has(`+${o}ms`) ? tally.ok++ : tally.lost++;
		await B.c.removeChannel(ch);
		if (chA) await A.c.removeChannel(chA);
		if (chC) await C.c.removeChannel(chC);
		if (concurrentC) await C.c.removeChannel(concurrentC);
		concurrentC = null;
	}
	console.log(`\n합계: 도착 ${tally.ok} · Realtime 유실 ${tally.lost} · 전송 실패 ${tally.failed}  (${TRIALS}회 × 9건)`);
	console.log('● 도착  ○ Realtime 유실  ✕ 전송 자체가 실패   (SUBSCRIBED 신호 기준 경과 시간)');
} finally {
	await cleanup();
	clearTimeout(HARD);
}

async function cleanup() {
	for (const id of created.splice(0)) await admin.auth.admin.deleteUser(id);
}
