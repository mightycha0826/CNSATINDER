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

console.log('\n[13] 여러 대화 동시 (Phase 8)');
{
	const r2 = (await one(`insert into public.rooms (status, expires_at, alias1, alias2)
		values ('active', now() + interval '10 min', 'x', 'y') returning id`)).id;
	const r3 = (await one(`insert into public.rooms (status, expires_at, alias1, alias2)
		values ('active', now() + interval '10 min', 'x', 'y') returning id`)).id;
	await db.query(`insert into public.room_members (room_id, user_id, seat) values ($1, $2, 1)`, [r2, C]);
	await db.query(`insert into public.room_members (room_id, user_id, seat) values ($1, $2, 1)`, [r3, C]);
	check(
		'한 사람이 열린 방 여러 개에 동시에 있을 수 있다',
		(await one('select count(*)::int n from public.room_members where user_id = $1 and open', [C])).n === 2
	);
	await db.query(`update public.room_members set open = false where user_id = $1`, [C]);
}
const room2 = (await one(`select private.dev_open_room('alpha@cnsa.hs.kr','bravo@cnsa.hs.kr',60) as id`)).id;
check(
	'개발용 방 열기: 두 사람의 새 방이 가장 최근 방이 된다',
	(await rowsAs(A, 'select public.my_room() r'))[0].r.room.room_id === room2
);
const aliases2 = await one('select alias1, alias2 from public.rooms where id = $1', [room2]);
const nickA = (await one('select nickname from public.profiles where id = $1', [A])).nickname;
check('방 안 이름 = 계정의 고유 익명 이름', aliases2.alias1 === nickA && aliases2.alias1 !== aliases2.alias2);

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

// ════════════════════════════════════════════════════════════════════
//  Phase 8 — 고유 익명 이름 · 프로필 · 온라인 · 여러 대화
// ════════════════════════════════════════════════════════════════════
console.log('\n[37] 고유 익명 이름');
{
	const u = await signUp('nick-test@cnsa.hs.kr', true);
	const n = (await one('select nickname from public.profiles where id = $1', [u])).nickname;
	check('가입하면 익명 이름이 자동으로 붙는다', typeof n === 'string' && n.length >= 3);
	check(
		'모든 계정에 이름이 있다 (기존 계정 채우기 포함)',
		(await cnt('select count(*)::int n from public.profiles where nickname is null')) === 0
	);
	check(
		'이름은 겹치지 않는다',
		(await cnt('select count(*)::int n from (select nickname from public.profiles group by nickname having count(*) > 1) d')) === 0
	);
	// 이름 공간이 붐빌 때: 같은 후보만 나오게 만들어도 숫자를 붙여 가입이 성공한다
	await db.exec(`create or replace function private.nickname_candidate() returns text language sql volatile as $x$ select '고정이름' $x$`);
	const k1 = await signUp('crowd-1@cnsa.hs.kr', true);
	const k2 = await signUp('crowd-2@cnsa.hs.kr', true);
	const [n1, n2] = [
		(await one('select nickname from public.profiles where id = $1', [k1])).nickname,
		(await one('select nickname from public.profiles where id = $1', [k2])).nickname
	];
	check('★ 후보가 겹쳐도 가입이 실패하지 않고 서로 다른 이름을 받는다', n1 !== n2 && n1.startsWith('고정이름') && n2.startsWith('고정이름'), `${n1} / ${n2}`);
	await db.exec(readFileSync(SCHEMA, 'utf8')); // 원래 후보 함수로 되돌린다

	check('★ 사용자는 이름(nickname)을 직접 바꿀 수 없다', !(await hasColPriv('nickname')));
	check('★ 소개글도 직접 update 로는 바꿀 수 없다 (검사 함수 경유만)', !(await hasColPriv('bio')));
}

console.log('\n[38] 프로필 수정');
{
	const u = await person('m', 'f');
	const up = (bio, tags, mbti) => rpcAs(u, 'update_my_profile', bio, tags, mbti);
	const r = await up('  밴드   음악 좋아해요 ', ['  기타 ', '독서', '기타', ''], 'enfp');
	check('소개글 공백 정리', r.bio === '밴드 음악 좋아해요');
	check('관심사: 공백·빈 값·중복 제거, 순서 유지', JSON.stringify(r.interests) === '["기타","독서"]');
	check('MBTI 는 대문자로 저장', r.mbti === 'ENFP');
	check(
		'자기 프로필에서 바로 읽힌다',
		(await rowsAs(u, 'select bio, mbti from public.profiles where id = $1', [u]))[0]?.mbti === 'ENFP'
	);
	await expectError('소개글 60자 초과 거절', () => up('가'.repeat(61), [], null), 'bio_too_long');
	await expectError('관심사 6개 거절', () => up('', ['a', 'b', 'c', 'd', 'e', 'f'], null), 'too_many_interests');
	await expectError('관심사 12자 초과 거절', () => up('', ['가'.repeat(13)], null), 'interest_too_long');
	await expectError('잘못된 MBTI 거절', () => up('', [], 'ABCD'), 'invalid_mbti');
	await expectError('★ 학번·전화번호 같은 긴 숫자 거절', () => up('20231234 연락줘', [], null), 'personal_info');
	await expectError('★ SNS 아이디(@) 거절', () => up('인스타 @hello', [], null), 'personal_info');
	await expectError('★ 관심사에 숨겨도 거절', () => up('', ['010-1234'], null), 'personal_info');
	const cleared = await up('', [], '');
	check('비우기 가능 (MBTI 빈 값 → 없음)', cleared.bio === '' && cleared.mbti === null);
	await expectError('비로그인은 수정 불가', () => rowsAs(null, `select public.update_my_profile('', '{}', null)`), 'permission denied');
}

console.log('\n[39] 비밀번호 설정 여부');
{
	const u = await person('m', 'f');
	check('처음엔 비밀번호 없음', (await rpcAs(u, 'my_account')).has_password === false);
	await db.query(`update auth.users set encrypted_password = 'hash' where id = $1`, [u]);
	check('비밀번호를 설정하면 true', (await rpcAs(u, 'my_account')).has_password === true);
	check('응답에 비밀번호 해시는 없다', !JSON.stringify(await rpcAs(u, 'my_account')).includes('hash'));
}

console.log('\n[40] 온라인 표시');
{
	await resetPool();
	const x = await person('m', 'f');
	const y = await person('f', 'm');
	const r = await pairRoom(x, y);
	await db.query(`update public.user_presence set online_until = now() - interval '1 second' where user_id in ($1,$2)`, [x, y]);
	check('앱을 안 켠 상대는 오프라인', (await rpcAs(x, 'room_snapshot', r)).partner_online === false);
	await rpcAs(y, 'heartbeat', true);
	check('상대가 heartbeat 를 보내면 온라인', (await rpcAs(x, 'room_snapshot', r)).partner_online === true);
	check('대화 목록에도 온라인이 보인다', (await rpcAs(x, 'my_rooms')).rooms[0].partner_online === true);
	await rpcAs(y, 'heartbeat', false);
	check('앱을 내려놓으면 곧바로 오프라인', (await rpcAs(x, 'room_snapshot', r)).partner_online === false);
	await rpcAs(y, 'heartbeat', true);
	await match(y); // 찾기 폴링(짧은 TTL)이 heartbeat 가 잡은 긴 온라인 시각을 줄이지 않는다
	const until = (await one('select online_until > now() + interval \'30 seconds\' as ok from public.user_presence where user_id = $1', [y])).ok;
	check('찾기 폴링이 온라인 시각을 줄이지 않는다', until === true);
	await match(y);
	await rpcAs(y, 'heartbeat', false);
	check(
		'앱을 내려놓으면 찾기도 멈춘다',
		(await one('select seeking_until from public.user_presence where user_id = $1', [y])).seeking_until === null
	);
}

console.log('\n[41] 상대 프로필');
{
	await resetPool();
	const x = await person('m', 'f');
	const y = await person('f', 'm');
	const z = await person('f', 'm');
	await rpcAs(y, 'update_my_profile', '고양이 키워요', ['고양이', '영화'], 'ISTJ');
	const r = await pairRoom(x, y);
	const p = await rpcAs(x, 'partner_profile', r);
	check('같은 방 상대의 기본 정보를 본다', p.bio === '고양이 키워요' && p.mbti === 'ISTJ' && p.interests.length === 2);
	check('상대 이름 = 상대의 고유 익명 이름', p.nickname === (await one('select nickname from public.profiles where id=$1', [y])).nickname);
	check('★ 응답에 uuid 가 없다', !JSON.stringify(p).includes(y) && !JSON.stringify(p).includes(x));
	check('★ 성별·선호·계정 상태는 보여주지 않는다', !('gender' in p) && !('want' in p) && !('status' in p));
	await expectError('★ 제3자는 그 방의 프로필을 볼 수 없다', () => rpcAs(z, 'partner_profile', r), 'not_member');
	await rpcAs(x, 'leave_room', r, false);
	check('대화가 끝난 뒤에도 (신고하려고) 볼 수 있다', (await rpcAs(x, 'partner_profile', r)).bio === '고양이 키워요');
	check(
		'★ 다른 사람의 프로필 행은 직접 읽히지 않는다',
		(await rowsAs(x, 'select bio from public.profiles where id = $1', [y])).length === 0
	);
}

