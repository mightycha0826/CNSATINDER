import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/**
 * 매칭 동시성 스트레스 — 실서버 전용.
 * PGlite 는 단일 커넥션이라 advisory lock 경쟁을 재현하지 못하므로 여기서 검증한다.
 *
 *   npm run test:match            (기본 20명)
 *   npm run test:match -- 60      (60명)
 *
 * 일회용 계정(남/여 절반씩, 메일 발송 없음)을 만들어 **동시에** request_match 를 폴링시킨 뒤:
 *   · 한 사람이 두 방에 들어간 경우가 없는지
 *   · 모든 방이 정확히 2명이고 선호 성별이 서로 맞는지
 *   · 전원이 짝을 찾았는지 (남녀 동수이므로)
 * 를 확인하고 전부 삭제한다.
 */
const N = Math.max(4, Number(process.argv[2]) || 20) & ~1; // 짝수
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
let keyRef = null;
try {
	keyRef = JSON.parse(Buffer.from(SVC.split('.')[1], 'base64url').toString()).ref;
} catch {}
if (!SVC || ref(env.SUPABASE_URL) !== ref(URL_) || (keyRef && keyRef !== ref(URL_))) {
	console.error(`서버 키가 앱과 다른 프로젝트입니다. 앱=${ref(URL_)} 키=${keyRef ?? '?'}`);
	process.exit(2);
}

const admin = createClient(URL_, SVC, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
const PW = 'stress-' + crypto.randomUUID();
const created = [];
const signInErrors = [];
const rpcErrors = new Map();
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mk(i) {
	const gender = i % 2 ? 'f' : 'm';
	const email = `simbun-stress-${i}-${tag}@cnsa.hs.kr`;
	// 확인된 계정을 먼저 만들고 비밀번호는 그다음에 — 한 번에 넣으면 계정 선점 방지 트리거가 비밀번호를 지운다
	const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
	if (!error) await admin.auth.admin.updateUserById(data.user.id, { password: PW });
	if (error) throw new Error(error.message);
	created.push(data.user.id);
	await admin
		.from('profiles')
		.update({ gender, want: gender === 'm' ? 'f' : 'm', onboarded: true, verified: true })
		.eq('id', data.user.id);
	const c = createClient(URL_, PUB, { auth: { persistSession: false } });
	const { error: se } = await c.auth.signInWithPassword({ email, password: PW });
	if (se) signInErrors.push(se.message);
	return { id: data.user.id, gender, c, signedIn: !se };
}

try {
	console.log(`\n[0] 일회용 계정 ${N}명 생성`);
	const people = [];
	// --pace=ms : 로그인을 한 명씩 간격을 두고 (실제 학생들이 몇 초에 걸쳐 들어오는 상황)
	// 기본값    : 10명씩 한꺼번에 (최악의 순간 폭주)
	const pace = Number((process.argv.find((a) => a.startsWith('--pace=')) ?? '').split('=')[1]) || 0;
	if (pace) {
		for (let i = 0; i < N; i++) {
			const s = Date.now();
			people.push(await mk(i));
			const wait = pace - (Date.now() - s);
			if (wait > 0) await sleep(wait);
		}
	} else {
		for (let i = 0; i < N; i += 10) people.push(...(await Promise.all(Array.from({ length: Math.min(10, N - i) }, (_, k) => mk(i + k)))));
	}
	check('생성 완료', people.length === N);
	const ok = people.filter((p) => p.signedIn).length;
	if (ok < N) {
		// Supabase Auth 는 IP 당 로그인 횟수를 제한한다. 한 컴퓨터에서 도는 이 테스트는 여기에 걸린다.
		// 매칭 검증은 로그인에 성공한 사람만으로 한다.
		// ⚠️ 학교 와이파이는 전교생이 공인 IP 하나를 공유하므로, 운영 전에 이 한도를 반드시 올려야 한다.
		console.log(`  NOTE  ${N - ok}명 로그인 실패 (${[...new Set(signInErrors)].join(' | ')}) — 로그인한 ${ok}명으로 검증`);
	}
	const active = people.filter((p) => p.signedIn);
	const nm = active.filter((p) => p.gender === 'm').length;
	const expectedPairs = Math.min(nm, active.length - nm);

	console.log('\n[1] 전원이 동시에 폴링');
	const stats = { matched: 0, waiting: 0, busy: 0, retry: 0, other: 0 };
	const lat = [];
	const t0 = Date.now();
	await Promise.all(
		active.map(async (p) => {
			for (let round = 0; round < 40; round++) {
				const s = Date.now();
				const { data, error } = await p.c.rpc('request_match');
				lat.push(Date.now() - s);
				if (error) rpcErrors.set(error.message, (rpcErrors.get(error.message) ?? 0) + 1);
				const st = error ? 'other' : data.status;
				stats[st in stats ? st : 'other']++;
				if (st === 'matched') {
					p.room = data.room_id;
					return;
				}
				await sleep(st === 'busy' || st === 'retry' ? 150 + Math.random() * 200 : 400 + Math.random() * 400);
			}
		})
	);
	lat.sort((a, b) => a - b);
	console.log(
		`         ${Date.now() - t0}ms 동안 요청 ${lat.length}건 · matched ${stats.matched} / waiting ${stats.waiting} / busy ${stats.busy} / retry ${stats.retry} / 오류 ${stats.other}`
	);
	console.log(`         request_match 응답 p50 ${lat[lat.length >> 1]}ms · p95 ${lat[Math.floor(lat.length * 0.95)]}ms`);
	check('오류 응답 없음', stats.other === 0, [...rpcErrors].map(([m, n]) => `${n}× ${m}`).join(' | '));

	console.log('\n[2] 결과 검증 (service_role 로 실제 테이블 조회)');
	const ids = active.map((p) => p.id);
	const { data: rms } = await admin.from('room_members').select('room_id, user_id, seat, open').in('user_id', ids).eq('open', true);
	const perUser = new Map();
	for (const r of rms) perUser.set(r.user_id, (perUser.get(r.user_id) ?? 0) + 1);
	check('★ 두 방에 동시에 들어간 사람이 없다', [...perUser.values()].every((n) => n === 1));
	check(
		'짝지을 수 있는 사람은 전부 짝을 찾았다',
		perUser.size === expectedPairs * 2,
		`${perUser.size}/${expectedPairs * 2} (남 ${nm} · 여 ${active.length - nm})`
	);

	const byRoom = new Map();
	for (const r of rms) byRoom.set(r.room_id, [...(byRoom.get(r.room_id) ?? []), r.user_id]);
	const g = new Map(active.map((p) => [p.id, p.gender]));
	check('모든 방이 정확히 2명', [...byRoom.values()].every((u) => u.length === 2));
	check(
		'★ 모든 쌍이 서로의 선호를 만족 (남-여)',
		[...byRoom.values()].every(([a, b]) => g.get(a) !== g.get(b))
	);
	check(
		'각자 받은 room_id 가 실제로 자기가 속한 방과 같다',
		active.filter((p) => p.room).every((p) => rms.some((r) => r.user_id === p.id && r.room_id === p.room))
	);
} catch (e) {
	fail++;
	console.error('\n  ERROR', e.message ?? e);
} finally {
	console.log('\n[정리]');
	for (const id of created) await admin.auth.admin.deleteUser(id);
	console.log(`  계정 ${created.length}개 삭제 (방·기록은 cascade)`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
