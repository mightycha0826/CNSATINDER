import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * schema.sql 을 진짜 PostgreSQL(PGlite, WASM)에 올려 돌리는 테스트.
 * Supabase 프로젝트를 건드리지 않고 스키마·트리거·권한을 검증한다.
 *
 *   npm run test:schema
 *
 * ⚠️ PGlite 는 단일 커넥션이라 동시 트랜잭션을 재현할 수 없다.
 *    매칭 advisory lock / 연장 투표 경쟁은 `supabase start`(로컬 Docker Postgres)에서 따로 검증한다.
 */
const here = fileURLToPath(new URL('.', import.meta.url));
const SCHEMA = here + 'schema.sql';

const db = new PGlite();

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
	if (ok) {
		pass++;
		console.log(`  PASS  ${name}`);
	} else {
		fail++;
		console.log(`  FAIL  ${name}  ${detail}`);
	}
}

async function expectError(name, fn, needle) {
	try {
		await fn();
		check(name, false, '(에러가 나야 하는데 성공함)');
	} catch (e) {
		check(name, String(e.message).includes(needle), `실제: ${e.message}`);
	}
}

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

/** 테스트용 가입. auth.users 에 직접 넣어 트리거를 탄다. */
async function signUp(email, confirmed = false) {
	const r = await one(
		`insert into auth.users (email, email_confirmed_at)
		 values ($1, case when $2 then now() else null end) returning id`,
		[email, confirmed]
	);
	return r.id;
}

// ── Supabase 환경 스텁 ────────────────────────────────────────────────
// 롤: 스키마의 grant/revoke 가 파싱되게 만든다.
// auth 스키마: 실제 Supabase 의 auth.users / auth.uid() 를 흉내낸다.
await db.exec(`
	create role anon;
	create role authenticated;
	create role service_role;

	create schema auth;
	create table auth.users (
		id                 uuid primary key default gen_random_uuid(),
		email              text unique,
		email_confirmed_at timestamptz,
		encrypted_password text,
		raw_user_meta_data jsonb not null default '{}'::jsonb,
		created_at         timestamptz not null default now()
	);
	create or replace function auth.uid() returns uuid
		language sql stable as $x$
		select nullif(current_setting('test.uid', true), '')::uuid
	$x$;
	-- Supabase 기본 권한: 정책 식에서 auth.uid() 를 부를 수 있어야 한다
	grant usage on schema auth to anon, authenticated;
	grant execute on function auth.uid() to anon, authenticated;
	grant usage on schema public to anon, authenticated, service_role;
`);

/** uid 사용자로 로그인한 것처럼 RLS 를 적용해 실행한다. */
async function as(uid, fn) {
	await db.query(`select set_config('test.uid', $1, false)`, [uid ?? '']);
	await db.exec(uid ? 'set role authenticated' : 'set role anon');
	try {
		return await fn();
	} finally {
		await db.exec('reset role');
		await db.query(`select set_config('test.uid', '', false)`);
	}
}
const rowsAs = async (uid, sql, params = []) => as(uid, async () => (await db.query(sql, params)).rows);

console.log('\n[1] 스키마 실행');
try {
	await db.exec(readFileSync(SCHEMA, 'utf8'));
	check('schema.sql 이 오류 없이 실행됨', true);
} catch (e) {
	check('schema.sql 이 오류 없이 실행됨', false, e.message);
	process.exit(1);
}

console.log('\n[2] 재실행 안전성 · 단일 행 설정');
try {
	await db.exec(readFileSync(SCHEMA, 'utf8'));
	check('schema.sql 두 번 실행해도 안전 (idempotent)', true);
} catch (e) {
	check('schema.sql 두 번 실행해도 안전 (idempotent)', false, e.message);
}
check(
	'app_settings 는 항상 한 행',
	(await one('select count(*)::int n from public.app_settings')).n === 1
);
check(
	'연장 횟수 기본값은 무제한 (max_rounds = 0)',
	(await one('select max_rounds from public.app_settings')).max_rounds === 0
);
check(
	'기본 대화 시간 10분 / 연장 10분',
	(await one('select room_minutes, extend_minutes from public.app_settings')).room_minutes === 10
);

console.log('\n[3] 학교 이메일 도메인 강제');
const uidA = await signUp('hong@cnsa.hs.kr');
check('허용 도메인은 가입된다', !!uidA);

await expectError(
	'외부 도메인(@gmail.com)은 거부된다',
	() => signUp('hong@gmail.com'),
	'school_email_required'
);
await expectError(
	'대문자 도메인도 동일하게 판정된다 (@GMAIL.COM 거부)',
	() => signUp('hong@GMAIL.COM'),
	'school_email_required'
);
check(
	'대문자 학교 도메인(@CNSA.HS.KR)은 허용된다',
	!!(await signUp('kim@CNSA.HS.KR'))
);
await expectError(
	'이메일 없는 계정(익명 가입)은 거부된다',
	() => db.query('insert into auth.users (email) values (null)'),
	'school_email_required'
);

console.log('\n[4] 이메일 변경 경로 차단');
await expectError(
	'가입 후 외부 메일로 바꿔치기가 막힌다',
	() => db.query('update auth.users set email = $1 where id = $2', ['hong@naver.com', uidA]),
	'school_email_required'
);
await db.query('update auth.users set email = $1 where id = $2', ['hong2@cnsa.hs.kr', uidA]);
check(
	'같은 학교 도메인 안에서의 변경은 허용된다',
	(await one('select email from auth.users where id = $1', [uidA])).email === 'hong2@cnsa.hs.kr'
);

console.log('\n[4-2] ★ 계정 선점 방지 (비밀번호 가입 API 우회)');
{
	const HASH = '$2a$10$attackerchosenpasswordhashxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
	const pw = async (id) => (await one('select encrypted_password p from auth.users where id=$1', [id])).p;
	// 1) 공격자가 피해자 이메일 + 자기 비밀번호로 가입 (확인 전)
	const victim = (await one(`insert into auth.users (email, encrypted_password) values ('victim@cnsa.hs.kr', $1) returning id`, [HASH])).id;
	check('★ 확인 전 계정에는 비밀번호가 저장되지 않는다', (await pw(victim)) === '');
	// 2) 확인 전에 공격자가 다시 가입해 비밀번호를 덮어쓰려 함
	await db.query('update auth.users set encrypted_password = $2 where id = $1', [victim, HASH]);
	check('★ 확인 전 재가입으로도 비밀번호를 넣을 수 없다', (await pw(victim)) === '');
	// 3) 진짜 학생이 OTP 로 확인
	await db.query('update auth.users set email_confirmed_at = now() where id = $1', [victim]);
	check('★ 피해자가 확인한 뒤에도 공격자의 비밀번호는 남아 있지 않다', (await pw(victim)) === '');
	// 대조군: 운영자가 확인된 상태로 만든 개발용 계정은 비밀번호 유지
	const dev = (await one(`insert into auth.users (email, email_confirmed_at, encrypted_password) values ('devacct@cnsa.hs.kr', now(), $1) returning id`, [HASH])).id;
	check('확인된 상태로 만든 개발용 계정은 비밀번호가 유지된다', (await pw(dev)) === HASH);
	await db.query('update auth.users set encrypted_password = $2 where id = $1', [dev, HASH + 'x']);
	check('확인된 계정의 비밀번호 변경은 정상 동작', (await pw(dev)) === HASH + 'x');
}