console.log('\n[42] ★ 여러 대화 동시 진행');
{
	await resetPool();
	await db.query('update public.app_settings set max_open_rooms = 2');
	const x = await person('m', 'f');
	const y1 = await person('f', 'm');
	const y2 = await person('f', 'm');
	const y3 = await person('f', 'm');

	await match(y1);
	const a = await match(x);
	check('첫 번째 대화 매칭', a.status === 'matched');
	await rpcAs(x, 'ack_room', a.room_id);
	await rpcAs(y1, 'ack_room', a.room_id);

	await match(y2);
	const b = await match(x);
	check('★ 대화 중에도 새 상대를 찾아 두 번째 대화를 연다', b.status === 'matched' && b.room_id !== a.room_id);
	await rpcAs(x, 'ack_room', b.room_id);

	const list = await rpcAs(x, 'my_rooms');
	check('대화 목록에 두 대화가 모두 있다', list.rooms.length === 2);
	check('★ 대화 목록에 uuid 는 room_id 뿐', ![x, y1, y2].some((u) => JSON.stringify(list).includes(u)));

	await match(y3);
	const c = await match(x);
	check('★ 동시 대화 상한(2)에 닿으면 full — 더 찾지 않는다', c.status === 'full' && c.max === 2);
	check(
		'full 이면 찾기 목록에서 빠진다',
		(await one('select seeking_until from public.user_presence where user_id = $1', [x])).seeking_until === null
	);

	// 상대 쪽 상한도 지킨다
	await db.query('update public.app_settings set max_open_rooms = 1');
	await match(x); // x 는 이미 2개 — full
	const d = await match(y3);
	check('★ 상한이 찬 사람은 다른 사람에게도 잡히지 않는다', d.status === 'waiting');
	await db.query('update public.app_settings set max_open_rooms = 5');

	// 같은 사람과 두 대화는 열리지 않는다 — 재매칭 쿨다운 기록이 없어도
	await resetPool();
	const p = await person('m', 'f');
	const q = await person('f', 'm');
	await match(p);
	const first = await match(q);
	await rpcAs(p, 'ack_room', first.room_id);
	await rpcAs(q, 'ack_room', first.room_id);
	await db.query('delete from public.pair_history'); // 쿨다운이 아니라 '열린 대화' 조건만 본다
	await match(p);
	const second = await match(q);
	check('★ 이미 대화가 열린 상대와는 또 매칭되지 않는다', first.status === 'matched' && second.status === 'waiting', second.status);

	// 안 읽은 메시지 수 (q 가 보낸 것을 p 가 본다)
	const qSeat = (await rpcAs(q, 'room_snapshot', first.room_id)).my_seat;
	await sendIn(q, first.room_id, qSeat, '안녕');
	await sendIn(q, first.room_id, qSeat, '뭐해');
	const pl = (await rpcAs(p, 'my_rooms')).rooms.find((r) => r.room_id === first.room_id);
	check('대화 목록: 안 읽은 메시지 수', pl.unread === 2, JSON.stringify(pl));
	check('대화 목록: 마지막 메시지 미리보기', pl.last_body === '뭐해' && pl.last_seat === qSeat);
	const last = (await one('select max(id)::int m from public.messages where room_id = $1', [first.room_id])).m;
	await rpcAs(p, 'mark_read', first.room_id, last);
	check('읽으면 0', (await rpcAs(p, 'my_rooms')).rooms.find((r) => r.room_id === first.room_id).unread === 0);

	await db.query(`update public.rooms set expires_at = now() - interval '1 second' where id = $1`, [first.room_id]);
	check('시간이 지난 대화는 목록에서 빠진다', !(await rpcAs(p, 'my_rooms')).rooms.some((r) => r.room_id === first.room_id));
}

// ════════════════════════════════════════════════════════════════════
//  Phase 9 — 푸시 알림
// ════════════════════════════════════════════════════════════════════
console.log('\n[43] 푸시 구독');
{
	const u = await person('m', 'f');
	const v = await person('f', 'm');
	const P256 = 'B' + 'x'.repeat(86); // base64url 65바이트 = 87자
	const AUTH = 'a'.repeat(22);
	await rpcAs(u, 'save_push_subscription', 'https://push.example/u1', P256, AUTH);
	check('내 기기를 알림 대상으로 저장', (await cnt('select count(*)::int n from public.push_subscriptions where user_id = $1', [u])) === 1);
	await expectError('https 가 아닌 주소 거절', () => rpcAs(u, 'save_push_subscription', 'http://x', P256, AUTH), 'invalid_subscription');
	await expectError('키 길이가 이상하면 거절', () => rpcAs(u, 'save_push_subscription', 'https://push.example/z', 'short', AUTH), 'invalid_subscription');
	await expectError('★ 구독 목록은 누구도 직접 읽지 못한다 (기기 주소·키)', () => rowsAs(u, 'select * from public.push_subscriptions'), 'permission denied');

	await rpcAs(v, 'save_push_subscription', 'https://push.example/u1', P256, AUTH);
	check(
		'같은 기기에서 다른 계정으로 로그인하면 주인이 바뀐다 (이전 계정 알림이 오지 않게)',
		(await one('select user_id from public.push_subscriptions where endpoint = $1', ['https://push.example/u1'])).user_id === v
	);
	await rpcAs(u, 'delete_push_subscription', 'https://push.example/u1');
	check('★ 남의 구독은 지울 수 없다', (await cnt('select count(*)::int n from public.push_subscriptions where endpoint = $1', ['https://push.example/u1'])) === 1);
	await rpcAs(v, 'delete_push_subscription', 'https://push.example/u1');
	check('내 구독은 지울 수 있다 (알림 끄기·로그아웃)', (await cnt('select count(*)::int n from public.push_subscriptions where endpoint = $1', ['https://push.example/u1'])) === 0);
}

console.log('\n[44] ★ 푸시 발송 판단');
{
	await resetPool();
	const s = await person('m', 'f');
	const t = await person('f', 'm');
	const z = await person('f', 'm');
	const P256 = 'B' + 'x'.repeat(86);
	await rpcAs(t, 'save_push_subscription', 'https://push.example/t1', P256, 'a'.repeat(22));
	const r = await pairRoom(s, t);
	const sSeat = (await rpcAs(s, 'room_snapshot', r)).my_seat;
	await db.query(`update public.user_presence set online_until = now() - interval '1 second' where user_id in ($1,$2)`, [s, t]);
	await sendIn(s, r, sSeat, '자니?');
	const mid = (await one('select max(id)::int m from public.messages where room_id = $1', [r])).m;

	await expectError('★ 학생 계정은 발송 판단 함수를 부를 수 없다', () => rowsAs(s, 'select public.push_payload(1, $1)', [s]), 'permission denied');
	check('★ 보낸 사람이 아니면 발송하지 않는다 (남의 메시지로 알림 위조 불가)', (await svc('push_payload', mid, z)).skip === 'not_sender');
	check('받는 사람 쪽에서 요청해도 발송하지 않는다', (await svc('push_payload', mid, t)).skip === 'not_sender');

	const p = await svc('push_payload', mid, s);
	check('받는 사람 기기로 보낼 내용이 나온다', p.subs?.length === 1 && p.body === '자니?' && p.room_id === r);
	check('제목 = 보낸 사람의 익명 이름', p.title === (await one('select nickname from public.profiles where id = $1', [s])).nickname);
	check('★ 알림 내용에 사용자 uuid 가 없다', ![s, t].some((x) => JSON.stringify({ title: p.title, body: p.body, room_id: p.room_id }).includes(x)));
	check('★ 같은 메시지로 두 번 보내지 않는다', (await svc('push_payload', mid, s)).skip === 'already');

	await rpcAs(t, 'heartbeat', true);
	await sendIn(s, r, sSeat, '아 보고 있구나');
	const mid2 = (await one('select max(id)::int m from public.messages where room_id = $1', [r])).m;
	check('받는 사람이 앱을 보고 있으면 보내지 않는다', (await svc('push_payload', mid2, s)).skip === 'online');

	await rpcAs(t, 'heartbeat', false);
	await sendIn(s, r, sSeat, '긴 메시지 '.repeat(40));
	const mid3 = (await one('select max(id)::int m from public.messages where room_id = $1', [r])).m;
	check('알림 본문은 120자로 자른다', (await svc('push_payload', mid3, s)).body.length === 120);

	await db.query(`update public.messages set created_at = now() - interval '5 minutes' where id = $1`, [mid3]);
	await db.query(`delete from private.push_log where message_id = $1`, [mid3]);
	check('오래된 메시지로는 보내지 않는다', (await svc('push_payload', mid3, s)).skip === 'stale');

	await svc('push_prune', ['https://push.example/t1']);
	await sendIn(s, r, sSeat, '또');
	const mid4 = (await one('select max(id)::int m from public.messages where room_id = $1', [r])).m;
	check('사라진 기기를 지우면 보낼 곳이 없다', (await svc('push_payload', mid4, s)).skip === 'no_device');
	await rpcAs(s, 'leave_room', r, false);
	check('닫힌 대화로는 보내지 않는다', (await svc('push_payload', mid4, s)).skip === 'closed');
}

// ════════════════════════════════════════════════════════════════════
//  Phase 10 — 익명편지
// ════════════════════════════════════════════════════════════════════
const postLetter = (uid, body) => rpcAs(uid, 'post_letter', body);
const postComment = (uid, letter, parent, body) =>
	rpcAs(uid, 'post_comment', letter, parent, body, crypto.randomUUID());
const detail = (uid, letter) => rpcAs(uid, 'letter_detail', letter);
const task = (uid) => rpcAs(uid, 'request_letter_reply_task');
/** 편지 큐를 비운다 — 시나리오끼리 섞이지 않게 */
async function resetLetters() {
	await db.query(`update public.letters set status = 'removed' where status = 'open'`);
	await db.query(`update public.user_presence set letter_tokens = 3, comment_tokens = 10, task_tokens = 6`);
}