console.log('\n[5] 가입 파이프라인');
check(
	'가입 시 profiles 행이 생긴다',
	(await one('select count(*)::int n from public.profiles where id = $1', [uidA])).n === 1
);
check(
	'가입 시 user_presence 행이 생긴다',
	(await one('select count(*)::int n from public.user_presence where user_id = $1', [uidA])).n === 1
);
check(
	'미확인 계정은 verified = false',
	(await one('select verified from public.profiles where id = $1', [uidA])).verified === false
);
check(
	'온보딩 전에는 onboarded = false',
	(await one('select onboarded from public.profiles where id = $1', [uidA])).onboarded === false
);

await db.query('update auth.users set email_confirmed_at = now() where id = $1', [uidA]);
check(
	'이메일 확인 시 profiles.verified 가 동기화된다',
	(await one('select verified from public.profiles where id = $1', [uidA])).verified === true
);

const uidB = await signUp('lee@cnsa.hs.kr', true);
check(
	'확인된 상태로 생성되면 곧바로 verified = true',
	(await one('select verified from public.profiles where id = $1', [uidB])).verified === true
);

console.log('\n[6] 익명성 — 권한과 RLS 구조');

const rls = async (schema, table) =>
	(
		await one(
			`select c.relrowsecurity from pg_class c
			   join pg_namespace n on n.oid = c.relnamespace
			  where n.nspname = $1 and c.relname = $2`,
			[schema, table]
		)
	).relrowsecurity;

const policyCount = async (schema, table) =>
	(
		await one(
			`select count(*)::int n from pg_policies where schemaname = $1 and tablename = $2`,
			[schema, table]
		)
	).n;

for (const [s, t] of [
	['public', 'profiles'],
	['public', 'user_presence'],
	['public', 'app_settings'],
	['private', 'auth_config'],
	['private', 'staff']
]) {
	check(`${s}.${t} 에 RLS 가 켜져 있다`, (await rls(s, t)) === true);
}

check('user_presence 는 정책 0개 = 클라 전면 차단', (await policyCount('public', 'user_presence')) === 0);
check('private.auth_config 는 정책 0개', (await policyCount('private', 'auth_config')) === 0);
check('private.staff 는 정책 0개', (await policyCount('private', 'staff')) === 0);

check(
	'profiles 는 self read/update 정책만 (2개)',
	(await policyCount('public', 'profiles')) === 2
);

const hasColPriv = async (col) =>
	(
		await one(
			`select count(*)::int n from information_schema.column_privileges
			  where grantee = 'authenticated' and table_schema = 'public'
			    and table_name = 'profiles' and column_name = $1 and privilege_type = 'UPDATE'`,
			[col]
		)
	).n > 0;

check('사용자는 gender 를 수정할 수 있다', await hasColPriv('gender'));
check('사용자는 want 를 수정할 수 있다', await hasColPriv('want'));
check('사용자는 onboarded 를 수정할 수 있다', await hasColPriv('onboarded'));
check('★ 사용자는 status 를 수정할 수 없다 (정지 자가 해제 불가)', !(await hasColPriv('status')));
check('★ 사용자는 verified 를 수정할 수 없다', !(await hasColPriv('verified')));
check('★ 사용자는 strikes 를 수정할 수 없다', !(await hasColPriv('strikes')));

const schemaPriv = (
	await one(
		`select has_schema_privilege('authenticated', 'private', 'USAGE') as ok`
	)
).ok;
check('★ authenticated 는 private 스키마에 접근할 수 없다', schemaPriv === false);

console.log('\n[7] 자기 행 보장 폴백 (ensure_self)');
await db.query(`select set_config('test.uid', $1, false)`, [uidB]);
await db.query('delete from public.user_presence where user_id = $1', [uidB]);
await db.query('select public.ensure_self()');
check(
	'ensure_self 가 없어진 user_presence 행을 복구한다',
	(await one('select count(*)::int n from public.user_presence where user_id = $1', [uidB])).n === 1
);
await db.query(`select set_config('test.uid', '', false)`);
await expectError(
	'비로그인 상태에서 ensure_self 는 거부된다',
	() => db.query('select public.ensure_self()'),
	'unauthenticated'
);

// ════════════════════════════════════════════════════════════════════
//  Phase 2 — 채팅 코어
// ════════════════════════════════════════════════════════════════════
const A = await signUp('alpha@cnsa.hs.kr', true);
const B = await signUp('bravo@cnsa.hs.kr', true);
const C = await signUp('charlie@cnsa.hs.kr', true);
const room = (await one(`select private.dev_open_room('alpha@cnsa.hs.kr','bravo@cnsa.hs.kr',60) as id`)).id;
const cid = () => crypto.randomUUID();
const send = (uid, seat, body, c = cid()) =>
	as(uid, () =>
		db.query(
			`insert into public.messages (room_id, sender_seat, body, client_msg_id) values ($1,$2,$3,$4)`,
			[room, seat, body, c]
		)
	);

console.log('\n[8] ★ 익명성 — 구조 자체');
const msgCols = (
	await db.query(
		`select column_name, data_type from information_schema.columns
		  where table_schema='public' and table_name='messages'`
	)
).rows;
check(
	'messages 에 sender_id/user_id 같은 식별 컬럼이 존재하지 않는다',
	!msgCols.some((c) => /sender_id|user_id|author/.test(c.column_name))
);
check(
	'messages 의 uuid 컬럼은 room_id·client_msg_id 뿐이다',
	msgCols.filter((c) => c.data_type === 'uuid').map((c) => c.column_name).sort().join() ===
		'client_msg_id,room_id'
);

const rmA = await rowsAs(A, 'select user_id, seat from public.room_members');
check('★ room_members: A 에게는 자기 행 1개만 보인다', rmA.length === 1 && rmA[0].user_id === A);
check(
	'★ room_members: 상대(B)의 user_id 는 어떤 쿼리로도 안 보인다',
	(await rowsAs(A, 'select * from public.room_members where user_id = $1', [B])).length === 0
);

const snapA = (await rowsAs(A, 'select public.room_snapshot($1) s', [room]))[0].s;
const snapStr = JSON.stringify(snapA);
check('room_snapshot: A 는 seat 1', snapA.my_seat === 1);
check('room_snapshot: 내 alias 와 상대 alias 가 다르다', snapA.my_alias !== snapA.partner_alias);
check(
	'★ room_snapshot 응답에 어느 사용자의 uuid 도 들어있지 않다',
	!snapStr.includes(A) && !snapStr.includes(B)
);
check('room_snapshot 에 server_now 가 있다 (시계 보정용)', !!snapA.server_now);
const snapB = (await rowsAs(B, 'select public.room_snapshot($1) s', [room]))[0].s;
check('B 가 보는 상대 alias = A 의 alias', snapB.partner_alias === snapA.my_alias);

console.log('\n[9] 방 접근 권한');
check('A 는 방을 볼 수 있다', (await rowsAs(A, 'select id from public.rooms')).length === 1);
check('★ 제3자 C 는 방을 볼 수 없다', (await rowsAs(C, 'select id from public.rooms')).length === 0);
check(
	'A 는 시작 안내(시스템 메시지)를 본다',
	(await rowsAs(A, 'select sender_seat from public.messages')).some((m) => m.sender_seat === 0)
);
check(
	'★ C 는 그 방의 메시지를 한 건도 볼 수 없다',
	(await rowsAs(C, 'select id from public.messages where room_id = $1', [room])).length === 0
);
await expectError(
	'★ 비로그인(anon)은 messages 에 접근 자체가 거부된다',
	() => rowsAs(null, 'select id from public.messages'),
	'permission denied'
);
await expectError(
	'C 가 room_snapshot 을 부르면 not_member',
	() => rowsAs(C, 'select public.room_snapshot($1)', [room]),
	'not_member'
);
check(
	'my_room: A 는 현재 방을 받는다',
	(await rowsAs(A, 'select public.my_room() r', []))[0].r.room.room_id === room
);
check(
	'my_room: 방이 없는 C 는 null',
	(await rowsAs(C, 'select public.my_room() r', []))[0].r.room === null
);

console.log('\n[10] 메시지 전송');
await send(A, 1, '안녕');
await send(B, 2, '반가워');
check(
	'A·B 가 각자 자기 좌석으로 보낸 메시지가 저장된다',
	(await rowsAs(A, 'select body from public.messages where sender_seat > 0 order by id')).map((m) => m.body).join() ===
		'안녕,반가워'
);
await expectError('★ A 가 상대 좌석(2)으로 위장해 보낼 수 없다', () => send(A, 2, '가짜'), 'row-level security');
await expectError('★ A 가 시스템 메시지(0)를 위조할 수 없다', () => send(A, 0, '공지'), 'row-level security');
await expectError('★ 제3자 C 는 그 방에 보낼 수 없다', () => send(C, 1, '끼어들기'), 'row-level security');
await expectError('빈 메시지(공백만)는 거부된다', () => send(A, 1, '   '), 'check');
await expectError('500자 초과는 거부된다', () => send(A, 1, 'ㄱ'.repeat(501)), 'check');

const dup = cid();
await send(A, 1, '한 번만', dup);
await expectError('같은 client_msg_id 재전송은 중복 행을 만들지 않는다', () => send(A, 1, '한 번만', dup), 'duplicate');

await expectError(
	'클라이언트가 created_at 을 조작할 수 없다',
	() =>
		as(A, () =>
			db.query(
				`insert into public.messages (room_id, sender_seat, body, client_msg_id, created_at)
				 values ($1, 1, 'x', $2, now() - interval '1 day')`,
				[room, cid()]
			)
		),
	'permission denied'
);
await expectError(
	'★ 보낸 메시지를 수정할 수 없다 (증거 무결성)',
	() => as(A, () => db.query(`update public.messages set body = '수정' where room_id = $1`, [room])),
	'permission denied'
);
await expectError(
	'★ 보낸 메시지를 삭제할 수 없다',
	() => as(A, () => db.query(`delete from public.messages where room_id = $1`, [room])),
	'permission denied'
);
await expectError(
	'사용자가 방을 직접 조작(연장)할 수 없다',
	() => as(A, () => db.query(`update public.rooms set expires_at = now() + interval '9 hours'`)),
	'permission denied'
);

console.log('\n[11] 읽음 표시');
const lastId = (await one('select max(id)::int m from public.messages where room_id = $1', [room])).m;
await as(B, () => db.query('select public.mark_read($1, $2)', [room, lastId]));
check(
	'B 가 읽으면 A 의 스냅샷에 their_read_id 로 보인다',
	Number((await rowsAs(A, 'select public.room_snapshot($1) s', [room]))[0].s.their_read_id) === lastId
);
await as(B, () => db.query('select public.mark_read($1, $2)', [room, 1]));
check(
	'읽음 위치는 뒤로 가지 않는다',
	Number((await rowsAs(A, 'select public.room_snapshot($1) s', [room]))[0].s.their_read_id) === lastId
);

console.log('\n[12] ★ 만료 강제 — 배치가 아니라 INSERT 정책');
await db.query(`update public.rooms set expires_at = now() - interval '1 second' where id = $1`, [room]);
check(
	'status 는 아직 active (스위퍼가 안 돌았다고 가정)',
	(await one('select status from public.rooms where id = $1', [room])).status === 'active'
);
await expectError(
	'★ 그래도 만료된 방에는 메시지를 보낼 수 없다',
	() => send(A, 1, '늦었다'),
	'row-level security'
);
check(
	'만료됐지만 아직 닫히지 않은 방의 대화는 볼 수 있다',
	(await rowsAs(A, 'select id from public.messages where room_id = $1', [room])).length > 0
);

await db.query(`update public.rooms set status = 'closed', closed_at = now() where id = $1`, [room]);
check(
	'★ 방이 닫히면 과거 대화가 클라이언트에서 사라진다',
	(await rowsAs(A, 'select id from public.messages where room_id = $1', [room])).length === 0
);
check(
	'닫힌 방도 rooms 행 자체는 보인다 (종료 알림을 Realtime 으로 받기 위해)',
	(await rowsAs(A, 'select status from public.rooms where id = $1', [room]))[0]?.status === 'closed'
);
check(
	'서버에는 메시지가 남아 있다 (신고 증거용, 24시간 뒤 purge)',
	(await one('select count(*)::int n from public.messages where room_id = $1', [room])).n > 0
);