console.log('\n[45] ★ 익명편지 — 이름 경계');
{
	await resetLetters();
	const w = await person('m', 'f');
	const r = await person('f', 'm');
	const a = await postLetter(w, '첫 편지');
	const b = await postLetter(w, '두 번째 편지');
	check('편지를 쓰면 작성자 이름이 나온다', a.status === 'ok' && typeof a.alias === 'string');
	// 이름은 편지마다 새로 뽑는다 — 한 사람이 여러 통을 써도 같은 이름이 이어지지 않는다
	const many = [a.alias, b.alias];
	await db.query(`update public.user_presence set letter_tokens = 3, letter_at = now() where user_id = $1`, [w]);
	for (let i = 0; i < 3; i++) many.push((await postLetter(w, `편지 ${i}`)).alias);
	check('★ 같은 사람이 쓴 편지 5통의 이름이 하나로 고정되지 않는다', new Set(many).size >= 3, many.join(','));
	await db.query(`update public.user_presence set letter_tokens = 3 where user_id = $1`, [w]);
	const nick = (await one('select nickname from public.profiles where id = $1', [w])).nickname;
	check('★ 편지 이름은 채팅 고유 이름과 절대 겹치지 않는다 (공백 포함 형식)', a.alias !== nick && a.alias.includes(' ') && !nick.includes(' '));

	const c1 = await postComment(w, a.letter_id, null, '작성자 댓글');
	check('작성자가 자기 편지에 쓰면 작성자 이름 그대로', c1.status === 'ok' && c1.my_alias === a.alias);
	const c2 = await postComment(r, a.letter_id, null, '다른 사람 댓글');
	const c3 = await postComment(r, a.letter_id, null, '한 번 더');
	check('같은 편지 안에서는 같은 사람 = 같은 이름', c2.my_alias === c3.my_alias && c2.my_alias !== a.alias);
	await postComment(r, b.letter_id, null, '다른 편지');
	const onLetterB = await cnt('select count(*)::int n from public.letter_participants where letter_id = $1 and user_id = $2', [b.letter_id, r]);
	check('편지마다 참여자 행이 따로 생긴다', onLetterB === 1);

	const d = await detail(r, a.letter_id);
	const s = JSON.stringify(d);
	check('★ 편지 상세에 어떤 사용자 uuid 도 없다', ![w, r].some((u) => s.includes(u)));
	check('원글쓴이(OP) 표시', d.comments.find((x) => x.id === c1.comment_id)?.is_op === true);
	check('내 댓글 표시 (is_mine)', d.comments.find((x) => x.id === c2.comment_id)?.is_mine === true);
	check('내 이름은 쓴 뒤에만 생긴다 — 구경만 하면 없음', (await detail(await person('f', 'm'), a.letter_id)).my_alias === null);
}