console.log('\n[13] 한 사람 한 방');
await expectError(
	'★ 이미 열린 방이 있는 사람을 두 번째 방에 넣을 수 없다 (DB 안전망)',
	async () => {
		const r2 = (await one(`insert into public.rooms (status, expires_at, alias1, alias2)
			values ('active', now() + interval '10 min', 'x', 'y') returning id`)).id;
		const r3 = (await one(`insert into public.rooms (status, expires_at, alias1, alias2)
			values ('active', now() + interval '10 min', 'x', 'y') returning id`)).id;
		await db.query(`insert into public.room_members (room_id, user_id, seat) values ($1, $2, 1)`, [r2, C]);
		await db.query(`insert into public.room_members (room_id, user_id, seat) values ($1, $2, 1)`, [r3, C]);
	},
	'duplicate'
);
const room2 = (await one(`select private.dev_open_room('alpha@cnsa.hs.kr','bravo@cnsa.hs.kr',60) as id`)).id;
check(
	'새 방을 열면 두 사람 모두 열린 방이 정확히 1개',
	(await one('select count(*)::int n from public.room_members where user_id in ($1,$2) and open', [A, B])).n === 2 &&
		(await rowsAs(A, 'select public.my_room() r'))[0].r.room.room_id === room2
);
const aliasesDiffer = (await one('select alias1, alias2 from public.rooms where id = $1', [room2]));
check('새 방에서는 alias 가 새로 뽑힌다 (방끼리 연결 불가)', aliasesDiffer.alias1 !== aliasesDiffer.alias2);

// ════════════════════════════════════════════════════════════════════
//  Phase 3 — 타임박스
// ════════════════════════════════════════════════════════════════════
const rpcAs = async (uid, fn, ...args) => {
	const ph = args.map((_, i) => `$${i + 1}`).join(',');
	return (await rowsAs(uid, `select public.${fn}(${ph}) r`, args))[0].r;
};
const roomRow = (id) => one('select * from public.rooms where id = $1', [id]);
const setExpiry = (id, sec) =>
	db.query(`update public.rooms set expires_at = now() + make_interval(secs => $2) where id = $1`, [id, sec]);
const fresh = async () =>
	(await one(`select private.dev_open_room('alpha@cnsa.hs.kr','bravo@cnsa.hs.kr',10) as id`)).id;

console.log('\n[14] 연장 투표 — 정상 흐름');
{
	const r = await fresh();
	const early = await rpcAs(A, 'vote_extension', r, true);
	check('투표창 전(만료 10분 전)에는 too_early — 미리 시간을 쌓을 수 없다', early.result === 'too_early');

	await setExpiry(r, 60); // 투표창(90초) 안으로
	const before = await roomRow(r);
	const v1 = await rpcAs(A, 'vote_extension', r, true);
	check('A 만 동의 → waiting', v1.result === 'waiting');
	check('A 의 스냅샷: my_vote=true, partner_vote=null', v1.snap.my_vote === true && v1.snap.partner_vote === null);
	const bSnap = await rpcAs(B, 'room_snapshot', r);
	check('B 의 스냅샷에 "상대가 연장을 원해요"가 보인다 (partner_vote=true)', bSnap.partner_vote === true);

	const again = await rpcAs(A, 'vote_extension', r, true);
	check('★ A 가 한 번 더 눌러도 연장되지 않는다', again.result === 'waiting');

	const v2 = await rpcAs(B, 'vote_extension', r, true);
	const after = await roomRow(r);
	check('B 도 동의 → extended', v2.result === 'extended');
	const addedMin = (new Date(after.expires_at) - new Date(before.expires_at)) / 60000;
	check('★ 연장은 now() 가 아니라 기존 expires_at + 정확히 10분', Math.abs(addedMin - 10) < 0.01, `${addedMin}분`);
	check('round 가 2 가 된다', after.round === 2);
	check(
		'연장 안내 시스템 메시지가 남는다',
		(await one(`select count(*)::int n from public.messages where room_id=$1 and sender_seat=0 and body like '%연장%'`, [r])).n === 1
	);
	const snap2 = await rpcAs(A, 'room_snapshot', r);
	check('★ 새 라운드에서는 이전 표가 섞이지 않는다 (my_vote=null)', snap2.my_vote === null && snap2.partner_vote === null);

	await setExpiry(r, 60);
	const b3 = await rpcAs(B, 'vote_extension', r, true);
	const a3 = await rpcAs(A, 'vote_extension', r, true);
	check('두 번째 연장도 된다 (무제한 기본값)', b3.result === 'waiting' && a3.result === 'extended' && (await roomRow(r)).round === 3);
}

console.log('\n[15] 연장 거절 · 마음 바꾸기');
{
	const r = await fresh();
	await setExpiry(r, 60);
	await rpcAs(A, 'vote_extension', r, true);
	const flip = await rpcAs(A, 'vote_extension', r, true);
	check('동의를 다시 눌러도 waiting 유지', flip.result === 'waiting');
	const no = await rpcAs(B, 'vote_extension', r, false);
	const row = await roomRow(r);
	check('한쪽이 거절 → declined, 즉시 종료', no.result === 'declined' && row.status === 'closed' && row.close_reason === 'declined');
	check(
		'종료되면 두 사람 모두 방에서 풀려난다 (새 매칭 가능)',
		(await one('select count(*)::int n from public.room_members where room_id=$1 and open', [r])).n === 0
	);
	await expectError('종료된 방에 메시지를 보낼 수 없다', () => send(A, 1, '아직?'), 'row-level security');
}

console.log('\n[16] ★ 만료 경계');
{
	const r = await fresh();
	await setExpiry(r, 60);
	await rpcAs(A, 'vote_extension', r, true);
	await setExpiry(r, -1); // B 의 표가 도착하기 직전에 만료됨
	const late = await rpcAs(B, 'vote_extension', r, true);
	const row = await roomRow(r);
	check('★ 만료 직후 도착한 표는 버려지고 방이 닫힌다', late.result === 'expired' && row.status === 'closed');
	check('늦은 표가 시간을 되살리지 못한다 (round 그대로)', row.round === 1);
}
{
	const r = await fresh();
	await setExpiry(r, 60);
	await rpcAs(A, 'vote_extension', r, true); // 한쪽만 동의하고 상대는 무응답
	await setExpiry(r, -1);
	const s = await rpcAs(A, 'close_if_expired', r);
	check('★ 무응답 = 거절 — 만료 시 expired 로 종료', s.status === 'closed' && s.close_reason === 'expired');
}
{
	const r = await fresh();
	const s = await rpcAs(A, 'close_if_expired', r);
	check('★ 만료 전 close_if_expired 는 아무것도 닫지 않는다 (조기 종료 불가)', s.status === 'active');
	check('close_if_expired 도 server_now 를 돌려준다', !!s.server_now);
}