console.log('\n[46] ★ 익명편지 — 공개 읽기, 신원은 막힘');
{
	await resetLetters();
	const w = await person('m', 'f');
	const stranger = await person('f', 'f');
	const a = await postLetter(w, '누구나 읽을 수 있는 편지');
	const feed = await rpcAs(stranger, 'letter_feed', null, null);
	check('상관없는 사람도 피드에서 읽는다', feed.letters.some((x) => x.id === a.letter_id));
	check('★ 피드에 uuid 가 없다', !JSON.stringify(feed).includes(w));
	check('피드: 내 편지 표시는 작성자에게만', feed.letters.find((x) => x.id === a.letter_id).is_mine === false &&
		(await rpcAs(w, 'letter_feed', null, null)).letters.find((x) => x.id === a.letter_id).is_mine === true);
	check('본문 테이블은 직접 읽혀도 된다 (원래 공개용)', (await rowsAs(stranger, 'select id, body from public.letters where id = $1', [a.letter_id])).length === 1);
	check('★ 편지 테이블에 식별 컬럼이 없다',
		!(await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name in ('letters','letter_comments')`))
			.rows.some((c) => /user_id|sender_id|author_id/.test(c.column_name)));
	check('★ 참여자(신원 연결) 테이블은 남의 행이 한 줄도 안 보인다',
		(await rowsAs(stranger, 'select * from public.letter_participants where letter_id = $1', [a.letter_id])).length === 0);
	check('자기 행은 보인다', (await rowsAs(w, 'select alias from public.letter_participants where letter_id = $1', [a.letter_id])).length === 1);
	await expectError('★ 편지를 직접 insert 할 수 없다 (RPC 만)', () => rowsAs(stranger, `insert into public.letters (body) values ('우회')`), 'permission denied');
	await expectError('★ 댓글을 직접 insert 할 수 없다', () =>
		rowsAs(stranger, `insert into public.letter_comments (letter_id, author_no, body, client_comment_id) values ($1, 1, 'x', gen_random_uuid())`, [a.letter_id]), 'permission denied');
	await expectError('★ 재배정 쿨다운 테이블은 누구도 못 읽는다', () => rowsAs(w, 'select * from public.letter_reply_cooldown'), 'permission denied');

	await rpcAs(w, 'delete_my_letter', a.letter_id);
	check('내 편지를 지우면 피드에서 빠진다', !(await rpcAs(stranger, 'letter_feed', null, null)).letters.some((x) => x.id === a.letter_id));
	await expectError('남의 편지는 지울 수 없다', async () => {
		const b = await postLetter(w, '또 하나');
		await rpcAs(stranger, 'delete_my_letter', b.letter_id);
	}, 'not_owner');
}

console.log('\n[47] 익명편지 — 댓글 2단계 제한');
{
	await resetLetters();
	const w = await person('m', 'f');
	const r = await person('f', 'm');
	const a = await postLetter(w, '댓글 깊이 테스트');
	const top = await postComment(r, a.letter_id, null, '최상위');
	const reply = await postComment(w, a.letter_id, top.comment_id, '대댓글');
	check('대댓글 가능', reply.status === 'ok');
	check('★ 대댓글의 대댓글은 거절 (2단계까지)', (await postComment(r, a.letter_id, reply.comment_id, '3단계')).status === 'max_depth_exceeded');
	const b = await postLetter(w, '다른 편지');
	check('다른 편지의 댓글을 부모로 지정하면 거절', (await postComment(r, b.letter_id, top.comment_id, '엉뚱한 부모')).status === 'parent_missing');
	const cid = crypto.randomUUID();
	const first = await rpcAs(r, 'post_comment', a.letter_id, null, '재전송', cid);
	const again = await rpcAs(r, 'post_comment', a.letter_id, null, '재전송', cid);
	check('같은 client id 로 다시 보내면 중복 없이 같은 댓글', again.status === 'duplicate' && again.comment_id === first.comment_id);
	await db.query('update public.app_settings set comment_max_len = 10');
	await expectError('글자 수 제한 (운영 설정)', () => postComment(r, a.letter_id, null, '열 글자를 넘는 댓글입니다'), 'too_long');
	await db.query('update public.app_settings set comment_max_len = 300');

	await rpcAs(r, 'delete_my_comment', top.comment_id);
	const d = await detail(w, a.letter_id);
	const gone = d.comments.find((x) => x.id === top.comment_id);
	check('답글이 달린 댓글을 지우면 자리만 남기고 내용은 가린다', gone?.hidden === 'removed' && gone.body === null && gone.author_alias === null);
	check('그 아래 대댓글은 그대로', d.comments.some((x) => x.id === reply.comment_id && x.body === '대댓글'));
}

console.log('\n[48] ★ 익명편지 — 답장할 편지 받기 (큐)');
{
	await resetLetters();
	const w1 = await person('m', 'f');
	const w2 = await person('m', 'f');
	const r1 = await person('f', 'm');
	const r2 = await person('f', 'm');
	check('편지가 없으면 waiting (empty)', (await task(r1)).status === 'waiting' && (await task(r1)).reason === 'empty');
	const own = await postLetter(r1, '내 편지');
	check('★ 내 편지는 나에게 배정되지 않는다', (await task(r1)).status === 'waiting');
	await rpcAs(r1, 'delete_my_letter', own.letter_id);

	const old = await postLetter(w1, '오래된 편지');
	await db.query(`update public.letters set created_at = now() - interval '1 hour' where id = $1`, [old.letter_id]);
	const fresh = await postLetter(w2, '새 편지');
	const t1 = await task(r1);
	check('배정된다', t1.status === 'assigned');
	check('오래 기다린 편지부터', t1.letter_id === old.letter_id);
	check('다시 눌러도 같은 편지 (반복 폴링 안전)', (await task(r1)).letter_id === old.letter_id);
	const t2 = await task(r2);
	check('★ 두 번째 사람은 다른 편지를 받는다 (한 편지에 답장자 1명)', t2.status === 'assigned' && t2.letter_id === fresh.letter_id);
	check('배정된 편지는 피드에 "내 숙제"로 표시', (await rpcAs(r1, 'letter_feed', null, null)).letters.find((x) => x.id === old.letter_id).assigned_to_me === true);
	check('다른 사람에겐 숙제 표시가 없다', (await rpcAs(r2, 'letter_feed', null, null)).letters.find((x) => x.id === old.letter_id).assigned_to_me === false);

	// 누군가 먼저 댓글을 달아도 답장 숙제는 가로채지 않는다
	await postComment(r2, old.letter_id, null, '지나가던 사람');
	check('★ 지정 답장자가 아닌 사람의 댓글은 "답장 완료"로 치지 않는다',
		(await one('select reply_status from public.letters where id = $1', [old.letter_id])).reply_status === 'assigned');
	const reply = await postComment(r1, old.letter_id, null, '진짜 답장');
	check('지정 답장자의 첫 댓글 = 답장 완료', reply.designated === true &&
		(await one('select reply_status from public.letters where id = $1', [old.letter_id])).reply_status === 'replied');
	check('상세에 지정 답장 표시', (await detail(w1, old.letter_id)).comments.find((x) => x.id === reply.comment_id).is_designated === true);
	check('답장을 마치면 다음 편지를 받을 수 있다', (await task(r1)).status !== 'assigned' || (await task(r1)).letter_id !== old.letter_id);

	// 마감이 지나면 큐로 돌아온다
	await resetLetters();
	const lapse = await postLetter(w1, '방치될 편지');
	const r3 = await person('f', 'm');
	const r4 = await person('f', 'm');
	await task(r3);
	check('맡고 있는 동안에는 다른 사람에게 안 간다', (await task(r4)).status === 'waiting');
	await db.query(`update public.letter_reply_assignments set expires_at = now() - interval '1 second' where letter_id = $1`, [lapse.letter_id]);
	const t4 = await task(r4);
	check('★ 마감이 지나면 다른 사람에게 다시 배정된다', t4.status === 'assigned' && t4.letter_id === lapse.letter_id);
	check('원래 답장자의 숙제는 사라진다', (await rowsAs(r3, 'select * from public.letter_reply_assignments')).length === 0);
}

console.log('\n[49] ★ 익명편지 — 차단은 공유, 쿨다운은 따로');
{
	await resetLetters();
	const w = await person('m', 'f');
	const r = await person('f', 'm');
	await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1,$2)', [w, r]);
	const a = await postLetter(w, '차단 테스트');
	check('★ 채팅에서 차단한 상대에게는 답장 배정이 안 간다', (await task(r)).status === 'waiting');
	check('★ 차단 관계면 피드에서도 안 보인다', !(await rpcAs(r, 'letter_feed', null, null)).letters.some((x) => x.id === a.letter_id));
	check('상세도 볼 수 없다', (await detail(r, a.letter_id)).letter === null);
	check('댓글도 달 수 없다', (await postComment(r, a.letter_id, null, '우회')).status === 'closed');

	await resetLetters();
	const p = await person('m', 'f');
	const q = await person('f', 'm');
	// 편지 쿨다운이 있어도 채팅 매칭은 영향 없음
	await db.query(`insert into public.letter_reply_cooldown (user_lo, user_hi) values (least($1::uuid,$2::uuid), greatest($1::uuid,$2::uuid))`, [p, q]);
	await resetPool();
	await match(p);
	check('★ 편지 쿨다운은 채팅 매칭을 막지 않는다', (await match(q)).status === 'matched');
	// 채팅 재매칭 기록이 있어도 편지 배정은 영향 없음
	await db.query('delete from public.letter_reply_cooldown');
	await db.query(`insert into public.pair_history (user_lo, user_hi) values (least($1::uuid,$2::uuid), greatest($1::uuid,$2::uuid))
	                on conflict do nothing`, [p, q]);
	const b = await postLetter(p, '쿨다운 분리');
	check('★ 채팅 재매칭 기록은 편지 배정을 막지 않는다', (await task(q)).letter_id === b.letter_id);
	await postComment(q, b.letter_id, null, '답장');
	const c = await postLetter(p, '또 편지');
	check('편지 답장 후엔 같은 사람 편지가 7일간 배정되지 않는다', (await task(q)).status === 'waiting');
	void c;
}

console.log('\n[50] 익명편지 — 도배 제한');
{
	await resetLetters();
	const w = await person('m', 'f');
	const got = [];
	for (let i = 0; i < 4; i++) got.push((await postLetter(w, `편지 ${i}`)).status);
	check('편지는 한 번에 3통까지, 4번째는 제한', got.slice(0, 3).every((s) => s === 'ok') && got[3] === 'rate_limited');
	await db.query(`update public.user_presence set letter_at = now() - interval '9 hours' where user_id = $1`, [w]);
	check('시간이 지나면 다시 쓸 수 있다', (await postLetter(w, '다시')).status === 'ok');

	const r = await person('f', 'm');
	const a = await postLetter(await person('m', 'f'), '댓글 도배 대상');
	const cs = [];
	for (let i = 0; i < 11; i++) cs.push((await postComment(r, a.letter_id, null, `댓글 ${i}`)).status);
	check('댓글은 연속 10개까지, 11번째는 제한', cs.slice(0, 10).every((s) => s === 'ok') && cs[10] === 'rate_limited');

	await db.query(`update public.profiles set suspended_until = now() + interval '1 day' where id = $1`, [r]);
	check('정지 중에는 편지를 쓸 수 없다', (await postLetter(r, '정지')).status === 'not_eligible');
	check('정지 중에는 답장 배정도 못 받는다', (await task(r)).status === 'not_eligible');
	await db.query('update public.app_settings set is_open = false');
	check('킬 스위치가 꺼지면 편지도 멈춘다', (await postLetter(w, '닫힘')).status === 'service_closed');
	await db.query('update public.app_settings set is_open = true');
}

console.log('\n[51] ★ 익명편지 — 신고 · 자동 차단 · 자동 정지');
{
	await resetLetters();
	const bad = await person('m', 'f');
	const a = await postLetter(bad, '문제 있는 편지');
	const v1 = await person('f', 'm');
	const r1 = await rpcAs(v1, 'report_letter', a.letter_id, null, 'harassment', '불쾌해요');
	check('편지 신고 (방 구성원이 아니어도 가능)', r1.status === 'ok');
	check('같은 편지를 두 번 신고할 수는 없다', (await rpcAs(v1, 'report_letter', a.letter_id, null, 'spam', '')).status === 'already');
	check('★ 신고하면 자동 차단 → 그 편지가 내 피드에서 사라진다',
		!(await rpcAs(v1, 'letter_feed', null, null)).letters.some((x) => x.id === a.letter_id));
	check('자기 글은 신고할 수 없다', (await rpcAs(bad, 'report_letter', a.letter_id, null, 'spam', '')).status === 'self');

	const other = await postLetter(await person('m', 'f'), '평범한 편지');
	const cm = await postComment(bad, other.letter_id, null, '나쁜 댓글');
	const v2 = await person('f', 'm');
	const r2 = await rpcAs(v2, 'report_letter', other.letter_id, cm.comment_id, 'hate', '');
	check('댓글 신고', r2.status === 'ok');
	const ev = await one(`select count(*)::int n from private.letter_report_evidence e join private.letter_reports r on r.id = e.report_id
	                       where r.comment_id = $1`, [cm.comment_id]);
	check('신고 증거: 편지 본문 + 댓글 사본', ev.n === 2);
	await db.query(`update public.letter_comments set status = 'removed' where id = $1`, [cm.comment_id]);
	check('★ 댓글이 지워져도 증거는 남는다', (await one(`select count(*)::int n from private.letter_report_evidence e
		join private.letter_reports r on r.id = e.report_id where r.comment_id = $1`, [cm.comment_id])).n === 2);

	check('신고 2명 — 아직 정지 아님', (await one('select status from public.profiles where id = $1', [bad])).status === 'active');
	const v3 = await person('f', 'm');
	await rpcAs(v3, 'report_letter', a.letter_id, null, 'sexual', '');
	check('★ 서로 다른 3명이 신고하면 자동 정지', (await one('select status from public.profiles where id = $1', [bad])).status === 'suspended');
	check('정지되면 그 사람 편지는 모두의 피드에서 빠진다',
		!(await rpcAs(await person('f', 'f'), 'letter_feed', null, null)).letters.some((x) => x.id === a.letter_id));
	check('★ 편지 신고 카운터는 채팅 신고와 따로 센다',
		(await cnt('select count(*)::int n from private.reports where reported_id = $1', [bad])) === 0);

	const w = await person('m', 'f');
	const b = await postLetter(w, '차단만');
	const x = await person('f', 'm');
	check('차단만 하기', (await rpcAs(x, 'block_letter_author', b.letter_id, null)).status === 'ok' &&
		(await detail(x, b.letter_id)).letter === null);
}

console.log('\n[52] ★ 익명편지 — 알림 · 운영자');
{
	await resetLetters();
	const w = await person('m', 'f');
	const r = await person('f', 'm');
	const z = await person('f', 'f');
	await db.query(`update public.user_presence set online_until = now() - interval '1 second' where user_id in ($1,$2,$3)`, [w, r, z]);
	await rpcAs(w, 'save_push_subscription', 'https://push.example/w', 'B' + 'x'.repeat(86), 'a'.repeat(22));
	await rpcAs(r, 'save_push_subscription', 'https://push.example/r', 'B' + 'y'.repeat(86), 'b'.repeat(22));
	const a = await postLetter(w, '알림 테스트');
	const c = await postComment(r, a.letter_id, null, '댓글이에요');
	await expectError('★ 학생은 편지 알림 함수를 부를 수 없다', () => rowsAs(r, 'select public.letter_notify(1, $1)', [r]), 'permission denied');
	check('★ 댓글 작성자가 아니면 알림을 못 보낸다', (await svc('letter_notify', c.comment_id, z)).skip === 'not_author');
	const n1 = await svc('letter_notify', c.comment_id, r);
	check('최상위 댓글 → 편지 작성자에게', n1.subs?.[0]?.endpoint === 'https://push.example/w' && n1.url === `/letters/${a.letter_id}`);
	check('★ 알림에 uuid 가 없다', ![w, r].some((u) => JSON.stringify({ t: n1.title, b: n1.body, u: n1.url }).includes(u)));
	check('같은 댓글로 두 번 보내지 않는다', (await svc('letter_notify', c.comment_id, r)).skip === 'already');
	const rep = await postComment(w, a.letter_id, c.comment_id, '고마워요');
	const n2 = await svc('letter_notify', rep.comment_id, w);
	check('대댓글 → 부모 댓글 작성자에게', n2.subs?.[0]?.endpoint === 'https://push.example/r' && n2.title === '내 댓글에 답글');
	const self = await postComment(w, a.letter_id, null, '내 편지에 내가');
	check('내 편지에 내가 쓴 댓글은 알림 없음', (await svc('letter_notify', self.comment_id, w)).skip === 'self');

	const t = await task(z);
	check('답장 배정 (알림 확인용)', t.status === 'assigned');
	const d = await postComment(z, t.letter_id, null, '지정 답장');
	check('지정 답장 → "답장이 도착했어요"', (await svc('letter_notify', d.comment_id, z)).title === '편지에 답장이 도착했어요');

	// 운영자
	for (const fn of ['admin_list_letter_reports()', `admin_letter_report('00000000-0000-0000-0000-000000000000')`]) {
		await expectError(`★ 학생 계정으로 ${fn} 호출 불가`, () => rowsAs(r, `select public.${fn}`), 'permission denied');
	}
	await rpcAs(r, 'report_letter', a.letter_id, null, 'spam', '광고 같아요');
	const list = await svc('admin_list_letter_reports', 'open', 100);
	const item = list.find((x) => x.letter_id === a.letter_id && x.comment_id === null);
	check('운영자 신고 목록에 편지 신고가 뜬다', !!item && item.preview === '알림 테스트');
	const full = await svc('admin_letter_report', item.id);
	check('상세: 증거 + 현재 글 상태', full.evidence.length === 1 && full.target.letter_status === 'open');
	const staff = await person('m', 'f');
	await expectError('★ 운영진이 아니면 글을 내릴 수 없다', () => svc('admin_remove_letter_content', a.letter_id, null, staff, item.id), 'not_staff');
	await expectError('★ 운영진이 아니면 신고를 처리할 수 없다', () => svc('admin_set_letter_report', item.id, 'actioned', '', staff), 'not_staff');
	await db.query(`insert into private.staff (user_id, role) values ($1, 'moderator')`, [staff]);
	await svc('admin_remove_letter_content', a.letter_id, null, staff, item.id);
	check('운영자 삭제 → 피드에서 빠짐', !(await rpcAs(z, 'letter_feed', null, null)).letters.some((x) => x.id === a.letter_id));
	await svc('admin_set_letter_report', item.id, 'actioned', '삭제함', staff);
	const log = await svc('admin_audit', 50);
	check('★ 삭제·처리 모두 활동 기록에 남는다', ['remove_letter', 'letter_report_actioned'].every((x) => log.some((l) => l.action === x)));
	check('대시보드에 편지 수치', typeof (await svc('admin_stats')).open_letter_reports === 'number');
}

// ════════════════════════════════════════════════════════════════════
//  Phase 11 — 관리자 권한 확장
// ════════════════════════════════════════════════════════════════════
const audits = async (action, staff) =>
	cnt('select count(*)::int n from private.audit_log where action = $1 and staff_id = $2', [action, staff]);

console.log('\n[53] ★ 역할 분리 — 운영진 vs 관리자');
{
	const adm = await person('m', 'f');
	const mod = await person('f', 'm');
	const outsider = await person('m', 'f');
	await db.query(`insert into private.staff (user_id, role) values ($1, 'admin'), ($2, 'moderator')`, [adm, mod]);
	const u = await person('m', 'f');

	for (const fn of ['admin_find_users(null, null, null, 10)', `admin_user('${u}', '${u}')`,
		`admin_rooms('all', '${u}', 10)`, `admin_room('${u}', '${u}')`, `admin_letter_post(1, '${u}')`,
		`admin_user_letters('${u}', '${u}')`, `admin_user_rooms('${u}', '${u}')`]) {
		await expectError(`★ 학생 계정으로 ${fn.split('(')[0]} 호출 불가`, () => rowsAs(u, `select public.${fn}`), 'permission denied');
	}
	await expectError('★ 운영진 명단에 없으면 service_role 이라도 거절', () => svc('admin_user', u, outsider), 'not_staff');
	await expectError('★ 명단에 없는 사람 이름으로 제재 불가', () => svc('admin_sanction', u, 'warn', null, outsider, null, ''), 'not_staff');

	check('운영진: 경고 가능', (await svc('admin_sanction', u, 'warn', null, mod, null, '')).strikes >= 1);
	check('운영진: 7일 정지 가능', !!(await svc('admin_sanction', u, 'suspend', 7, mod, null, '')).suspended_until);
	await expectError('★ 운영진: 8일 이상 정지 불가', () => svc('admin_sanction', u, 'suspend', 8, mod, null, ''), 'mod_days_limit');
	await expectError('★ 운영진: 영구 정지 불가', () => svc('admin_sanction', u, 'ban', null, mod, null, ''), 'admin_only');
	await svc('admin_sanction', u, 'ban', null, adm, null, '');
	check('관리자: 영구 정지 가능', (await one('select status from public.profiles where id=$1', [u])).status === 'banned');
	await expectError('★ 운영진: 영구정지 해제 불가', () => svc('admin_sanction', u, 'reinstate', null, mod, null, ''), 'admin_only');
	await expectError('★ 운영진: 다른 운영진 제재 불가', () => svc('admin_sanction', adm, 'warn', null, mod, null, ''), 'admin_only');
	await svc('admin_sanction', u, 'reinstate', null, adm, null, '');
	check('관리자: 해제 가능', (await one('select status from public.profiles where id=$1', [u])).status === 'active');

	await expectError('★ 운영진: 이메일 열람 불가', () => svc('admin_log_identity_view', mod, [u], null), 'admin_only');
	await expectError('★ 운영진: 이메일 검색 불가', () => svc('admin_find_users', '@cnsa', 'all', mod, 10), 'admin_only');
	for (const [fn, args] of [['admin_rooms', ['all', mod, 10]], ['admin_room', [u, mod]], ['admin_user_rooms', [u, mod]],
		['admin_letter_post', [1, mod]], ['admin_user_letters', [u, mod]]]) {
		await expectError(`★ 운영진: ${fn} 불가 (관리자 전용)`, () => svc(fn, ...args), 'admin_only');
	}
	check('운영진: 사용자 상세는 볼 수 있다', (await svc('admin_user', u, mod)).profile.id === u);
}

console.log('\n[54] 사용자 검색 · 상세');
{
	const adm = (await one(`select user_id from private.staff where role = 'admin' order by created_at desc limit 1`)).user_id;
	const u = await person('f', 'm');
	const nick = (await one('select nickname from public.profiles where id = $1', [u])).nickname;
	const byNick = await svc('admin_find_users', nick, 'all', adm, 50);
	check('익명 이름으로 검색', byNick.some((x) => x.id === u));
	check('ID 앞자리로 검색', (await svc('admin_find_users', u.slice(0, 8), 'all', adm, 50)).some((x) => x.id === u));
	check('★ 검색 결과에 이메일이 없다', !JSON.stringify(byNick).includes('@'));
	const before = await audits('search_email', adm);
	const email = await emailOf(u);
	check('관리자: 이메일로 검색', (await svc('admin_find_users', email, 'all', adm, 50)).some((x) => x.id === u));
	check('★ 이메일 검색은 기록된다', (await audits('search_email', adm)) === before + 1);
	check('필터: 운영진', (await svc('admin_find_users', '', 'staff', adm, 200)).every((x) => x.staff_role));
	await svc('admin_sanction', u, 'suspend', 2, adm, null, '테스트');
	check('필터: 이용 제한', (await svc('admin_find_users', '', 'restricted', adm, 200)).some((x) => x.id === u));

	const d = await svc('admin_user', u, adm);
	check('상세: 프로필 · 활동 수 · 제재 이력', d.profile.nickname === nick && typeof d.counts.rooms === 'number' &&
		d.history.some((h) => h.action === 'sanction_suspend'));
	check('★ 상세에 이메일이 없다', !JSON.stringify(d).includes('@'));
	check('없는 사용자는 null', (await svc('admin_user', '00000000-0000-0000-0000-000000000000', adm)) === null);
}

console.log('\n[55] ★ 관리자 열람 — 대화 · 편지 작성자 (전부 기록)');
{
	const adm = (await one(`select user_id from private.staff where role = 'admin' order by created_at desc limit 1`)).user_id;
	const x = await person('m', 'f');
	const y = await person('f', 'm');
	const r = await pairRoom(x, y);
	await sendIn(x, r, 1, '안녕');
	await sendIn(y, r, 2, '반가워');

	const list = await svc('admin_rooms', 'live', adm, 300);
	const item = list.find((z) => z.id === r);
	check('진행 중 대화 목록', !!item && item.live === true && item.message_count === 2);
	check('목록에는 두 사람 계정이 나온다', item.members.map((m) => m.user_id).sort().join() === [x, y].sort().join());
	const mine = await svc('admin_user_rooms', x, adm);
	check('한 사람의 대화 목록 + 상대', mine.some((z) => z.id === r && z.partner_id === y));

	const before = await audits('view_room', adm);
	const room = await svc('admin_room', r, adm);
	check('대화 내용 열람', room.messages.filter((m) => m.seat > 0).map((m) => m.body).join() === '안녕,반가워');
	check('누가 어느 자리인지', room.members.find((m) => m.seat === 1).user_id === x);
	check('★ 대화 열람은 열 때마다 기록된다', (await audits('view_room', adm)) === before + 1);

	await resetLetters();
	const a = await postLetter(x, '관리자 확인용 편지');
	const c = await postComment(y, a.letter_id, null, '댓글');
	await rpcAs(x, 'delete_my_comment', (await postComment(x, a.letter_id, null, '지울 댓글')).comment_id);
	const post = await svc('admin_letter_post', a.letter_id, adm);
	check('편지 작성자 확인', post.participants.find((p) => p.is_author).user_id === x);
	const cy = post.comments.find((z) => z.id === c.comment_id);
	check('댓글 작성자 확인 (author_no → 계정)', post.participants.find((p) => p.no === cy.author_no).user_id === y);
	check('지운 댓글도 운영자에게는 보인다', post.comments.some((z) => z.status === 'removed'));
	check('★ 편지 작성자 확인은 기록된다', (await audits('view_letter_authors', adm)) >= 1);
	const ul = await svc('admin_user_letters', y, adm);
	check('한 사람이 쓴 편지·댓글', ul.some((z) => z.letter_id === a.letter_id && !z.is_author && z.my_comments === 1));
	check('★ 활동 열람도 기록된다', (await audits('view_user_letters', adm)) >= 1);

	// 학생 쪽 경계는 그대로
	const yd = JSON.stringify(await detail(y, a.letter_id));
	check('★ 학생 화면에는 여전히 uuid 가 없다', !yd.includes(x) && !yd.includes(y));
}

console.log('\n[56] ★ 학번-이름 명렬표 — 이메일 확인 옆 이름 표시');
{
	const adm = (await one(`select user_id from private.staff where role = 'admin' order by created_at desc limit 1`)).user_id;
	const mod = (await one(`select user_id from private.staff where role = 'moderator' order by created_at desc limit 1`)).user_id;
	const u = await signUp('10101@cnsa.hs.kr', true);

	await expectError('★ 학생 계정으로 admin_roster_import 호출 불가', () => rowsAs(u, `select public.admin_roster_import(1::smallint, '[]'::jsonb)`), 'permission denied');
	await expectError('★ 학생 계정으로 admin_roster_name 호출 불가', () => rowsAs(u, `select public.admin_roster_name('${u}', '10101@cnsa.hs.kr')`), 'permission denied');

	const n = await svc('admin_roster_import', 1, JSON.stringify([{ no: 10101, name: '테스트생' }, { no: 10102, name: '둘째' }]));
	check('명렬표 반영 개수', n === 2);
	check('명렬표 반영은 활동 기록에 남는다 (staff_id 없이)', (await cnt(`select count(*)::int n from private.audit_log where action = 'roster_import'`)) >= 1);

	check('이메일 앞자리(학번)로 이름 찾기', (await svc('admin_roster_name', adm, '10101@cnsa.hs.kr')) === '테스트생');
	check('명단에 없는 학번은 null', (await svc('admin_roster_name', adm, '99999@cnsa.hs.kr')) === null);
	check('학번 형태가 아닌 이메일도 null (에러 아님)', (await svc('admin_roster_name', adm, 'p1-m@cnsa.hs.kr')) === null);
	check('이메일이 없어도(탈퇴 등) null', (await svc('admin_roster_name', adm, null)) === null);
	await expectError('★ 운영진은 이름 조회 불가 (관리자 전용)', () => svc('admin_roster_name', mod, '10101@cnsa.hs.kr'), 'admin_only');

	check('같은 학번 재반입 → 이름 갱신', (await svc('admin_roster_import', 1, JSON.stringify([{ no: 10101, name: '정정된이름' }]))) === 1);
	check('갱신된 이름이 바로 반영된다', (await svc('admin_roster_name', adm, '10101@cnsa.hs.kr')) === '정정된이름');
	check('학번이 너무 길어도 오류 없이 null', (await svc('admin_roster_name', adm, '12345678901234@cnsa.hs.kr')) === null);

	// 운영자 화면의 익명 이름 옆 "(학번 이름)"
	const noName = await signUp('20999@cnsa.hs.kr', true); // 명단에 없는 학번
	const plain = await person('m', 'f'); // 학번 형태가 아닌 이메일
	await expectError('★ 학생 계정으로 admin_student_labels 호출 불가',
		() => rowsAs(u, `select public.admin_student_labels('${u}', array['${u}']::uuid[])`), 'permission denied');
	await expectError('★ 운영진은 학번·이름 목록 불가 (관리자 전용)', () => svc('admin_student_labels', mod, [u]), 'admin_only');
	const before = await audits('view_identity', adm);
	const labels = await svc('admin_student_labels', adm, [u, noName, plain]);
	check('학번 + 이름', labels[u] === '10101 정정된이름', JSON.stringify(labels));
	check('명단에 없는 학번은 학번만', labels[noName] === '20999', JSON.stringify(labels));
	check('학번 형태가 아닌 이메일은 빠진다', !(plain in labels));
	check('★ 학번·이름 목록도 활동 기록에 남는다', (await audits('view_identity', adm)) === before + 1);
	check('빈 목록은 기록 없이 빈 객체', JSON.stringify(await svc('admin_student_labels', adm, [])) === '{}' &&
		(await audits('view_identity', adm)) === before + 1);
}

console.log('\n[57] 실시간 현황 — 접속 중 · 매칭 대기 · 대화 중 · 오프라인');
{
	const adm = (await one(`select user_id from private.staff where role = 'admin' order by created_at desc limit 1`)).user_id;
	const mod = (await one(`select user_id from private.staff where role = 'moderator' order by created_at desc limit 1`)).user_id;
	await resetPool();
	const off = await person('m', 'f');
	const on = await person('f', 'm');
	const seek = await person('m', 'f');
	const c1 = await person('m', 'f');
	const c2 = await person('f', 'm');
	await db.query(`update public.user_presence set online_until = now() - interval '5 minutes' where user_id = $1`, [off]);
	await db.query(`insert into public.user_presence (user_id, online_until) values ($1, now() + interval '1 minute')
	                on conflict (user_id) do update set online_until = excluded.online_until`, [on]);
	await db.query(`insert into public.user_presence (user_id, online_until, seeking_until, seeking_since)
	                values ($1, now() + interval '1 minute', now() + interval '1 minute', now())
	                on conflict (user_id) do update set online_until = excluded.online_until,
	                  seeking_until = excluded.seeking_until, seeking_since = excluded.seeking_since`, [seek]);
	const room = await pairRoom(c1, c2);

	await expectError('★ 학생 계정으로 admin_live_users 호출 불가', () => rowsAs(off, `select public.admin_live_users('${off}')`), 'permission denied');
	await expectError('★ 운영진 명단에 없으면 거절', () => svc('admin_live_users', off), 'not_staff');

	const list = await svc('admin_live_users', adm);
	const by = (id) => list.find((x) => x.id === id);
	check('전체 사용자가 나온다', [off, on, seek, c1, c2].every((id) => by(id)));
	check('오프라인: online=false, 마지막 접속 시각 있음', by(off).online === false && !!by(off).last_seen && by(off).room_count === 0);
	check('접속 중', by(on).online === true && !by(on).seeking && by(on).room_count === 0);
	check('매칭 대기', by(seek).seeking === true);
	check('대화 중: 살아 있는 방 1개 + 관리자에게는 방 id', by(c1).room_count === 1 && by(c1).rooms?.[0] === room);
	check('★ 이메일은 들어 있지 않다', !JSON.stringify(list).includes('@'));

	const ml = await svc('admin_live_users', mod);
	const mc1 = ml.find((x) => x.id === c1);
	check('★ 운영진: 대화 중 개수는 보이지만 어느 방인지는 없다', mc1.room_count === 1 && mc1.rooms === null);

	await db.query(`update public.rooms set status = 'closed', closed_at = now() where id = $1`, [room]);
	await db.query(`update public.room_members set open = false where room_id = $1`, [room]);
	check('방이 닫히면 대화 중이 아니다', (await svc('admin_live_users', adm)).find((x) => x.id === c1).room_count === 0);
}

console.log('\n[58] ★ 편지 서식 — 정해진 종류·색·범위만');
{
	await resetLetters();
	const w = await person('m', 'f');
	const reader = await person('f', 'm');
	const refill = () => db.query(`update public.user_presence set letter_tokens = 3 where user_id = $1`, [w]);
	const post = (body, fmt) => rpcAs(w, 'post_letter', body, fmt === undefined ? null : JSON.stringify(fmt));

	const fmt = { m: [[0, 5, 'b'], [0, 5, 'h:yellow'], [6, 11, 'u'], [6, 11, 's'], [6, 11, 'c:blue'], [6, 11, 'z:lg']], a: [[1, 'center']] };
	const ok = await post('hello\nworld', fmt);
	check('서식 있는 편지 올리기', ok.status === 'ok', JSON.stringify(ok));
	const d = await detail(reader, ok.letter_id);
	const same = (f) => !!f && JSON.stringify(f.m) === JSON.stringify(fmt.m) && JSON.stringify(f.a) === JSON.stringify(fmt.a);
	check('상세에 서식이 그대로', same(d.letter.fmt), JSON.stringify(d.letter.fmt));
	const feedItem = (await rpcAs(reader, 'letter_feed', null, null)).letters.find((x) => x.id === ok.letter_id);
	check('피드에도 서식', same(feedItem?.fmt), JSON.stringify(feedItem));
	check('본문은 순수 텍스트 그대로', d.letter.body === 'hello\nworld');

	await refill();
	const plain = await postLetter(w, '서식 없는 편지');
	check('서식 없이(옛 방식 한 인자)도 올라간다', plain.status === 'ok' && (await detail(reader, plain.letter_id)).letter.fmt === null);
	const empty = await post('빈 서식', {});
	check('빈 서식 {} 는 null 로 저장', empty.status === 'ok' && (await detail(reader, empty.letter_id)).letter.fmt === null);

	await refill();
	const emoji = await post('😀ab', { m: [[1, 3, 'b']] });
	check('위치는 글자(code point) 단위 — 이모지도 한 글자', emoji.status === 'ok', JSON.stringify(emoji));

	const bad = [
		['모르는 종류', { m: [[0, 1, 'x']] }],
		['목록에 없는 형광펜 색', { m: [[0, 1, 'h:red']] }],
		['★ 색 대신 CSS 값 끼워 넣기', { m: [[0, 1, 'c:red;background:url(//evil)']] }],
		['★ 크기 대신 임의 값', { m: [[0, 1, 'z:999px']] }],
		['본문보다 긴 범위', { m: [[0, 99, 'b']] }],
		['시작 >= 끝', { m: [[3, 3, 'b']] }],
		['음수 위치', { m: [[-1, 2, 'b']] }],
		['소수 위치', { m: [[0.5, 2, 'b']] }],
		['문자열 위치', { m: [['0', '2', 'b']] }],
		['원소 개수가 틀림', { m: [[0, 2]] }],
		['모르는 최상위 키', { m: [], x: 1 }],
		['없는 줄 정렬', { a: [[5, 'center']] }],
		['정렬 값이 목록에 없음', { a: [[0, 'justify']] }],
		['서식이 배열', [[0, 1, 'b']]],
		['범위가 너무 많음', { m: Array.from({ length: 501 }, () => [0, 1, 'b']) }]
	];
	for (const [name, f] of bad) await expectError(`★ 거절: ${name}`, () => post('hello\nworld', f), 'bad_format');
	await expectError('★ 거절: 앞뒤 공백이 잘리면 위치가 어긋나므로', () => post('  hello', { m: [[0, 2, 'b']] }), 'bad_format');
	check('거절된 시도는 편지 한도를 쓰지 않는다',
		(await one('select letter_tokens from public.user_presence where user_id = $1', [w])).letter_tokens >= 1);
}

console.log('\n[60] ★ 운영자 RPC 역할 점검 — DB 에서도 막는다');
{
	const adm = (await one(`select user_id from private.staff where role = 'admin' order by created_at desc limit 1`)).user_id;
	const mod = (await one(`select user_id from private.staff where role = 'moderator' order by created_at desc limit 1`)).user_id;
	const outsider = await person('m', 'f');

	await expectError('★ 운영진: 운영 수치 변경 불가', () => svc('admin_update_settings', JSON.stringify({ room_minutes: 12 }), mod), 'admin_only');
	await expectError('★ 운영진: 공지 변경 불가', () => svc('admin_update_settings', JSON.stringify({ notice: 'x' }), mod), 'admin_only');
	check('운영진: 서비스 열고 닫기는 가능', (await svc('admin_update_settings', JSON.stringify({ is_open: false }), mod)).is_open === false);
	await svc('admin_update_settings', JSON.stringify({ is_open: true }), mod);
	await expectError('★ 명단에 없으면 설정 변경 불가', () => svc('admin_update_settings', JSON.stringify({ is_open: false }), outsider), 'not_staff');
	check('관리자: 운영 수치 변경 가능', (await svc('admin_update_settings', JSON.stringify({ room_minutes: 10 }), adm)).room_minutes === 10);

	const rep = (await one(`select id from private.reports order by created_at desc limit 1`))?.id;
	if (rep) await expectError('★ 명단에 없으면 채팅 신고 처리 불가', () => svc('admin_set_report', rep, 'reviewing', '', outsider), 'not_staff');

	const gone = await person('f', 'm');
	await db.query(`delete from public.profiles where id = $1`, [gone]);
	await expectError('탈퇴한 계정 제재는 "조치 완료"가 아니라 오류', () => svc('admin_sanction', gone, 'warn', null, adm, null, ''), 'user_not_found');
}

console.log('\n[59] ★ 편지 하트 — 개수만 공개, 누가 눌렀는지는 비공개');
{
	await resetLetters();
	const w = await person('m', 'f');
	const x = await person('f', 'm');
	const y = await person('m', 'f');
	const like = (uid, letter, on) => rpcAs(uid, 'set_letter_like', letter, on);
	const a = await postLetter(w, '하트 테스트 편지');

	const r1 = await like(x, a.letter_id, true);
	check('하트 누르기', r1.status === 'ok' && r1.liked === true && r1.like_count === 1, JSON.stringify(r1));
	check('다시 눌러도(재전송) 그대로 1', (await like(x, a.letter_id, true)).like_count === 1);
	check('다른 사람이 누르면 2', (await like(y, a.letter_id, true)).like_count === 2);
	check('내 편지에도 누를 수 있다', (await like(w, a.letter_id, true)).like_count === 3);

	const dx = await detail(x, a.letter_id);
	check('상세: 개수 + 내가 눌렀는지', dx.letter.like_count === 3 && dx.letter.liked === true);
	const fz = (await rpcAs(await person('f', 'm'), 'letter_feed', null, null)).letters.find((l) => l.id === a.letter_id);
	check('피드: 안 누른 사람에게는 liked=false', fz.like_count === 3 && fz.liked === false);
	check('★ 피드·상세 어디에도 누른 사람의 uuid 가 없다',
		![x, y, w].some((id) => JSON.stringify(dx).includes(id) || JSON.stringify(fz).includes(id)));

	const r2 = await like(x, a.letter_id, false);
	check('하트 취소', r2.liked === false && r2.like_count === 2, JSON.stringify(r2));
	check('취소를 또 해도 그대로', (await like(x, a.letter_id, false)).like_count === 2);

	await expectError('★ 학생은 하트 표를 직접 못 읽는다', () => rowsAs(x, 'select * from private.letter_likes'), 'permission denied');
	await expectError('★ 학생은 하트 표에 직접 못 쓴다',
		() => rowsAs(x, `insert into private.letter_likes (letter_id, user_id) values ($1, $2)`, [a.letter_id, y]), 'permission denied');

	await rpcAs(y, 'block_letter_author', a.letter_id, null);
	check('차단한 사람의 편지에는 못 누른다', (await like(y, a.letter_id, true)).status === 'closed');
	const b = await postLetter(x, '지울 편지');
	await rpcAs(x, 'delete_my_letter', b.letter_id);
	check('지워진 편지에는 못 누른다', (await like(w, b.letter_id, true)).status === 'closed');
	const sus = await person('m', 'f');
	await db.query(`update public.profiles set suspended_until = now() + interval '1 day' where id = $1`, [sus]);
	check('정지된 계정은 못 누른다', (await like(sus, a.letter_id, true)).status === 'not_eligible');
}

console.log('\n[61] ★ 공지사항 — 관리자만 올리고, 학생은 어디까지 봤는지 계정에 남는다');
{
	const adm = (await one(`select user_id from private.staff where role = 'admin' order by created_at desc limit 1`)).user_id;
	const mod = (await one(`select user_id from private.staff where role = 'moderator' order by created_at desc limit 1`)).user_id;
	const st = await person('m', 'f');
	const st2 = await person('f', 'm');

	const empty = await rpcAs(st, 'my_notices');
	check('처음: 공지 없음 · 본 번호 0', empty.notices.length === 0 && Number(empty.last_seen) === 0, JSON.stringify(empty));
	check('없는데 봤다고 해도 0', Number(await rpcAs(st, 'mark_notices_seen', 999)) === 0);

	await expectError('★ 운영진은 공지를 못 올린다', () => svc('admin_post_notice', mod, '제목', ''), 'admin_only');
	await expectError('★ 명단 밖은 공지를 못 올린다', () => svc('admin_post_notice', st, '제목', ''), 'not_staff');
	await expectError('빈 제목은 안 된다', () => svc('admin_post_notice', adm, '   ', ''), 'check');
	const n1 = Number(await svc('admin_post_notice', adm, ' 첫 공지 ', '내용 1'));
	const n2 = Number(await svc('admin_post_notice', adm, '둘째 공지', ''));
	check('운영진도 목록은 본다', (await svc('admin_notices', mod)).length === 2);

	const a = await rpcAs(st, 'my_notices');
	check('학생: 최신순 · 제목 앞뒤 공백 정리', a.notices.map((n) => Number(n.id)).join() === `${n2},${n1}` && a.notices[1].title === '첫 공지');
	check('★ 학생에게 올린 사람 uuid 는 안 보인다', !JSON.stringify(a).includes(adm));
	check('아직 안 봤다 (빨간 점)', Number(a.last_seen) < n2);

	check('봤다 → 최신 번호까지', Number(await rpcAs(st, 'mark_notices_seen', n2)) === n2);
	check('뒤로 가지 않는다', Number(await rpcAs(st, 'mark_notices_seen', n1)) === n2);
	check('없는 번호로 앞질러 가지 않는다', Number(await rpcAs(st, 'mark_notices_seen', n2 + 100)) === n2);
	check('다른 학생은 따로', Number((await rpcAs(st2, 'my_notices')).last_seen) === 0);

	const n3 = Number(await svc('admin_post_notice', adm, '셋째 공지', '새 소식'));
	const b = await rpcAs(st, 'my_notices');
	check('새 공지가 오면 다시 빨간 점', Number(b.notices[0].id) === n3 && Number(b.last_seen) === n2);

	await svc('admin_remove_notice', adm, n3);
	check('내린 공지는 학생에게 안 보인다', !(await rpcAs(st, 'my_notices')).notices.some((n) => Number(n.id) === n3));
	await expectError('이미 내린 공지는 다시 못 내린다', () => svc('admin_remove_notice', adm, n3), 'notice_not_found');
	await expectError('★ 운영진은 공지를 못 내린다', () => svc('admin_remove_notice', mod, n2), 'admin_only');
	const log = (await db.query(`select action, detail from private.audit_log where action in ('post_notice', 'remove_notice') order by id`)).rows;
	check('올리고 내린 것이 활동 기록에', log.filter((l) => l.action === 'post_notice').length === 3 && log.some((l) => l.action === 'remove_notice' && l.detail.title === '셋째 공지'));

	await expectError('★ 학생은 공지 표를 직접 못 읽는다', () => rowsAs(st, 'select * from private.notices'), 'permission denied');
	await expectError('★ 학생은 공지를 직접 못 올린다', () => rpcAs(st, 'admin_post_notice', st, 'x', ''), 'permission denied');
	await expectError('로그인 없이 공지 목록 불가', () => rpcAs(null, 'my_notices'), 'permission denied');
}

console.log('\n[62] ★ 메시지 공감 — 자리(seat)로만, 대화 중에만, 같은 방 두 사람만');
{
	const r = await fresh();
	const seatA = Number(await rpcAs(A, 'my_seat', r));
	const seatB = Number(await rpcAs(B, 'my_seat', r));
	const say = async (uid, room, seat, body) =>
		(await rowsAs(uid, `insert into public.messages (room_id, sender_seat, body, client_msg_id)
		                    values ($1, $2, $3, gen_random_uuid()) returning id`, [room, seat, body]))[0].id;
	const m1 = await say(A, r, seatA, '안녕');
	const react = (uid, msg, emoji) => rpcAs(uid, 'react_message', msg, emoji);
	const rows = (uid) => rowsAs(uid, `select message_id, seat, emoji from public.message_reactions where room_id = $1 and emoji is not null order by seat`, [r]);

	const a = await react(B, m1, 'heart');
	check('상대 메시지에 공감', a.status === 'ok' && Number(a.seat) === seatB && a.emoji === 'heart', JSON.stringify(a));
	check('내 메시지에도 공감할 수 있다', (await react(A, m1, 'laugh')).status === 'ok');
	const seen = await rows(A);
	check('두 사람 모두 보인다 (자리마다 하나)', seen.length === 2 && seen.map((x) => x.emoji).join() === (seatA < seatB ? 'laugh,heart' : 'heart,laugh'), JSON.stringify(seen));
	check('★ 공감 표에 사용자 식별자 없음 (자리만)',
		(await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'message_reactions'`)).rows
			.every((c) => !/user|profile|email/.test(c.column_name)));

	check('다른 공감으로 바꾸기', (await react(B, m1, 'fire')).emoji === 'fire' && (await rows(B)).find((x) => Number(x.seat) === seatB).emoji === 'fire');
	check('취소 (null)', (await react(B, m1, null)).status === 'ok' && !(await rows(A)).some((x) => Number(x.seat) === seatB));
	check('없는 공감 종류는 거절', (await react(B, m1, 'angry')).status === 'bad_emoji');
	await expectError('DB 에서도 정해진 종류만', () => db.query(`insert into public.message_reactions (message_id, room_id, seat, emoji) values ($1, $2, 1, 'poop')`, [m1, r]), 'check');

	const sys = (await one(`insert into public.messages (room_id, sender_seat, body, client_msg_id) values ($1, 0, '안내', gen_random_uuid()) returning id`, [r])).id;
	check('시스템 안내에는 공감 불가', (await react(A, sys, 'heart')).status === 'system');

	const outsider = await person('m', 'f');
	check('★ 다른 방 사람은 공감 불가 (있는지도 모름)', (await react(outsider, m1, 'heart')).status === 'not_found');
	check('★ 다른 방 사람에게는 공감이 안 보인다',
		(await rowsAs(outsider, `select * from public.message_reactions where room_id = $1`, [r])).length === 0);
	check('없는 메시지', (await react(A, 99999999, 'heart')).status === 'not_found');
	await expectError('★ 학생이 표에 직접 쓰기 불가',
		() => rowsAs(A, `insert into public.message_reactions (message_id, room_id, seat, emoji) values ($1, $2, $3, 'heart')`, [m1, r, seatA]), 'permission denied');
	await expectError('★ 상대 자리로 위조 불가 (직접 수정 불가)',
		() => rowsAs(A, `update public.message_reactions set emoji = 'sad' where message_id = $1`, [m1]), 'permission denied');

	await setExpiry(r, -1);
	check('★ 시간이 끝난 방에는 공감 불가', (await react(B, m1, 'heart')).status === 'closed');
	await db.query(`update public.rooms set status = 'closed', closed_at = now() where id = $1`, [r]);
	check('닫힌 방의 공감은 안 보인다 (메시지처럼)', (await rows(A)).length === 0);
	await db.query(`delete from public.messages where id = $1`, [m1]);
	check('메시지가 지워지면 공감도 같이', (await one(`select count(*)::int n from public.message_reactions where message_id = $1`, [m1])).n === 0);

	const r2 = await fresh();
	const m2 = await say(A, r2, Number(await rpcAs(A, 'my_seat', r2)), '관리자 열람용');
	await react(B, m2, 'wow');
	const adm = (await one(`select user_id from private.staff where role = 'admin' order by created_at desc limit 1`)).user_id;
	const view = await svc('admin_room', r2, adm);
	const vm = view.messages.find((m) => Number(m.id) === Number(m2));
	check('관리자 대화 열람에 공감 표시 (자리별)', vm?.reactions?.[String(seatB)] === 'wow', JSON.stringify(vm));
}