console.log('\n[17] 연장 상한 (운영자가 설정하면)');
{
	await db.query('update public.app_settings set max_rounds = 2');
	const r = await fresh();
	await setExpiry(r, 60);
	await rpcAs(A, 'vote_extension', r, true);
	await rpcAs(B, 'vote_extension', r, true); // round 2
	await setExpiry(r, 60);
	const cap = await rpcAs(A, 'vote_extension', r, true);
	check('max_rounds=2 면 두 번째 라운드에서 max_rounds', cap.result === 'max_rounds');
	await db.query('update public.app_settings set max_rounds = 0');
}

console.log('\n[18] 나가기');
{
	const r = await fresh();
	const s = await rpcAs(A, 'leave_room', r, true);
	check('넘기기 → skipped 로 종료', s.status === 'closed' && s.close_reason === 'skipped');
	const bs = await rpcAs(B, 'room_snapshot', r);
	check('상대에게도 종료 사유가 보인다', bs.close_reason === 'skipped');
	await expectError('남은 상대도 더는 보낼 수 없다', () => send(B, 2, '어디 가'), 'row-level security');
	await expectError('제3자는 남의 방을 닫을 수 없다', () => rpcAs(C, 'leave_room', r, true), 'not_member');
}

console.log('\n[19] 권한');
await expectError(
	'★ 사용자가 close_room 을 직접 부를 수 없다 (아무 방이나 닫기 방지)',
	() => rowsAs(A, `select public.close_room($1, 'admin')`, [room2]),
	'permission denied'
);
await expectError(
	'사용자가 sweep_rooms 를 부를 수 없다',
	() => rowsAs(A, 'select public.sweep_rooms()'),
	'permission denied'
);
await expectError(
	'★ 투표를 테이블에 직접 넣을 수 없다 (RPC 만)',
	() => as(A, () => db.query(`insert into public.extension_votes (room_id, round, seat, agree) values ($1, 1, 2, true)`, [room2])),
	'permission denied'
);
await expectError('제3자는 투표할 수 없다', () => rpcAs(C, 'vote_extension', room2, true), 'not_member');

console.log('\n[20] 입장 확인 (pending → active)');
{
	// 매칭(Phase 4)이 만들 형태의 pending 방을 손으로 만든다
	await db.query(`update public.room_members set open = false where user_id in ($1,$2)`, [A, B]);
	const r = (
		await one(`insert into public.rooms (status, expires_at, alias1, alias2)
		           values ('pending', now() + interval '60 seconds', '말랑복숭아', '새벽수달') returning id`)
	).id;
	await db.query(`insert into public.room_members (room_id, user_id, seat) values ($1,$2,1), ($1,$3,2)`, [r, A, B]);

	await expectError('pending 방에는 아직 메시지를 보낼 수 없다', () => send(A, 1, '먼저'), 'row-level security');
	const a = await rpcAs(A, 'ack_room', r);
	check('한쪽만 입장 → 여전히 pending', a.status === 'pending');
	const bSnap = await rpcAs(B, 'room_snapshot', r);
	check('B 에게 "상대가 들어왔어요"가 보인다 (partner_joined)', bSnap.partner_joined === true);
	const b = await rpcAs(B, 'ack_room', r);
	const row = await roomRow(r);
	const mins = (new Date(row.expires_at) - new Date(row.armed_at)) / 60000;
	check('양쪽 입장 → active', b.status === 'active');
	check('★ 10분 타이머는 둘 다 들어온 순간부터 시작된다', Math.abs(mins - 10) < 0.01, `${mins}분`);
	check(
		'시작 안내 시스템 메시지',
		(await one(`select count(*)::int n from public.messages where room_id=$1 and sender_seat=0`, [r])).n === 1
	);
	const twice = await rpcAs(A, 'ack_room', r);
	check('다시 ack 해도 타이머가 리셋되지 않는다', twice.expires_at === b.expires_at);
}
{
	await db.query(`update public.room_members set open = false where user_id in ($1,$2)`, [A, B]);
	const r = (
		await one(`insert into public.rooms (status, expires_at, alias1, alias2)
		           values ('pending', now() + interval '60 seconds', 'x', 'y') returning id`)
	).id;
	await db.query(`insert into public.room_members (room_id, user_id, seat) values ($1,$2,1), ($1,$3,2)`, [r, A, B]);
	await rpcAs(A, 'ack_room', r);
	await setExpiry(r, -1); // B 가 60초 안에 안 들어옴
	const s = await rpcAs(A, 'close_if_expired', r);
	check('★ 상대가 60초 안에 안 들어오면 no_show 로 종료', s.status === 'closed' && s.close_reason === 'no_show');
}

console.log('\n[21] 스위퍼 — 좀비 방 정리');
{
	await db.query(`update public.room_members set open = false where user_id in ($1,$2)`, [A, B]);
	const r = await fresh();
	await setExpiry(r, -5); // 양쪽 다 앱을 꺼버렸다
	const n = (await one('select public.sweep_rooms() n')).n;
	const row = await roomRow(r);
	check('만료된 방을 닫는다', n >= 1 && row.status === 'closed' && row.close_reason === 'expired');
	check(
		'★ 두 사람 모두 방에서 풀려나 새 매칭을 받을 수 있다',
		(await one('select count(*)::int n from public.room_members where user_id in ($1,$2) and open', [A, B])).n === 0
	);
	const live = await fresh();
	await db.query('select public.sweep_rooms()');
	check('만료 안 된 방은 건드리지 않는다', (await roomRow(live)).status === 'active');
}

// ════════════════════════════════════════════════════════════════════
//  Phase 4 — 랜덤 매칭
// ════════════════════════════════════════════════════════════════════
let seq = 0;
async function person(gender, want, { onboarded = true } = {}) {
	const id = await signUp(`p${++seq}-${gender}@cnsa.hs.kr`, true);
	await db.query('update public.profiles set gender=$2, want=$3, onboarded=$4 where id=$1', [id, gender, want, onboarded]);
	return id;
}
const match = (uid) => rpcAs(uid, 'request_match');
/** 모든 사람을 풀에서 빼고 열린 방을 닫는다 — 시나리오끼리 섞이지 않게 */
async function resetPool() {
	await db.query(`update public.user_presence set seeking_until = null, seeking_since = null, current_room_id = null`);
	await db.query(`update public.room_members set open = false where open`);
	await db.query(`update public.rooms set status = 'closed' where status <> 'closed'`);
}

console.log('\n[22] 매칭 자격');
{
	await resetPool();
	const n = await person('m', 'f', { onboarded: false });
	check('온보딩 전에는 매칭 불가 (not_eligible)', (await match(n)).status === 'not_eligible');
	const s = await person('m', 'f');
	await db.query(`update public.profiles set status='suspended' where id=$1`, [s]);
	check('정지된 계정은 매칭 불가', (await match(s)).status === 'not_eligible');
	const t = await person('m', 'f');
	await db.query(`update public.profiles set suspended_until = now() + interval '1 day' where id=$1`, [t]);
	check('기간 정지 중인 계정도 매칭 불가', (await match(t)).status === 'not_eligible');
	await db.query('update public.app_settings set is_open = false');
	check('킬 스위치가 꺼지면 service_closed', (await match(await person('f', 'm'))).status === 'service_closed');
	await db.query('update public.app_settings set is_open = true');
	await expectError('비로그인은 매칭 불가', () => rowsAs(null, 'select public.request_match()'), 'permission denied');
}

console.log('\n[23] 기본 매칭');
{
	await resetPool();
	const m1 = await person('m', 'f');
	const f1 = await person('f', 'm');
	const w = await match(m1);
	check('혼자면 waiting (reason=empty)', w.status === 'waiting' && w.reason === 'empty');
	check('대기 응답에 다음 폴링 간격이 온다', w.poll_ms === 4000);

	const r = await match(f1);
	check('상대가 찾는 중이면 즉시 matched', r.status === 'matched' && !!r.room_id);
	check(
		'★ 매칭 응답에 어느 사용자 uuid 도 없다',
		!JSON.stringify(r).includes(m1) && !JSON.stringify(r).includes(f1)
	);
	const row = await roomRow(r.room_id);
	check('방은 pending — 둘 다 입장해야 타이머가 시작된다', row.status === 'pending');
	check('입장 마감은 60초', Math.abs((new Date(row.expires_at) - Date.now()) / 1000 - 60) < 5);
	check('두 alias 가 다르다', row.alias1 !== row.alias2);

	const again = await match(m1);
	check('★ 먼저 기다리던 쪽이 다시 폴링하면 같은 방을 받는다', again.status === 'matched' && again.room_id === r.room_id);
	check(
		'매칭되면 두 사람 모두 풀에서 빠진다',
		(await one(`select count(*)::int n from public.user_presence where user_id in ($1,$2) and seeking_until is not null`, [m1, f1])).n === 0
	);
	const f2 = await person('f', 'm');
	check('이미 방에 있는 사람은 다른 사람에게 잡히지 않는다', (await match(f2)).status === 'waiting');

	check(
		'매칭만으로는 재매칭 기록이 남지 않는다 (아직 대화 시작 전)',
		(await one('select count(*)::int n from public.pair_history where user_lo = least($1::uuid,$2::uuid)', [m1, f1])).n === 0
	);
	await rpcAs(m1, 'ack_room', r.room_id);
	await rpcAs(f1, 'ack_room', r.room_id);
	check(
		'둘 다 입장해 대화가 시작되면 기록된다',
		(await one('select count(*)::int n from public.pair_history where user_lo = least($1::uuid,$2::uuid) and user_hi = greatest($1::uuid,$2::uuid)', [m1, f1])).n === 1
	);
}

console.log('\n[24] 선호 성별');
{
	await resetPool();
	const m = await person('m', 'm'); // 남자를 원하는 남자
	const f = await person('f', 'm'); // 남자를 원하는 여자
	await match(f);
	const r = await match(m);
	check('★ 한쪽 선호만 맞으면 매칭되지 않는다 (filtered)', r.status === 'waiting' && r.reason === 'filtered');
	const m2 = await person('m', 'm');
	check('양쪽 선호가 맞으면 매칭된다', (await match(m2)).status === 'matched');
	await resetPool();
	const any1 = await person('f', 'any');
	const any2 = await person('f', 'any');
	await match(any1);
	check('"상관없어요" 끼리는 매칭된다', (await match(any2)).status === 'matched');
}

console.log('\n[25] 차단 · 재매칭 쿨다운');
{
	await resetPool();
	const x = await person('m', 'f');
	const y = await person('f', 'm');
	await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1,$2)', [y, x]);
	await match(x);
	check('★ 차단한 상대와는 매칭되지 않는다', (await match(y)).status === 'waiting');
	check('★ 차단당한 쪽에서 찾아도 매칭되지 않는다 (양방향)', (await match(x)).status === 'waiting');

	await resetPool();
	const p = await person('m', 'f');
	const q = await person('f', 'm');
	await db.query(`insert into public.pair_history (user_lo, user_hi, last_matched_at)
	                values (least($1::uuid,$2::uuid), greatest($1::uuid,$2::uuid), now() - interval '2 days')`, [p, q]);
	await match(p);
	check('★ 7일 안에 대화한 상대와는 다시 매칭되지 않는다', (await match(q)).status === 'waiting');
	await db.query(`update public.pair_history set last_matched_at = now() - interval '8 days'
	                 where user_lo = least($1::uuid,$2::uuid)`, [p, q]);
	check('7일이 지나면 다시 만날 수 있다', (await match(q)).status === 'matched');
}

console.log('\n[26] ★ 앱을 안 보고 있는 사람은 잡지 않는다');
{
	await resetPool();
	const idle = await person('m', 'f');
	const me2 = await person('f', 'm');
	await match(idle);
	await db.query(`update public.user_presence set seeking_until = now() - interval '1 second' where user_id = $1`, [idle]);
	check('폴링이 끊겨 seeking 이 만료된 사람은 후보가 아니다', (await match(me2)).status === 'waiting');

	await resetPool();
	const u = await person('m', 'f');
	const v = await person('f', 'm');
	await match(u);
	await rpcAs(u, 'stop_seeking');
	check('대기 화면을 떠나면(stop_seeking) 즉시 풀에서 빠진다', (await match(v)).status === 'waiting');
}

console.log('\n[27] 공정성 — 오래 기다린 사람 먼저');
{
	await resetPool();
	const early = await person('m', 'f');
	const late = await person('m', 'f');
	await match(early);
	await db.query(`update public.user_presence set seeking_since = now() - interval '5 minutes' where user_id = $1`, [early]);
	await match(late);
	const f = await person('f', 'm');
	const r = await match(f);
	const seat2 = (await one('select user_id from public.room_members where room_id = $1 and seat = 2', [r.room_id])).user_id;
	check('5분 기다린 사람이 방금 온 사람보다 먼저 매칭된다', seat2 === early);
	const lateAgain = await match(late);
	check('계속 폴링해도 seeking_since 는 첫 요청 시각을 유지한다', lateAgain.status === 'waiting');
}