console.log('\n[63] ★ 공감 푸시 — 상대 메시지에, 한 번만, 앱을 안 보고 있을 때만');
{
	const r = await fresh();
	const seatA = Number(await rpcAs(A, 'my_seat', r));
	const seatB = Number(await rpcAs(B, 'my_seat', r));
	const say = async (uid, seat, body) =>
		(await rowsAs(uid, `insert into public.messages (room_id, sender_seat, body, client_msg_id)
		                    values ($1, $2, $3, gen_random_uuid()) returning id`, [r, seat, body]))[0].id;
	const mA = await say(A, seatA, '실리카겔 좋아하세요?');
	await db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/a', 'k', 'x')
	                on conflict do nothing`, [A]);
	await db.query(`update public.user_presence set online_until = now() - interval '1 minute' where user_id = $1`, [A]);
	const pay = (actor, msg) => svc('reaction_push_payload', msg, actor);

	check('공감 전에는 보낼 것 없음', (await pay(B, mA)).skip === 'no_reaction');
	await rpcAs(B, 'react_message', mA, 'heart');
	const p = await pay(B, mA);
	const aliasB = (await rpcAs(A, 'room_snapshot', r)).partner_alias;
	check('상대 메시지에 공감 → A 의 기기로 알림', p.subs?.length === 1 && p.subs[0].endpoint === 'https://push.example/a', JSON.stringify(p));
	check('제목 = 공감한 사람의 방 안 이름, 본문 = 공감 + 메시지', p.title === aliasB && p.body === '❤️ 공감: 실리카겔 좋아하세요?' && p.room_id === r, JSON.stringify(p));
	check('★ 알림에 uuid 없음', ![A, B].some((u) => JSON.stringify({ ...p, subs: [] }).includes(u)));
	check('같은 공감을 또 요청해도 한 번만', (await pay(B, mA)).skip === 'already');
	await rpcAs(B, 'react_message', mA, 'laugh');
	check('★ 공감을 바꿔도 다시 울리지 않는다 (알림 폭탄 방지)', (await pay(B, mA)).skip === 'already');

	const mB = await say(B, seatB, '내 메시지');
	await rpcAs(B, 'react_message', mB, 'fire');
	check('내 메시지에 단 공감은 알림 없음', (await pay(B, mB)).skip === 'own_message');
	check('★ 다른 사람이 대신 요청할 수 없다', (await pay(await person('m', 'f'), mA)).skip === 'not_member');

	const mA2 = await say(A, seatA, '두 번째');
	await rpcAs(B, 'react_message', mA2, 'wow');
	await db.query(`update public.user_presence set online_until = now() + interval '1 minute' where user_id = $1`, [A]);
	check('받는 사람이 앱을 보고 있으면 보내지 않는다', (await pay(B, mA2)).skip === 'online');
	await expectError('★ 학생은 직접 부를 수 없다', () => rpcAs(B, 'reaction_push_payload', mA, B), 'permission denied');
}

console.log('\n[64] ★ 메시지 답장 — 같은 방의 사람 메시지만, 보낸 뒤 못 바꾼다');
{
	const r = await fresh();
	const seatA = Number(await rpcAs(A, 'my_seat', r));
	const seatB = Number(await rpcAs(B, 'my_seat', r));
	const say = async (uid, room, seat, body, replyTo = null) =>
		(await rowsAs(uid, `insert into public.messages (room_id, sender_seat, body, client_msg_id, reply_to)
		                    values ($1, $2, $3, gen_random_uuid(), $4) returning id, reply_to`, [room, seat, body, replyTo]))[0];
	const m1 = await say(A, r, seatA, '실리카겔 좋아하세요?');
	const m2 = await say(B, r, seatB, '네 완전요!', m1.id);
	check('답장 저장 · 상대도 읽힘', Number(m2.reply_to) === Number(m1.id) &&
		Number((await rowsAs(A, `select reply_to from public.messages where id = $1`, [m2.id]))[0].reply_to) === Number(m1.id));
	check('내 메시지에도 답장 가능', Number((await say(A, r, seatA, '저도요', m2.id)).reply_to) === Number(m2.id));
	const sys = (await one(`select id from public.messages where room_id = $1 and sender_seat = 0 order by id limit 1`, [r])).id;
	await expectError('시스템 안내에는 답장 불가', () => say(B, r, seatB, 'x', sys), 'bad_reply');
	await expectError('없는 메시지 번호', () => say(B, r, seatB, 'x', 99999999), 'bad_reply');
	const other = await fresh();   // A·B 의 이전 방은 닫힌다 — 다른 방 메시지는 트리거가 먼저 막는지 본다
	const oA = Number(await rpcAs(A, 'my_seat', other));
	const oB = Number(await rpcAs(B, 'my_seat', other));
	const o1 = await say(A, other, oA, '다른 방');
	await expectError('★ 다른 방 메시지 번호로 답장 불가 (내용 엿보기 방지)', () => say(B, other, oB, 'x', m1.id), 'bad_reply');
	await expectError('★ 보낸 뒤 답장 대상을 바꿀 수 없다', () => rowsAs(A, `update public.messages set reply_to = null where id = $1`, [o1.id]), 'permission denied');
	const adm = (await one(`select user_id from private.staff where role = 'admin' order by created_at desc limit 1`)).user_id;
	const reply = await say(B, other, oB, '답장', o1.id);
	const view = await svc('admin_room', other, adm);
	check('관리자 대화 열람에 답장 대상', Number(view.messages.find((m) => Number(m.id) === Number(reply.id))?.reply_to) === Number(o1.id));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