console.log('\n[28] no_show 후 재매칭');
{
	await resetPool();
	const a = await person('m', 'f');
	const b = await person('f', 'm');
	await match(a);
	const r = await match(b);
	await rpcAs(b, 'ack_room', r.room_id);
	await setExpiry(r.room_id, -1); // a 가 60초 안에 안 들어옴
	const again = await match(b);
	check('★ 만료된 pending 방은 다음 매칭 요청 때 no_show 로 정리된다', (await roomRow(r.room_id)).close_reason === 'no_show');
	check('들어왔던 쪽은 곧바로 다시 찾을 수 있다', again.status === 'waiting' || again.status === 'matched');
	const back = await match(a);
	check('★ 대화한 적 없으므로 같은 상대와 다시 만날 수 있다', back.status === 'matched');
}

console.log('\n[29] 익명성 — 매칭 관련 테이블');
for (const t of ['pair_history', 'blocks', 'user_presence']) {
	await expectError(`★ 사용자는 ${t} 를 읽을 수 없다`, () => rowsAs(A, `select * from public.${t}`), 'permission denied');
}

// ════════════════════════════════════════════════════════════════════
//  Phase 5 — 신고 · 차단 · 도배 제한
// ════════════════════════════════════════════════════════════════════
const emailOf = async (id) => (await one('select email from auth.users where id = $1', [id])).email;
async function pairRoom(u1, u2, minutes = 10) {
	await db.query(`update public.room_members set open = false where user_id in ($1,$2)`, [u1, u2]);
	return (await one(`select private.dev_open_room($1, $2, $3) as id`, [await emailOf(u1), await emailOf(u2), minutes])).id;
}
const sendIn = (uid, roomId, seat, body) =>
	as(uid, () =>
		db.query(`insert into public.messages (room_id, sender_seat, body, client_msg_id) values ($1,$2,$3,$4)`, [
			roomId, seat, body, crypto.randomUUID()
		])
	);
const cnt = async (sql, p = []) => (await one(sql, p)).n;

console.log('\n[30] 신고');
{
	await resetPool();
	const x = await person('m', 'f');
	const y = await person('f', 'm');
	const r = await pairRoom(x, y);
	await sendIn(x, r, 1, '안녕');
	await sendIn(y, r, 2, '불쾌한 말');
	await sendIn(y, r, 2, '또 불쾌한 말');

	await expectError('잘못된 사유는 거부', () => rpcAs(x, 'report_partner', r, 'whatever', ''), 'invalid_reason');
	await expectError('제3자는 신고할 수 없다', () => rpcAs(A, 'report_partner', r, 'harassment', ''), 'not_member');

	const res = await rpcAs(x, 'report_partner', r, 'harassment', '계속 욕해요');
	check('신고 접수', res.status === 'ok');
	check('★ 신고 응답에도 사용자 uuid 가 없다', !JSON.stringify(res).includes(y) && !JSON.stringify(res).includes(x));
	check('신고하면 방이 즉시 종료된다', (await roomRow(r)).close_reason === 'reported');
	check('신고하면 자동으로 차단된다', (await cnt('select count(*)::int n from public.blocks where blocker_id=$1 and blocked_id=$2', [x, y])) === 1);

	const rep = await one('select * from private.reports where room_id = $1', [r]);
	check('신고 대상은 서버가 해석한 상대 uuid', rep.reported_id === y && rep.reporter_id === x);
	const ev = (await db.query('select sender, body from private.report_evidence where report_id = $1 order by ord', [rep.id])).rows;
	check('대화 전문이 증거로 복사된다 (시스템 1 + 대화 3)', ev.length === 4);
	check('증거는 좌석이 아니라 역할로 기록 (1=신고자, 2=피신고자)', ev[1].sender === 1 && ev[2].sender === 2 && ev[3].sender === 2);

	await db.query('delete from public.messages where room_id = $1', [r]);
	check('★ 원본 메시지를 지워도 증거는 남는다 (24시간 purge 대비)', (await cnt('select count(*)::int n from private.report_evidence where report_id=$1', [rep.id])) === 4);

	check('같은 방 중복 신고는 already', (await rpcAs(x, 'report_partner', r, 'spam', '')).status === 'already');
	check('★ 방이 닫힌 뒤에도 신고할 수 있다 (상대의 맞신고)', (await rpcAs(y, 'report_partner', r, 'other', '')).status === 'ok');

	await expectError('★ 사용자는 신고 테이블에 접근할 수 없다', () => rowsAs(x, 'select * from private.reports'), 'permission denied');
	await expectError('★ 사용자는 증거 테이블에 접근할 수 없다', () => rowsAs(x, 'select * from private.report_evidence'), 'permission denied');
}

console.log('\n[31] 차단');
{
	const x = await person('m', 'f');
	const y = await person('f', 'm');
	const r = await pairRoom(x, y);
	const res = await rpcAs(x, 'block_partner', r);
	check('차단 → 방 종료 (blocked)', res.status === 'ok' && (await roomRow(r)).close_reason === 'blocked');
	check('차단 목록에 기록', (await cnt('select count(*)::int n from public.blocks where blocker_id=$1 and blocked_id=$2', [x, y])) === 1);
	await resetPool();
	await match(x);
	check('차단 후 다시는 매칭되지 않는다', (await match(y)).status === 'waiting');
}

console.log('\n[32] ★ 자동 정지 — 서로 다른 신고자 3명');
{
	await resetPool();
	const t = await person('m', 'f');
	for (let i = 0; i < 3; i++) {
		const rp = await person('f', 'm');
		const r = await pairRoom(t, rp);
		await rpcAs(rp, 'report_partner', r, 'harassment', '');
		const st = (await one('select status from public.profiles where id = $1', [t])).status;
		if (i < 2) check(`신고 ${i + 1}건 — 아직 정상`, st === 'active');
		else check('3번째 신고자 → 자동 정지', st === 'suspended');
	}
	check('자동 정지가 감사 기록에 남는다', (await cnt(`select count(*)::int n from private.audit_log where action='auto_suspend' and target_user=$1`, [t])) === 1);
	check('정지된 사람은 매칭 불가', (await match(t)).status === 'not_eligible');

	const t2 = await person('m', 'f');
	const rp = await person('f', 'm');
	for (let i = 0; i < 3; i++) {
		const r = await pairRoom(t2, rp);
		await db.query('delete from private.reports where room_id = $1', [r]);
		await rpcAs(rp, 'report_partner', r, 'spam', '');
	}
	check('★ 같은 사람이 여러 번 신고해도 1명으로 센다 (보복성 신고 방지)', (await one('select status from public.profiles where id=$1', [t2])).status === 'active');
}

console.log('\n[33] 메시지 도배 제한 (토큰 버킷)');
{
	const x = await person('m', 'f');
	const y = await person('f', 'm');
	const r = await pairRoom(x, y);
	let ok = 0;
	let limited = false;
	for (let i = 0; i < 14; i++) {
		try {
			await sendIn(x, r, 1, `도배 ${i}`);
			ok++;
		} catch (e) {
			limited = String(e.message).includes('rate_limited');
			break;
		}
	}
	check('순간 12개까지는 보낼 수 있다', ok === 12, `${ok}개`);
	check('13번째는 rate_limited', limited);
	check('상대는 영향받지 않는다', await sendIn(y, r, 2, '나는 보낼 수 있다').then(() => true, () => false));
	await db.query(`update public.user_presence set tokens_at = now() - interval '4 seconds' where user_id = $1`, [x]);
	check('잠시 뒤 다시 보낼 수 있다 (초당 1.5개 충전)', await sendIn(x, r, 1, '다시').then(() => true, () => false));

	const before = (await one('select msg_tokens from public.user_presence where user_id=$1', [y])).msg_tokens;
	await sendIn(A, r, 2, '끼어들기').catch(() => {});
	const after = (await one('select msg_tokens from public.user_presence where user_id=$1', [y])).msg_tokens;
	check('★ 제3자의 끼어들기 시도가 방 주인의 한도를 깎지 않는다', before === after);
}

console.log('\n[34] 넘기기 연타 제한');
{
	await resetPool();
	const x = await person('m', 'f');
	const y = await person('f', 'm');
	await match(y);
	await db.query(`update public.user_presence set match_tokens = 0, match_at = now() where user_id = $1`, [x]);
	const r = await match(x);
	check('한도를 다 쓰면 cooldown + 대기 시간 안내', r.status === 'cooldown' && r.retry_after_ms > 0);
	const z = await person('m', 'f');
	check('쉬는 동안에도 상대(y)는 다른 사람과 매칭될 수 있다', (await match(z)).status === 'matched');
}

// ════════════════════════════════════════════════════════════════════
//  Phase 6 — 운영자 RPC
// ════════════════════════════════════════════════════════════════════
async function svc(fn, ...args) {
	const ph = args.map((_, i) => `$${i + 1}`).join(',');
	await db.exec('set role service_role');
	try {
		return (await db.query(`select public.${fn}(${ph}) r`, args)).rows[0].r;
	} finally {
		await db.exec('reset role');
	}
}

console.log('\n[35] ★ 운영자 함수는 service_role 만');
for (const fn of ['admin_stats()', 'admin_list_reports()', 'admin_audit()', 'admin_get_settings()']) {
	await expectError(`학생 계정으로 ${fn} 호출 불가`, () => rowsAs(A, `select public.${fn}`), 'permission denied');
}
await expectError('비로그인으로도 불가', () => rowsAs(null, 'select public.admin_stats()'), 'permission denied');
await expectError(
	'★ 학생이 스스로 정지를 풀 수 없다',
	() => rowsAs(A, `select public.admin_sanction($1, 'reinstate', null, $1, null, '')`, [A]),
	'permission denied'
);

console.log('\n[36] 운영자 기능');
{
	const staff = await person('m', 'f');
	check('운영진이 아니면 role 없음', (await svc('admin_staff_role', staff)) === null);
	await db.query(`insert into private.staff (user_id, role) values ($1, 'admin')`, [staff]);
	check('운영진 지정 후 role = admin', (await svc('admin_staff_role', staff)) === 'admin');

	const stats = await svc('admin_stats');
	check('현황 집계', typeof stats.open_reports === 'number' && 'seeking_now' in stats);

	const list = await svc('admin_list_reports', 'all', 100);
	check('신고 목록', Array.isArray(list) && list.length > 0);
	check('★ 신고 목록에 이메일이 없다', !JSON.stringify(list).includes('@'));

	const target = list.find((r) => r.reason === 'harassment' && r.evidence_count === 4);
	const det = await svc('admin_report', target.id);
	check('상세: 증거 대화 전문', det.evidence.length === 4);
	check('상세: 신고자의 신고 이력(허위 신고 판단용)', typeof det.reporter_filed === 'number');
	check('★ 상세에도 이메일이 없다 (신원은 별도 열람)', !JSON.stringify(det).includes('@'));

	await svc('admin_set_report', target.id, 'reviewing', '', staff);
	check('신고 상태 변경', (await one('select status from private.reports where id=$1', [target.id])).status === 'reviewing');

	const u = target.reported_id;
	const s1 = await svc('admin_sanction', u, 'suspend', 3, staff, target.id, '욕설');
	const days = (new Date(s1.suspended_until) - Date.now()) / 86400000;
	check('3일 정지', Math.abs(days - 3) < 0.01);
	check('정지 중에는 매칭 불가', (await match(u)).status === 'not_eligible');
	await svc('admin_sanction', u, 'reinstate', null, staff, target.id, '');
	check('해제하면 다시 매칭 가능', (await match(u)).status !== 'not_eligible');

	const b1 = await person('m', 'f');
	const b2 = await person('f', 'm');
	const r = await pairRoom(b1, b2);
	await svc('admin_sanction', b1, 'ban', null, staff, null, '');
	check('영구 정지', (await one('select status from public.profiles where id=$1', [b1])).status === 'banned');
	check('★ 정지 즉시 진행 중이던 대화가 닫힌다', (await roomRow(r)).close_reason === 'admin');
	await expectError('suspend 는 기간이 필요', () => svc('admin_sanction', b2, 'suspend', 0, staff, null, ''), 'days_required');

	await svc('admin_log_identity_view', staff, [u], target.id);
	const log = await svc('admin_audit', 50);
	check('★ 신원 열람이 감사 기록에 남는다', log.some((l) => l.action === 'view_identity' && l.staff_id === staff));
	check('조치들도 전부 기록된다', ['sanction_suspend', 'sanction_reinstate', 'sanction_ban', 'report_reviewing'].every((a) => log.some((l) => l.action === a)));

	const st = await svc('admin_update_settings', JSON.stringify({ notice: '점검 중', is_open: false }), staff);
	check('설정 변경 (공지·킬 스위치)', st.notice === '점검 중' && st.is_open === false);
	check('킬 스위치가 즉시 반영', (await match(b2)).status === 'service_closed');
	await svc('admin_update_settings', JSON.stringify({ notice: '', is_open: true }), staff);
	await expectError('범위를 벗어난 값은 DB 가 거부', () => svc('admin_update_settings', JSON.stringify({ room_minutes: 999 }), staff), 'check');
	check('알 수 없는 키는 무시된다', !('evil' in (await svc('admin_update_settings', JSON.stringify({ evil: 1 }), staff))));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
