-- ════════════════════════════════════════════════════════════════════
--  CNSATINDER — 교내 익명 대화 앱 스키마
--  Supabase SQL Editor 에 통째로 붙여넣어 실행. 여러 번 실행해도 안전(idempotent).
--
--  제1원칙: 익명성을 규율이 아니라 구조로 보장한다.
--    · messages 에 식별 컬럼을 두지 않는다 (sender_seat 만)
--    · room_members 는 '내 행만' 읽힌다
--    · private 스키마는 PostgREST 에 노출하지 않는다 (URL 자체가 없음)
--    · 실명·학번을 수집하지 않는다 (이메일은 auth.users 에만 존재)
-- ════════════════════════════════════════════════════════════════════

-- ── 0. 스키마 ───────────────────────────────────────────────────────
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- ★ Dashboard > Settings > API > Exposed schemas 에 private 를 넣지 말 것.


-- ── 1. 운영 파라미터 (단일 행) ──────────────────────────────────────
-- 코드 배포 없이 학생회가 조정한다.
create table if not exists public.app_settings (
  id                    boolean  primary key default true check (id),
  is_open               boolean  not null default true,      -- 킬 스위치
  notice                text     not null default '',
  room_minutes          int      not null default 10 check (room_minutes between 1 and 60),
  extend_minutes        int      not null default 10 check (extend_minutes between 1 and 60),
  vote_window_sec       int      not null default 90,        -- 만료 N초 전부터 연장 투표 가능
  join_grace_sec        int      not null default 60,        -- 양쪽 입장 대기 한도
  max_rounds            smallint not null default 0,         -- 0 = 무제한 연장
  rematch_cooldown_days int      not null default 7,
  heartbeat_sec         int      not null default 15,
  presence_ttl_sec      int      not null default 45,
  msg_burst             real     not null default 12,        -- 토큰버킷 용량
  msg_refill_per_sec    real     not null default 1.5,
  msg_max_len           int      not null default 500
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists "settings: read" on public.app_settings;
create policy "settings: read" on public.app_settings
  for select to authenticated using (true);
revoke insert, update, delete on public.app_settings from anon, authenticated;


-- ── 2. 가입 도메인 제한 · 운영진 (private) ──────────────────────────
create table if not exists private.auth_config (
  id              boolean primary key default true check (id),
  allowed_domains text[] not null default array['cnsa.hs.kr']
);
insert into private.auth_config (id) values (true) on conflict (id) do nothing;
alter table private.auth_config enable row level security;
-- ★ 정책 0개 = anon/authenticated 전면 차단. service_role 만 통과.

create table if not exists private.staff (
  user_id    uuid primary key references auth.users on delete cascade,
  role       text not null default 'moderator' check (role in ('moderator','admin')),
  created_at timestamptz not null default now()
);
alter table private.staff enable row level security;


-- ── 3. 계정 ─────────────────────────────────────────────────────────
-- 매칭 파라미터와 상태만. 상대에게 보여줄 정보는 여기 없다(방별 alias 를 쓴다).
create table if not exists public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  gender          text not null default 'x' check (gender in ('m','f','x')),
  want            text not null default 'any' check (want in ('m','f','any')),
  status          text not null default 'active' check (status in ('active','suspended','banned')),
  suspended_until timestamptz,
  strikes         smallint not null default 0,
  verified        boolean not null default false,   -- 이메일 확인 완료
  onboarded       boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles: self read"   on public.profiles;
drop policy if exists "profiles: self update" on public.profiles;
create policy "profiles: self read" on public.profiles
  for select using (id = auth.uid());
create policy "profiles: self update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- ★ insert 정책 없음 → 가입 트리거(security definer)만 행을 만든다.
-- ★ 남의 프로필은 어떤 쿼리로도 읽히지 않는다. 매칭은 security definer RPC 안에서만.

-- 컬럼 레벨 권한: 정지당한 사용자가 스스로 status / verified 를 되돌리지 못하게
revoke update on public.profiles from authenticated;
grant  update (gender, want, onboarded) on public.profiles to authenticated;


-- presence + 레이트리밋 버킷.
-- ★ 정책 0개 — "누가 지금 접속 중인가" 자체가 비밀이어야 한다. 전부 RPC 경유.
create table if not exists public.user_presence (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  online_until    timestamptz not null default now(),
  seeking_until   timestamptz,          -- '상대 찾는 중' 만료 시각
  seeking_since   timestamptz,          -- 공정성 정렬 키 (오래 기다린 사람 우선)
  current_room_id uuid,
  msg_tokens      real not null default 12,
  tokens_at       timestamptz not null default now()
);
create index if not exists user_presence_pool
  on public.user_presence (seeking_since)
  where current_room_id is null;
alter table public.user_presence enable row level security;


-- ── 4. 가입 파이프라인 ──────────────────────────────────────────────

-- (a) 학교 이메일 도메인 강제 — 실질 권위 지점.
--     BEFORE INSERT 에서 예외를 던지면 가입 트랜잭션이 통째로 롤백된다.
create or replace function private.enforce_school_domain()
returns trigger language plpgsql security definer set search_path = private, public as $fn$
declare
  v_domain  text;
  v_allowed text[];
begin
  if new.email is null or new.email = '' then
    raise exception 'school_email_required' using errcode = '22023';
  end if;
  v_domain := lower(split_part(new.email, '@', 2));
  select allowed_domains into v_allowed from private.auth_config where id;
  if v_allowed is null or not (v_domain = any(v_allowed)) then
    raise exception 'school_email_required' using errcode = '22023';
  end if;
  return new;
end
$fn$;

drop trigger if exists enforce_domain_ins on auth.users;
create trigger enforce_domain_ins
  before insert on auth.users
  for each row execute function private.enforce_school_domain();

-- ★ 이메일 변경 경로도 막는다. 안 막으면 가입 후 외부 메일로 바꿔치기가 된다.
drop trigger if exists enforce_domain_upd on auth.users;
create trigger enforce_domain_upd
  before update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function private.enforce_school_domain();


-- (a-2) 계정 선점 방지 — 이메일 확인 전인 계정에는 비밀번호를 저장하지 않는다.
--   앱은 코드(OTP)로만 로그인하지만 Supabase 가입 API 자체는 비밀번호 가입을 받는다.
--   막지 않으면: 공격자가 피해자 이메일 + 자기 비밀번호로 미리 가입 → 피해자가 OTP 로 확인 →
--   공격자가 그 비밀번호로 피해자 계정에 로그인할 여지가 생긴다.
--   확인 전에는 비밀번호가 늘 비어 있으므로 선점해도 쓸모가 없다.
--   (대시보드에서 Auto Confirm 으로 만든 개발용 계정은 처음부터 확인된 상태라 영향 없음)
create or replace function private.strip_unconfirmed_password()
returns trigger language plpgsql security definer set search_path = private, public as $fn$
begin
  if new.email_confirmed_at is null and coalesce(new.encrypted_password, '') <> '' then
    new.encrypted_password := '';
  end if;
  return new;
end
$fn$;

drop trigger if exists strip_password_ins on auth.users;
create trigger strip_password_ins
  before insert on auth.users
  for each row execute function private.strip_unconfirmed_password();

drop trigger if exists strip_password_upd on auth.users;
create trigger strip_password_upd
  before update on auth.users
  for each row execute function private.strip_unconfirmed_password();


-- (b) 계정 부속 행 생성. 실명·학번은 저장하지 않는다.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.profiles (id, verified)
    values (new.id, new.email_confirmed_at is not null)
    on conflict (id) do nothing;
  insert into public.user_presence (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  return new;
end
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- (c) 이메일 확인 완료를 profiles.verified 로 동기화.
create or replace function public.sync_verified()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set verified = true where id = new.id;
  end if;
  return new;
end
$fn$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.sync_verified();


-- (d) 클라이언트 폴백 — 트리거가 못 만든 경우를 대비한 자기 행 보장.
--     (gyeol-app 의 ensureProfile 패턴)
create or replace function public.ensure_self()
returns void language plpgsql security definer set search_path = public as $fn$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  insert into public.profiles (id) values (me) on conflict (id) do nothing;
  insert into public.user_presence (user_id) values (me) on conflict (user_id) do nothing;
  update public.profiles p set verified = true
    where p.id = me and not p.verified
      and exists (select 1 from auth.users u
                   where u.id = me and u.email_confirmed_at is not null);
end
$fn$;
revoke all on function public.ensure_self() from public, anon;
grant execute on function public.ensure_self() to authenticated;


-- ════════════════════════════════════════════════════════════════════
--  Phase 2 — 채팅 코어
-- ════════════════════════════════════════════════════════════════════

-- ── 5. 방 · 좌석 · 메시지 ───────────────────────────────────────────
create table if not exists public.rooms (
  id           uuid primary key default gen_random_uuid(),
  status       text not null default 'pending' check (status in ('pending','active','closed')),
  round        smallint not null default 1,
  created_at   timestamptz not null default now(),
  armed_at     timestamptz,                    -- 양쪽 입장 확인 시각 = 타이머 시작점
  expires_at   timestamptz not null,           -- pending: 입장 마감 / active: 대화 마감
  closed_at    timestamptz,
  close_reason text check (close_reason in
                ('expired','declined','skipped','no_show','left','reported','blocked','admin')),
  alias1       text not null,                  -- 방 안에서만 쓰는 이름. 방이 닫히면 버려진다.
  alias2       text not null,
  read1        bigint,                         -- seat1 이 읽은 마지막 message id
  read2        bigint
);
create index if not exists rooms_open on public.rooms (expires_at) where status <> 'closed';

create table if not exists public.room_members (
  room_id   uuid not null references public.rooms(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  seat      smallint not null check (seat in (1,2)),
  open      boolean not null default true,     -- 방이 살아 있는 동안 true
  joined_at timestamptz,                       -- 실제로 대화 화면을 연 시각 (Phase 3 ack_room)
  primary key (room_id, user_id)
);
create unique index if not exists rm_room_seat on public.room_members (room_id, seat);
-- (예전 "한 사람 한 방" 유니크 인덱스는 Phase 8 에서 여러 대화 동시 진행으로 바뀌며 없앴다)
drop index if exists public.rm_one_open_room;
create index if not exists rm_user_open on public.room_members (user_id) where open;

create table if not exists public.messages (
  id            bigint generated always as identity primary key,
  room_id       uuid not null references public.rooms(id) on delete cascade,
  sender_seat   smallint not null check (sender_seat in (0,1,2)),   -- 0 = 시스템 안내
  body          text not null check (char_length(btrim(body)) between 1 and 500),
  client_msg_id uuid not null,
  created_at    timestamptz not null default now()
);
-- ★ 식별 컬럼이 없다. 있을 수 없다.
create unique index if not exists messages_dedupe on public.messages (room_id, client_msg_id);
create index        if not exists messages_cursor on public.messages (room_id, id desc);


-- ── 6. RLS 헬퍼 — security definer 로 재귀를 끊는다 ─────────────────
-- rooms 정책이 room_members 를 보고 room_members 정책이 rooms 를 보면 무한 재귀.
-- (gyeol-app is_group_member 패턴)
create or replace function public.is_room_member(p_room uuid)
returns boolean language sql security definer set search_path = public stable as $fn$
  select exists (select 1 from public.room_members
                  where room_id = p_room and user_id = auth.uid());
$fn$;

create or replace function public.my_seat(p_room uuid)
returns smallint language sql security definer set search_path = public stable as $fn$
  select seat from public.room_members where room_id = p_room and user_id = auth.uid();
$fn$;

-- 메시지를 '볼 수' 있는 방 — 닫히면 과거 대화가 사라진다
create or replace function public.room_is_visible(p_room uuid)
returns boolean language sql security definer set search_path = public stable as $fn$
  select exists (select 1 from public.rooms where id = p_room and status <> 'closed');
$fn$;

-- 메시지를 '쓸 수' 있는 방 — ★ 만료 강제는 배치가 아니라 여기에 있다.
-- status 가 아직 active 여도 now() >= expires_at 이면 쓸 수 없다.
create or replace function public.room_is_writable(p_room uuid)
returns boolean language sql security definer set search_path = public stable as $fn$
  select exists (select 1 from public.rooms
                  where id = p_room and status = 'active' and now() < expires_at);
$fn$;

revoke all on function public.is_room_member(uuid), public.my_seat(uuid),
                       public.room_is_visible(uuid), public.room_is_writable(uuid)
  from public, anon;
grant execute on function public.is_room_member(uuid), public.my_seat(uuid),
                          public.room_is_visible(uuid), public.room_is_writable(uuid)
  to authenticated;


-- ── 7. RLS 정책 ─────────────────────────────────────────────────────
alter table public.rooms enable row level security;
drop policy if exists "rooms: member read" on public.rooms;
create policy "rooms: member read" on public.rooms
  for select to authenticated using (public.is_room_member(id));
-- status 로 막지 않는다 — 방이 닫히는 UPDATE 를 Realtime 으로 양쪽에 전달해야 하므로.
revoke all on public.rooms from anon, authenticated;
grant select on public.rooms to authenticated;

alter table public.room_members enable row level security;
drop policy if exists "rm: self read only" on public.room_members;
create policy "rm: self read only" on public.room_members
  for select to authenticated using (user_id = auth.uid());
-- ★ 익명성의 급소. "같은 방 멤버 전부 읽기"로 바꾸는 순간 상대 uuid 가 샌다.
revoke all on public.room_members from anon, authenticated;
grant select on public.room_members to authenticated;

alter table public.messages enable row level security;
drop policy if exists "messages: read while room alive" on public.messages;
drop policy if exists "messages: send as my seat"       on public.messages;
create policy "messages: read while room alive" on public.messages
  for select to authenticated
  using (public.is_room_member(room_id) and public.room_is_visible(room_id));
create policy "messages: send as my seat" on public.messages
  for insert to authenticated
  with check (sender_seat = public.my_seat(room_id)     -- 좌석 위조 불가
              and public.room_is_writable(room_id));    -- 만료 후 쓰기 원천 차단
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
-- 컬럼 단위 insert: id·created_at 은 클라가 정할 수 없다
grant insert (room_id, sender_seat, body, client_msg_id) on public.messages to authenticated;
-- ★ update/delete 없음 = 증거 무결성. "보낸 메시지 삭제" 기능은 의도적으로 없다.


-- ── 8. alias ────────────────────────────────────────────────────────
create or replace function public.random_alias()
returns text language sql volatile as $fn$
  select (array['말랑','포근','새벽','바삭','조용','느긋','반짝','시원','담백','뭉게',
                '노란','파란','초록','보라','하얀','까만','붉은','은은'])[floor(random()*18)::int + 1]
      || (array['복숭아','고양이','달팽이','구름','수달','펭귄','자몽','토끼','라떼','북극곰',
                '해달','민트','오리','참새','여우','고래','두더지','감자'])[floor(random()*18)::int + 1];
$fn$;


-- ── 9. 방 스냅샷 — 익명성의 경계선 ──────────────────────────────────
-- 클라가 방에 대해 아는 모든 것이 여기서 나온다. room_id 외의 uuid 는 절대 반환하지 않는다.
-- (Phase 3 에서 투표 상태, Phase 4 에서 상대 접속 상태가 추가된다)
create or replace function public.room_snapshot(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $fn$
declare
  r public.rooms%rowtype;
  s smallint;
begin
  s := public.my_seat(p_room);
  if s is null then raise exception 'not_member'; end if;
  select * into r from public.rooms where id = p_room;
  return jsonb_build_object(
    'room_id',        r.id,
    'status',         r.status,
    'my_seat',        s,
    'my_alias',       case when s = 1 then r.alias1 else r.alias2 end,
    'partner_alias',  case when s = 1 then r.alias2 else r.alias1 end,
    'expires_at',     r.expires_at,
    'round',          r.round,
    'their_read_id',  case when s = 1 then r.read2 else r.read1 end,
    'close_reason',   r.close_reason,
    'server_now',     now());
end
$fn$;

-- 내가 지금 들어가 있는 방 (없으면 null)
create or replace function public.my_room()
returns jsonb language plpgsql security definer set search_path = public stable as $fn$
declare v_room uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  -- 여러 방이 열려 있을 수 있다(Phase 8) — 가장 최근 방. 목록은 my_rooms() 를 쓴다.
  select rm.room_id into v_room from public.room_members rm join public.rooms r on r.id = rm.room_id
   where rm.user_id = auth.uid() and rm.open order by r.created_at desc limit 1;
  if v_room is null then
    return jsonb_build_object('room', null, 'server_now', now());
  end if;
  return jsonb_build_object('room', public.room_snapshot(v_room), 'server_now', now());
end
$fn$;

-- 읽음 표시 — room_members 는 self-only 라 상대가 못 보므로 rooms 에 seat 기준으로 둔다
create or replace function public.mark_read(p_room uuid, p_last_id bigint)
returns void language plpgsql security definer set search_path = public as $fn$
declare s smallint := public.my_seat(p_room);
begin
  if s is null then raise exception 'not_member'; end if;
  if s = 1 then
    update public.rooms set read1 = greatest(coalesce(read1, 0), p_last_id)
     where id = p_room and coalesce(read1, 0) < p_last_id;
  else
    update public.rooms set read2 = greatest(coalesce(read2, 0), p_last_id)
     where id = p_room and coalesce(read2, 0) < p_last_id;
  end if;
end
$fn$;

revoke all on function public.room_snapshot(uuid), public.my_room(),
                       public.mark_read(uuid, bigint) from public, anon;
grant execute on function public.room_snapshot(uuid), public.my_room(),
                          public.mark_read(uuid, bigint) to authenticated;


-- ── 10. 개발용: 테스트 방 만들기 (service_role / SQL Editor 전용) ───
-- Phase 4 매칭이 생기기 전까지 두 계정을 손으로 한 방에 넣는다.
--   select private.dev_open_room('a@cnsa.hs.kr', 'b@cnsa.hs.kr', 60);
create or replace function private.dev_open_room(p_email1 text, p_email2 text, p_minutes int default 60)
returns uuid language plpgsql security definer set search_path = public, private as $fn$
declare
  u1 uuid; u2 uuid; v_room uuid; a1 text; a2 text;
begin
  select id into u1 from auth.users where lower(email) = lower(p_email1);
  select id into u2 from auth.users where lower(email) = lower(p_email2);
  if u1 is null or u2 is null then raise exception 'user_not_found'; end if;

  -- 기존에 열린 방이 있으면 닫는다 (한 사람 한 방)
  update public.rooms set status = 'closed', closed_at = now(), close_reason = 'admin'
   where id in (select room_id from public.room_members where user_id in (u1, u2) and open);
  update public.room_members set open = false where user_id in (u1, u2) and open;

  -- 방 안 이름 = 계정의 고유 익명 이름 (Phase 8). 없으면 임시 이름.
  select coalesce(nickname, public.random_alias()) into a1 from public.profiles where id = u1;
  select coalesce(nickname, public.random_alias()) into a2 from public.profiles where id = u2;
  while a2 = a1 loop a2 := public.random_alias(); end loop;

  insert into public.rooms (status, armed_at, expires_at, alias1, alias2)
  values ('active', now(), now() + make_interval(mins => p_minutes), a1, a2)
  returning id into v_room;

  insert into public.room_members (room_id, user_id, seat, joined_at)
  values (v_room, u1, 1, now()), (v_room, u2, 2, now());

  insert into public.messages (room_id, sender_seat, body, client_msg_id)
  values (v_room, 0, '대화 시작. 이름·학번·SNS는 묻지도 말하지도 않기로 해요.',
          gen_random_uuid());
  return v_room;
end
$fn$;
revoke all on function private.dev_open_room(text, text, int) from public, anon, authenticated;


-- ── 11. Realtime 발행 ───────────────────────────────────────────────
-- room_members 를 넣는 이유: 매칭 대기 중인 사람이 '내 행' INSERT 로 방 배정을 즉시 안다.
-- (RLS 가 self read only 이므로 상대 행은 절대 오지 않는다)
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.messages;
    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.rooms;
    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.room_members;
    exception when duplicate_object then null; end;
  end if;
end
$do$;


-- ════════════════════════════════════════════════════════════════════
--  Phase 3 — 타임박스
--
--  [pending] --양쪽 ack_room--> [active] --만료/거절/나가기--> [closed]
--                                  └─ 양쪽 연장 동의: expires_at += 10분, round += 1
--
--  "연장투표중"은 상태가 아니다. 만료 vote_window_sec 전부터의 구간일 뿐이다.
--  마감 시각은 방 전체에 딱 하나(expires_at)이고 그게 곧 투표 데드라인이다.
-- ════════════════════════════════════════════════════════════════════

-- ── 12. 연장 투표 ───────────────────────────────────────────────────
create table if not exists public.extension_votes (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  round      smallint not null,
  seat       smallint not null check (seat in (1,2)),
  agree      boolean not null,
  created_at timestamptz not null default now(),
  primary key (room_id, round, seat)   -- ★ round 가 키에 있어 라운드 간 표가 섞이지 않는다
);
alter table public.extension_votes enable row level security;
drop policy if exists "votes: member read" on public.extension_votes;
create policy "votes: member read" on public.extension_votes
  for select to authenticated using (public.is_room_member(room_id));
-- 행에 seat 만 있으므로 상대 투표를 봐도 익명성 손상 없음. 쓰기는 RPC 만.
revoke all on public.extension_votes from anon, authenticated;
grant select on public.extension_votes to authenticated;


-- ── 13. 방 닫기 (내부 전용) ─────────────────────────────────────────
create or replace function public.close_room(p_room uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  update public.rooms
     set status = 'closed', closed_at = now(), close_reason = p_reason,
         expires_at = least(expires_at, now())
   where id = p_room and status <> 'closed';
  update public.room_members set open = false where room_id = p_room and open;
  update public.user_presence set current_room_id = null where current_room_id = p_room;
end
$fn$;
-- ★ 클라이언트가 직접 부르면 아무 방이나 닫을 수 있으므로 완전히 막는다
revoke all on function public.close_room(uuid, text) from public, anon, authenticated;


-- ── 14. 방 스냅샷 (Phase 3 판) ──────────────────────────────────────
create or replace function public.room_snapshot(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $fn$
declare
  r   public.rooms%rowtype;
  cfg public.app_settings%rowtype;
  s   smallint;
  v_my boolean; v_their boolean; v_joined boolean; v_online boolean;
begin
  s := public.my_seat(p_room);
  if s is null then raise exception 'not_member'; end if;
  select * into r   from public.rooms where id = p_room;
  select * into cfg from public.app_settings where id;

  select agree into v_my    from public.extension_votes where room_id = p_room and round = r.round and seat = s;
  select agree into v_their from public.extension_votes where room_id = p_room and round = r.round and seat <> s;
  select joined_at is not null into v_joined
    from public.room_members where room_id = p_room and seat <> s;
  -- 상대가 앱을 켜 두었는지 (Phase 8 heartbeat). 켜짐/꺼짐 한 비트만 — 언제 접속했는지는 알려주지 않는다.
  select coalesce(up.online_until > now(), false) into v_online
    from public.room_members rm join public.user_presence up on up.user_id = rm.user_id
   where rm.room_id = p_room and rm.seat <> s;

  return jsonb_build_object(
    'room_id',         r.id,
    'status',          r.status,
    'my_seat',         s,
    'my_alias',        case when s = 1 then r.alias1 else r.alias2 end,
    'partner_alias',   case when s = 1 then r.alias2 else r.alias1 end,
    'expires_at',      r.expires_at,
    'round',           r.round,
    'max_rounds',      cfg.max_rounds,
    'extend_minutes',  cfg.extend_minutes,
    'vote_window_sec', cfg.vote_window_sec,
    'my_vote',         v_my,
    'partner_vote',    v_their,
    'partner_joined',  coalesce(v_joined, false),
    'partner_online',  coalesce(v_online, false),
    'their_read_id',   case when s = 1 then r.read2 else r.read1 end,
    'close_reason',    r.close_reason,
    'server_now',      now());
end
$fn$;


-- ── 15. 입장 확인 — 10분 타이머는 양쪽이 실제로 화면을 열어야 시작 ──
create or replace function public.ack_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  r   public.rooms%rowtype;
  cfg public.app_settings%rowtype;
  v_joined int;
begin
  if public.my_seat(p_room) is null then raise exception 'not_member'; end if;
  select * into cfg from public.app_settings where id;
  select * into r from public.rooms where id = p_room for update;

  if r.status = 'pending' and now() >= r.expires_at then
    perform public.close_room(p_room, 'no_show');
    return public.room_snapshot(p_room);
  end if;

  update public.room_members set joined_at = coalesce(joined_at, now())
   where room_id = p_room and user_id = auth.uid();

  if r.status = 'pending' then
    select count(*) into v_joined from public.room_members
     where room_id = p_room and joined_at is not null;
    if v_joined = 2 then
      update public.rooms
         set status = 'active', armed_at = now(),
             expires_at = now() + make_interval(mins => cfg.room_minutes)   -- ★ 여기서 10분 시작
       where id = p_room;
      -- 재매칭 방지 기록은 매칭 순간이 아니라 "대화가 실제로 시작된" 지금 남긴다.
      -- 한쪽이 안 들어온(no_show) 상대와는 대화한 적이 없으니 다시 만날 수 있어야 하고,
      -- 이렇게 하면 롤백 로직 자체가 필요 없다. (pair_history 는 Phase 4 에서 생성 — plpgsql 은 실행 시점에 해석)
      insert into public.pair_history (user_lo, user_hi)
      select least(a.user_id, b.user_id), greatest(a.user_id, b.user_id)
        from public.room_members a join public.room_members b
          on a.room_id = b.room_id and a.seat = 1 and b.seat = 2
       where a.room_id = p_room
      on conflict (user_lo, user_hi) do update
         set last_matched_at = now(), times = public.pair_history.times + 1;
      insert into public.messages (room_id, sender_seat, body, client_msg_id)
      values (p_room, 0,
              cfg.room_minutes || '분 동안 이야기할 수 있어요. 이름·학번·SNS는 묻지도 말하지도 않기로 해요.',
              gen_random_uuid());
    end if;
  end if;
  return public.room_snapshot(p_room);
end
$fn$;


-- ── 16. 연장 투표 ───────────────────────────────────────────────────
create or replace function public.vote_extension(p_room uuid, p_agree boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  r   public.rooms%rowtype;
  cfg public.app_settings%rowtype;
  s   smallint;
  v_yes int; v_no int;
begin
  s := public.my_seat(p_room);
  if s is null then raise exception 'not_member'; end if;
  select * into cfg from public.app_settings where id;

  -- ★ 방 행을 잠근다. 양쪽이 같은 밀리초에 눌러도 여기서 줄을 선다.
  select * into r from public.rooms where id = p_room for update;

  if r.status <> 'active' then
    return jsonb_build_object('result', 'closed', 'snap', public.room_snapshot(p_room));
  end if;
  -- 만료 직후 도착한 표 → 버리고 방을 닫는다. 늦게 온 패킷에 시간을 되살릴 권한을 주지 않는다.
  if now() >= r.expires_at then
    perform public.close_room(p_room, 'expired');
    return jsonb_build_object('result', 'expired', 'snap', public.room_snapshot(p_room));
  end if;
  -- 너무 이른 투표 (조작된 클라이언트가 미리 시간을 쌓지 못하게)
  if now() < r.expires_at - make_interval(secs => cfg.vote_window_sec) then
    return jsonb_build_object('result', 'too_early', 'snap', public.room_snapshot(p_room));
  end if;
  -- 연장 상한 (0 = 무제한)
  if cfg.max_rounds > 0 and r.round >= cfg.max_rounds then
    return jsonb_build_object('result', 'max_rounds', 'snap', public.room_snapshot(p_room));
  end if;

  insert into public.extension_votes (room_id, round, seat, agree)
  values (p_room, r.round, s, p_agree)
  on conflict (room_id, round, seat)
    do update set agree = excluded.agree, created_at = now();   -- 마음 바꾸기 허용

  select count(*) filter (where agree), count(*) filter (where not agree)
    into v_yes, v_no
    from public.extension_votes where room_id = p_room and round = r.round;

  if v_no > 0 then
    perform public.close_room(p_room, 'declined');
    return jsonb_build_object('result', 'declined', 'snap', public.room_snapshot(p_room));
  elsif v_yes = 2 then
    update public.rooms
       set expires_at = r.expires_at + make_interval(mins => cfg.extend_minutes),  -- ★ now() 가 아니다
           round      = r.round + 1
     where id = p_room;
    insert into public.messages (room_id, sender_seat, body, client_msg_id)
    values (p_room, 0, cfg.extend_minutes || '분 연장됨.', gen_random_uuid());
    return jsonb_build_object('result', 'extended', 'snap', public.room_snapshot(p_room));
  end if;
  return jsonb_build_object('result', 'waiting', 'snap', public.room_snapshot(p_room));
end
$fn$;


-- ── 17. 만료 확인 · 나가기 ──────────────────────────────────────────
-- 카운트다운이 0 이 된 클라이언트가 부른다. "이미 만료됐으면 닫아라" — 조기 종료는 불가능하므로 안전.
create or replace function public.close_if_expired(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r public.rooms%rowtype;
begin
  if public.my_seat(p_room) is null then raise exception 'not_member'; end if;
  select * into r from public.rooms where id = p_room for update;
  if r.status <> 'closed' and now() >= r.expires_at then
    perform public.close_room(p_room, case when r.status = 'pending' then 'no_show' else 'expired' end);
  end if;
  return public.room_snapshot(p_room);   -- 언제나 최신 스냅샷 + server_now
end
$fn$;

-- p_skip = true: 다음 상대로 넘기기 / false: 그냥 나가기
create or replace function public.leave_room(p_room uuid, p_skip boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if public.my_seat(p_room) is null then raise exception 'not_member'; end if;
  perform public.close_room(p_room, case when p_skip then 'skipped' else 'left' end);
  return public.room_snapshot(p_room);
end
$fn$;

revoke all on function public.ack_room(uuid), public.vote_extension(uuid, boolean),
                       public.close_if_expired(uuid), public.leave_room(uuid, boolean)
  from public, anon;
grant execute on function public.ack_room(uuid), public.vote_extension(uuid, boolean),
                          public.close_if_expired(uuid), public.leave_room(uuid, boolean)
  to authenticated;


-- ── 18. 스위퍼 — 양쪽 다 앱을 꺼버린 방 정리 ───────────────────────
-- 이걸 안 하면 만료된 방이 계속 "열린 대화"로 남아 동시 대화 상한을 차지한다(좀비 방).
-- 메시지 쓰기 차단은 여기가 아니라 room_is_writable 정책이 이미 하고 있다.
create or replace function public.sweep_rooms()
returns int language plpgsql security definer set search_path = public as $fn$
declare n int := 0; v record;
begin
  for v in select id, status from public.rooms
            where status <> 'closed' and now() >= expires_at
            order by expires_at limit 500
            for update skip locked
  loop
    perform public.close_room(v.id, case when v.status = 'pending' then 'no_show' else 'expired' end);
    n := n + 1;
  end loop;
  return n;
end
$fn$;
revoke all on function public.sweep_rooms() from public, anon, authenticated;


-- ── 19. Realtime 발행 + 예약 작업 ───────────────────────────────────
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.extension_votes;
    exception when duplicate_object then null; end;
  end if;
end
$do$;

-- pg_cron: 1분마다 스위퍼, 매일 새벽 24시간 지난 대화 삭제.
-- (PGlite 등 pg_cron 이 없는 환경에서는 조용히 건너뛴다)
do $do$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron 을 쓸 수 없는 환경 — 예약 작업을 건너뜀';
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('simbun-sweep', 'simbun-purge');
    perform cron.schedule('simbun-sweep', '* * * * *', 'select public.sweep_rooms()');
    perform cron.schedule('simbun-purge', '17 4 * * *',
      $q$delete from public.messages m using public.rooms r
          where r.id = m.room_id and r.status = 'closed'
            and r.closed_at < now() - interval '24 hours'$q$);
  end if;
end
$do$;


-- ════════════════════════════════════════════════════════════════════
--  Phase 4 — 랜덤 매칭
--
--  별도 대기큐 테이블이 없다. "지금 찾는 중인 사람들의 집합"(user_presence.seeking_until)이 곧 큐다.
--  대기 화면은 request_match() 를 몇 초마다 다시 부른다 — 이 한 번의 호출이
--    ① '나 아직 찾는 중' 갱신  ② 매칭 시도  ③ 누가 이미 나를 잡아갔는지 확인
--  을 모두 한다. 대기자는 웹소켓을 쓰지 않으므로 Realtime 동시 연결 한도를 아낀다.
-- ════════════════════════════════════════════════════════════════════

alter table public.app_settings add column if not exists seek_poll_sec int not null default 4;
alter table public.app_settings add column if not exists seek_ttl_sec  int not null default 15;

-- ── 20. 재매칭 방지 · 차단 ──────────────────────────────────────────
-- 둘 다 RLS on + 정책 0개. 클라가 이 목록을 읽으면 = 내가 만난/차단한 사람들의 uuid 목록 = linkability 복원.
create table if not exists public.pair_history (
  user_lo         uuid not null references public.profiles(id) on delete cascade,
  user_hi         uuid not null references public.profiles(id) on delete cascade,
  last_matched_at timestamptz not null default now(),
  times           int not null default 1,
  primary key (user_lo, user_hi),
  check (user_lo < user_hi)
);
create index if not exists pair_history_hi on public.pair_history (user_hi, last_matched_at desc);
alter table public.pair_history enable row level security;
revoke all on public.pair_history from anon, authenticated;

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked on public.blocks (blocked_id);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;


-- ── 21. 매칭 ────────────────────────────────────────────────────────
create or replace function public.request_match()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  me        uuid := auth.uid();
  cfg       public.app_settings%rowtype;
  m         public.profiles%rowtype;
  v_now     timestamptz := now();
  v_partner uuid;
  v_room    uuid;
  v_pool    int;
  v_exp     record;
  v_bucket  jsonb;
  v_open    int;
  a1 text; a2 text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into cfg from public.app_settings where id;
  if not cfg.is_open then
    return jsonb_build_object('status', 'service_closed', 'notice', cfg.notice, 'server_now', v_now);
  end if;

  select * into m from public.profiles where id = me;
  if not found or not m.verified or not m.onboarded or m.status <> 'active'
     or (m.suspended_until is not null and m.suspended_until > v_now) then
    return jsonb_build_object('status', 'not_eligible', 'server_now', v_now);
  end if;

  -- ① '찾는 중' 등록/갱신. seeking_since 는 첫 요청 시각을 유지 → 오래 기다린 사람이 순서를 잃지 않는다.
  --   락을 못 잡아도 이 등록은 남으므로, 다른 사람의 매칭이 나를 찾아갈 수 있다.
  insert into public.user_presence (user_id, online_until, seeking_until, seeking_since)
  values (me, v_now + make_interval(secs => cfg.seek_ttl_sec),
              v_now + make_interval(secs => cfg.seek_ttl_sec), v_now)
  on conflict (user_id) do update
     -- heartbeat 가 더 길게 잡아 둔 온라인 시각을 줄이지 않는다
     set online_until  = greatest(public.user_presence.online_until, excluded.online_until),
         seeking_until = excluded.seeking_until,
         seeking_since = coalesce(public.user_presence.seeking_since, excluded.seeking_since);

  -- ② 풀 직렬화. ★ 대기형이 아니라 즉시 실패형 — 수백 명이 동시에 눌러도 커넥션이 락 큐에 쌓이지 않는다.
  if not pg_try_advisory_xact_lock(hashtext('simbun_match_pool')) then
    return jsonb_build_object('status', 'busy', 'retry_after_ms', 300, 'server_now', v_now);
  end if;

  -- 내 만료된 방 정리 (스위퍼보다 먼저 — 좀비 방 때문에 매칭이 막히지 않게)
  for v_exp in
    select r.id, r.status from public.rooms r
      join public.room_members rm on rm.room_id = r.id
     where rm.user_id = me and rm.open and r.status <> 'closed' and v_now >= r.expires_at
  loop
    perform public.close_room(v_exp.id, case when v_exp.status = 'pending' then 'no_show' else 'expired' end);
  end loop;

  -- ③ 누가 이미 나를 잡아갔으면 그 방으로.
  --   여러 대화가 동시에 열려 있을 수 있으므로(Phase 8) "아직 내가 들어가 보지 않은 새 방"만 본다.
  select rm.room_id into v_room
    from public.room_members rm join public.rooms r on r.id = rm.room_id
   where rm.user_id = me and rm.open and rm.joined_at is null and r.status = 'pending'
   order by r.created_at desc limit 1;
  if v_room is not null then
    update public.user_presence set seeking_until = null, seeking_since = null where user_id = me;
    return jsonb_build_object('status', 'matched', 'room_id', v_room, 'server_now', v_now);
  end if;

  -- ③-2 동시 대화 상한 — 꽉 찼으면 찾기를 멈춘다
  select count(*) into v_open from public.room_members where user_id = me and open;
  if v_open >= cfg.max_open_rooms then
    update public.user_presence set seeking_until = null, seeking_since = null where user_id = me;
    return jsonb_build_object('status', 'full', 'max', cfg.max_open_rooms, 'server_now', v_now);
  end if;

  -- ④ 후보 1명
  select c.user_id into v_partner
    from public.user_presence c
    join public.profiles p on p.id = c.user_id
   where c.user_id <> me
     and c.seeking_until > v_now                         -- ★ 지금 실제로 앱을 보며 찾는 사람만
     -- 상대도 동시 대화 상한 아래여야 한다
     and (select count(*) from public.room_members rm where rm.user_id = c.user_id and rm.open) < cfg.max_open_rooms
     -- 이미 나와 열린 대화가 있는 사람은 또 잡지 않는다
     and not exists (select 1 from public.room_members x
                       join public.room_members y on y.room_id = x.room_id
                      where x.user_id = me and x.open and y.user_id = c.user_id)
     and p.status = 'active' and p.verified and p.onboarded
     and (p.suspended_until is null or p.suspended_until <= v_now)
     -- 선호 성별: 양방향 모두 만족
     and (m.want = 'any' or m.want = p.gender)
     and (p.want = 'any' or p.want = m.gender)
     -- 차단: 어느 쪽이 했든
     and not exists (select 1 from public.blocks b
                      where (b.blocker_id = me and b.blocked_id = c.user_id)
                         or (b.blocker_id = c.user_id and b.blocked_id = me))
     -- 최근에 대화한 상대 제외 — 둘 다 "만났던 사람도 다시 만나기"를 켰으면 예외 (Phase 21, 설정 화면)
     and ((coalesce(m.allow_rematch, false) and coalesce(p.allow_rematch, false))
          or not exists (select 1 from public.pair_history h
                          where h.user_lo = least(me, c.user_id)
                            and h.user_hi = greatest(me, c.user_id)
                            and h.last_matched_at > v_now - make_interval(days => cfg.rematch_cooldown_days)))
   order by -- 다시 만나기를 켰어도 처음 보는 사람이 있으면 그쪽 먼저
            exists (select 1 from public.pair_history h
                     where h.user_lo = least(me, c.user_id)
                       and h.user_hi = greatest(me, c.user_id)
                       and h.last_matched_at > v_now - make_interval(days => cfg.rematch_cooldown_days)),
            c.seeking_since asc,   -- ★ 오래 기다린 사람 먼저 (굶주림 방지)
            random()
   limit 1;

  -- ⑤ 아무도 없으면 에러가 아니라 대기 상태
  if v_partner is null then
    select count(*) into v_pool
      from public.user_presence
     where user_id <> me and seeking_until > v_now;
    return jsonb_build_object(
      'status', 'waiting',
      'reason', case when v_pool = 0 then 'empty' else 'filtered' end,
      'poll_ms', cfg.seek_poll_sec * 1000,
      'server_now', v_now);
  end if;

  -- ⑥ 넘기기 연타 제한 (Phase 5) — 방을 만드는 쪽만 차감. 쉬는 동안에도 풀에는 남아 있어 잡힐 수는 있다.
  v_bucket := public.match_bucket_take(me);
  if not (v_bucket->>'ok')::boolean then
    return jsonb_build_object('status', 'cooldown',
      'retry_after_ms', (v_bucket->>'retry_after_ms')::int, 'server_now', v_now);
  end if;

  -- ⑦ 방 생성 — pending. 10분 타이머는 둘 다 화면을 열어야(ack_room) 시작된다.
  --   방 안 이름은 각자의 고유 익명 이름(Phase 8). 없으면 임시 이름.
  a1 := coalesce(m.nickname, public.random_alias());
  select coalesce(nickname, public.random_alias()) into a2 from public.profiles where id = v_partner;
  while a2 = a1 loop a2 := public.random_alias(); end loop;

  insert into public.rooms (status, expires_at, alias1, alias2)
  values ('pending', v_now + make_interval(secs => cfg.join_grace_sec), a1, a2)
  returning id into v_room;

  insert into public.room_members (room_id, user_id, seat)
  values (v_room, me, 1), (v_room, v_partner, 2);

  update public.user_presence
     set seeking_until = null, seeking_since = null
   where user_id in (me, v_partner);

  -- ★ 반환값에 상대의 uuid 는 없다. room_id 뿐.
  return jsonb_build_object('status', 'matched', 'room_id', v_room, 'server_now', v_now);

exception
  when unique_violation then   -- 유니크 인덱스 충돌(좌석 중복 등) — 조용히 재시도
    return jsonb_build_object('status', 'retry', 'retry_after_ms', 300, 'server_now', now());
end
$fn$;

-- 대기 화면을 떠날 때. 안 불러도 seek_ttl_sec 뒤에 자동으로 풀에서 빠진다.
create or replace function public.stop_seeking()
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  update public.user_presence set seeking_until = null, seeking_since = null where user_id = auth.uid();
end
$fn$;

revoke all on function public.request_match(), public.stop_seeking() from public, anon;
grant execute on function public.request_match(), public.stop_seeking() to authenticated;


-- ════════════════════════════════════════════════════════════════════
--  Phase 5 — 안전장치 (신고 · 차단 · 도배 제한 · 자동 정지)
-- ════════════════════════════════════════════════════════════════════

alter table public.app_settings add column if not exists auto_suspend_reports int not null default 3;
alter table public.app_settings add column if not exists match_burst          real not null default 6;
alter table public.app_settings add column if not exists match_refill_sec     real not null default 10;
alter table public.user_presence add column if not exists match_tokens real not null default 6;
alter table public.user_presence add column if not exists match_at     timestamptz not null default now();

-- ── 22. 신고 (private — PostgREST 에 노출되지 않음) ─────────────────
create table if not exists private.reports (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null,        -- ★ FK 없음: 방이 purge 돼도 신고는 남아야 한다
  reporter_id  uuid not null,
  reported_id  uuid not null,
  reason       text not null check (reason in
               ('harassment','sexual','spam','personal_info','hate','impersonation','other')),
  note         text not null default '',
  status       text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  handled_by   uuid,
  handled_at   timestamptz,
  action_note  text,
  created_at   timestamptz not null default now(),
  unique (room_id, reporter_id)       -- 같은 방을 두 번 신고할 수 없다
);
-- Phase 19: 누가 올렸나 — user = 사람이 신고 / auto = AI 자동 감지 (auto 는 reporter_id 가 비어 있다)
alter table private.reports add column if not exists source text not null default 'user' check (source in ('user','auto'));
create index if not exists reports_queue    on private.reports (status, created_at desc);
create index if not exists reports_reported on private.reports (reported_id, created_at desc);
alter table private.reports enable row level security;

-- 증거: messages 를 참조하지 않고 '복사'한다 → 24시간 purge 와 무관하게 남는다
create table if not exists private.report_evidence (
  report_id   uuid not null references private.reports(id) on delete cascade,
  ord         int  not null,
  sender      smallint not null,     -- 0 시스템 / 1 신고자 / 2 피신고자 (좌석이 아니라 역할)
  body        text not null,
  sent_at     timestamptz not null,
  primary key (report_id, ord)
);
alter table private.report_evidence enable row level security;

-- 운영진 활동 기록 — 운영자에 대한 감시도 필요하다 (특히 신원 열람)
create table if not exists private.audit_log (
  id          bigint generated always as identity primary key,
  staff_id    uuid,                  -- null = 시스템 자동 조치
  action      text not null,
  target_user uuid,
  report_id   uuid,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_recent on private.audit_log (created_at desc);
alter table private.audit_log enable row level security;


-- ── 23. 신고 · 차단 RPC ─────────────────────────────────────────────
-- ★ 상대 uuid 해석은 전부 서버 안에서. 신고자는 상대 uuid 를 보지도, 보내지도 않는다.
-- 방이 이미 닫힌 뒤에도 동작한다 — 대화가 끝나고 신고하는 경우가 많다.
create or replace function public.report_partner(p_room uuid, p_reason text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare
  me       uuid := auth.uid();
  cfg      public.app_settings%rowtype;
  s        smallint;
  v_other  uuid;
  v_report uuid;
  v_n      int;
begin
  s := public.my_seat(p_room);
  if s is null then raise exception 'not_member'; end if;
  if p_reason not in ('harassment','sexual','spam','personal_info','hate','impersonation','other') then
    raise exception 'invalid_reason';
  end if;
  select * into cfg from public.app_settings where id;
  select user_id into v_other from public.room_members where room_id = p_room and seat <> s;

  if exists (select 1 from private.reports where room_id = p_room and reporter_id = me) then
    return jsonb_build_object('status', 'already', 'snap', public.room_snapshot(p_room));
  end if;

  insert into private.reports (room_id, reporter_id, reported_id, reason, note)
  values (p_room, me, v_other, p_reason, left(coalesce(p_note, ''), 1000))
  returning id into v_report;

  -- 대화 전문을 '역할' 기준으로 복사 (1 = 신고자, 2 = 피신고자)
  insert into private.report_evidence (report_id, ord, sender, body, sent_at)
  select v_report, row_number() over (order by m.id),
         case when m.sender_seat = 0 then 0 when m.sender_seat = s then 1 else 2 end,
         m.body, m.created_at
    from public.messages m
   where m.room_id = p_room;

  -- 신고하면 자동으로 차단 + 방 종료
  insert into public.blocks (blocker_id, blocked_id) values (me, v_other) on conflict do nothing;
  perform public.close_room(p_room, 'reported');

  -- 자동 정지: 30일 안에 서로 다른 신고자 N명 → 운영진 확인 전까지 정지
  select count(distinct reporter_id) into v_n
    from private.reports
   where reported_id = v_other and status <> 'dismissed' and created_at > now() - interval '30 days';
  if v_n >= cfg.auto_suspend_reports then
    update public.profiles set status = 'suspended' where id = v_other and status = 'active';
    if found then
      insert into private.audit_log (staff_id, action, target_user, report_id, detail)
      values (null, 'auto_suspend', v_other, v_report, jsonb_build_object('distinct_reporters', v_n));
      -- 정지된 사람이 지금 다른 방에 있으면 그 방도 닫는다
      perform public.close_room(rm.room_id, 'admin')
         from public.room_members rm where rm.user_id = v_other and rm.open;
    end if;
  end if;

  return jsonb_build_object('status', 'ok', 'snap', public.room_snapshot(p_room));
end
$fn$;

create or replace function public.block_partner(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare s smallint; v_other uuid;
begin
  s := public.my_seat(p_room);
  if s is null then raise exception 'not_member'; end if;
  select user_id into v_other from public.room_members where room_id = p_room and seat <> s;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), v_other) on conflict do nothing;
  perform public.close_room(p_room, 'blocked');
  return jsonb_build_object('status', 'ok', 'snap', public.room_snapshot(p_room));
end
$fn$;

revoke all on function public.report_partner(uuid, text, text), public.block_partner(uuid) from public, anon;
grant execute on function public.report_partner(uuid, text, text), public.block_partner(uuid) to authenticated;


-- ── 24. 메시지 도배 제한 — 토큰 버킷 ────────────────────────────────
-- "최근 N초 메시지 수를 센다" 대신 행 하나에 버킷을 둔다 → O(1), 행 락으로 원자적, 우회 불가.
-- ★ 좌석이 아니라 auth.uid() 로 차감한다 — 남의 방에 끼어드는 요청이 방 주인의 한도를 깎을 여지를 없앤다.
create or replace function public.msg_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare cfg public.app_settings%rowtype;
begin
  if new.sender_seat = 0 or auth.uid() is null then return new; end if;   -- 시스템 메시지 · 서버 작업
  select * into cfg from public.app_settings where id;
  update public.user_presence up
     set msg_tokens = least(cfg.msg_burst,
                            up.msg_tokens + extract(epoch from (now() - up.tokens_at)) * cfg.msg_refill_per_sec) - 1,
         tokens_at  = now()
   where up.user_id = auth.uid()
     and least(cfg.msg_burst,
               up.msg_tokens + extract(epoch from (now() - up.tokens_at)) * cfg.msg_refill_per_sec) >= 1;
  if not found then
    raise exception 'rate_limited';
  end if;
  return new;
end
$fn$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.msg_rate_limit();


-- ── 25. 넘기기 연타 제한 — request_match 에 버킷 추가 ───────────────
-- 방을 '만드는' 쪽만 차감한다. 잡혀간 쪽은 차감하지 않는다.
create or replace function public.match_bucket_take(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare cfg public.app_settings%rowtype; v_tokens real;
begin
  select * into cfg from public.app_settings where id;
  select least(cfg.match_burst, match_tokens + extract(epoch from (now() - match_at)) / cfg.match_refill_sec)
    into v_tokens from public.user_presence where user_id = p_user for update;
  if v_tokens < 1 then
    return jsonb_build_object('ok', false,
      'retry_after_ms', ceil((1 - v_tokens) * cfg.match_refill_sec * 1000));
  end if;
  update public.user_presence set match_tokens = v_tokens - 1, match_at = now() where user_id = p_user;
  return jsonb_build_object('ok', true);
end
$fn$;
revoke all on function public.match_bucket_take(uuid) from public, anon, authenticated;


-- ── 26. 신고 증거 보존 기간 ─────────────────────────────────────────
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'simbun-purge-evidence';
    perform cron.schedule('simbun-purge-evidence', '37 4 * * *',
      $q$delete from private.reports where status in ('actioned','dismissed')
          and created_at < now() - interval '180 days'$q$);
  end if;
end
$do$;


-- ════════════════════════════════════════════════════════════════════
--  Phase 6 — 운영자 RPC (service_role 전용)
--
--  private 스키마는 PostgREST 에 노출되지 않으므로 service_role 키로도 REST 로는 못 읽는다.
--  그래서 운영 기능은 service_role 만 실행할 수 있는 public 함수로 만든다.
--  → private 는 계속 숨긴 채로, 학생 키(anon/authenticated)로는 호출 자체가 불가능.
--  이 함수들은 /admin 서버 라우트(+page.server.ts)에서만 부른다.
--
--  운영진 지정:
--    insert into private.staff (user_id, role)
--    select id, 'admin' from auth.users where email = '담당자@cnsa.hs.kr';
-- ════════════════════════════════════════════════════════════════════

create or replace function public.admin_staff_role(p_uid uuid)
returns text language sql security definer set search_path = public, private stable as $fn$
  select role from private.staff where user_id = p_uid;
$fn$;

create or replace function public.admin_stats()
returns jsonb language sql security definer set search_path = public, private stable as $fn$
  select jsonb_build_object(
    'open_reports',    (select count(*) from private.reports where status = 'open'),
    'reviewing',       (select count(*) from private.reports where status = 'reviewing'),
    'active_rooms',    (select count(*) from public.rooms where status <> 'closed' and now() < expires_at),
    'seeking_now',     (select count(*) from public.user_presence where seeking_until > now()),
    'restricted_users',(select count(*) from public.profiles
                         where status <> 'active' or suspended_until > now()),
    'rooms_24h',       (select count(*) from public.rooms where created_at > now() - interval '24 hours'),
    'is_open',         (select is_open from public.app_settings where id));
$fn$;

-- 목록에는 신원 정보가 없다. 사용자 id 만 (조치에 필요).
create or replace function public.admin_list_reports(p_status text default 'open', p_limit int default 100)
returns jsonb language sql security definer set search_path = public, private stable as $fn$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select r.id, r.created_at, r.reason, left(r.note, 140) as note, r.status,
           r.reported_id, r.reporter_id, r.source,
           (select count(distinct r2.reporter_id) from private.reports r2
             where r2.reported_id = r.reported_id and r2.status <> 'dismissed'
               and r2.created_at > now() - interval '30 days') as reported_30d,
           (select count(*) from private.report_evidence e where e.report_id = r.id) as evidence_count,
           p.status as reported_status
      from private.reports r
      left join public.profiles p on p.id = r.reported_id
     where p_status = 'all' or r.status = p_status
     order by r.created_at desc
     limit p_limit
  ) x;
$fn$;

create or replace function public.admin_report(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare r private.reports%rowtype;
begin
  select * into r from private.reports where id = p_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'report', to_jsonb(r),
    'evidence', (select coalesce(jsonb_agg(jsonb_build_object(
                    'ord', e.ord, 'sender', e.sender, 'body', e.body, 'sent_at', e.sent_at) order by e.ord), '[]'::jsonb)
                   from private.report_evidence e where e.report_id = p_id),
    'reported', (select jsonb_build_object('status', p.status, 'strikes', p.strikes,
                        'suspended_until', p.suspended_until, 'gender', p.gender, 'created_at', p.created_at)
                   from public.profiles p where p.id = r.reported_id),
    -- 같은 사람에 대한 다른 신고들 (반복 가해 여부)
    'history', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', h.id, 'created_at', h.created_at, 'reason', h.reason, 'status', h.status) order by h.created_at desc), '[]'::jsonb)
                  from private.reports h where h.reported_id = r.reported_id and h.id <> p_id),
    -- 신고자가 낸 신고 수 (허위 신고 남발 여부)
    'reporter_filed', (select count(*) from private.reports f where f.reporter_id = r.reporter_id),
    'reporter_dismissed', (select count(*) from private.reports f
                            where f.reporter_id = r.reporter_id and f.status = 'dismissed'));
end
$fn$;

create or replace function public.admin_set_report(p_id uuid, p_status text, p_note text, p_staff uuid)
returns void language plpgsql security definer set search_path = public, private as $fn$
begin
  perform private.require_staff(p_staff);   -- 운영진 명단에 없는 id 로는 처리·기록할 수 없다
  update private.reports
     set status = p_status, action_note = nullif(p_note, ''), handled_by = p_staff, handled_at = now()
   where id = p_id;
  insert into private.audit_log (staff_id, action, report_id, detail)
  values (p_staff, 'report_' || p_status, p_id, jsonb_build_object('note', p_note));
end
$fn$;

-- warn: 경고(strike+1) / suspend: N일 정지 / ban: 영구 정지 / reinstate: 제한 해제
create or replace function public.admin_sanction(
  p_user uuid, p_action text, p_days int, p_staff uuid, p_report uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
begin
  if p_action = 'warn' then
    update public.profiles set strikes = strikes + 1 where id = p_user;
  elsif p_action = 'suspend' then
    if coalesce(p_days, 0) < 1 then raise exception 'days_required'; end if;
    update public.profiles
       set status = 'active', suspended_until = now() + make_interval(days => p_days), strikes = strikes + 1
     where id = p_user;
  elsif p_action = 'ban' then
    update public.profiles set status = 'banned', strikes = strikes + 1 where id = p_user;
  elsif p_action = 'reinstate' then
    update public.profiles set status = 'active', suspended_until = null where id = p_user;
  else
    raise exception 'invalid_action';
  end if;

  if p_action in ('suspend', 'ban') then
    perform public.close_room(rm.room_id, 'admin')
       from public.room_members rm where rm.user_id = p_user and rm.open;
    update public.user_presence set seeking_until = null, seeking_since = null where user_id = p_user;
  end if;

  insert into private.audit_log (staff_id, action, target_user, report_id, detail)
  values (p_staff, 'sanction_' || p_action, p_user, p_report,
          jsonb_build_object('days', p_days, 'note', p_note));
  return (select jsonb_build_object('status', status, 'strikes', strikes, 'suspended_until', suspended_until)
            from public.profiles where id = p_user);
end
$fn$;

-- ★ 신원(이메일) 열람은 반드시 기록한다. 이메일 자체는 서버가 auth admin API 로 그 순간에만 조회.
create or replace function public.admin_log_identity_view(p_staff uuid, p_users uuid[], p_report uuid)
returns void language sql security definer set search_path = public, private as $fn$
  insert into private.audit_log (staff_id, action, report_id, detail)
  values (p_staff, 'view_identity', p_report, jsonb_build_object('users', p_users));
$fn$;

create or replace function public.admin_audit(p_limit int default 50)
returns jsonb language sql security definer set search_path = public, private stable as $fn$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
    from (select * from private.audit_log order by created_at desc limit p_limit) a;
$fn$;

create or replace function public.admin_get_settings()
returns jsonb language sql security definer set search_path = public stable as $fn$
  select to_jsonb(s) - 'id' from public.app_settings s where id;
$fn$;

-- 허용된 키만 반영. 범위는 테이블 check 제약이 지킨다.
-- 운영진(moderator)은 서비스 열고 닫기(is_open)만, 나머지 수치·공지는 관리자만.
create or replace function public.admin_update_settings(p_patch jsonb, p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
begin
  if private.require_staff(p_staff) <> 'admin'
     and exists (select 1 from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) k where k <> 'is_open') then
    raise exception 'admin_only';
  end if;
  update public.app_settings set
    is_open               = coalesce((p_patch->>'is_open')::boolean, is_open),
    notice                = coalesce(p_patch->>'notice', notice),
    room_minutes          = coalesce((p_patch->>'room_minutes')::int, room_minutes),
    extend_minutes        = coalesce((p_patch->>'extend_minutes')::int, extend_minutes),
    vote_window_sec       = coalesce((p_patch->>'vote_window_sec')::int, vote_window_sec),
    max_rounds            = coalesce((p_patch->>'max_rounds')::smallint, max_rounds),
    rematch_cooldown_days = coalesce((p_patch->>'rematch_cooldown_days')::int, rematch_cooldown_days),
    auto_suspend_reports  = coalesce((p_patch->>'auto_suspend_reports')::int, auto_suspend_reports),
    max_open_rooms        = coalesce((p_patch->>'max_open_rooms')::int, max_open_rooms),
    -- Phase 19 — AI 검토 · AI 대화 (컬럼은 Phase 19 에서 추가. 이 함수가 먼저 만들어져도 실행 시점엔 있다)
    ai_moderation         = coalesce((p_patch->>'ai_moderation')::boolean, ai_moderation),
    ai_mod_daily_cap      = coalesce((p_patch->>'ai_mod_daily_cap')::int, ai_mod_daily_cap),
    ai_chat               = coalesce((p_patch->>'ai_chat')::boolean, ai_chat),
    ai_chat_per_user      = coalesce((p_patch->>'ai_chat_per_user')::int, ai_chat_per_user),
    ai_chat_daily_cap     = coalesce((p_patch->>'ai_chat_daily_cap')::int, ai_chat_daily_cap),
    ai_chat_minutes       = coalesce((p_patch->>'ai_chat_minutes')::int, ai_chat_minutes),
    ai_chat_max_turns     = coalesce((p_patch->>'ai_chat_max_turns')::int, ai_chat_max_turns)
  where id;
  insert into private.audit_log (staff_id, action, detail) values (p_staff, 'update_settings', p_patch);
  return public.admin_get_settings();
end
$fn$;

do $do$
declare f text;
begin
  foreach f in array array[
    'admin_staff_role(uuid)', 'admin_stats()', 'admin_list_reports(text, int)', 'admin_report(uuid)',
    'admin_set_report(uuid, text, text, uuid)', 'admin_sanction(uuid, text, int, uuid, uuid, text)',
    'admin_log_identity_view(uuid, uuid[], uuid)', 'admin_audit(int)', 'admin_get_settings()',
    'admin_update_settings(jsonb, uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$do$;


-- ════════════════════════════════════════════════════════════════════
--  Phase 8 — 고유 익명 이름 · 프로필 · 온라인 표시 · 여러 대화 동시 진행
--
--  익명성 경계는 그대로다:
--    · 클라이언트는 여전히 상대의 uuid 를 어떤 경로로도 받지 않는다
--    · 상대 프로필은 "같은 방에 있을 때" room_id 로만 조회된다 (partner_profile)
--  달라진 점(운영 결정): 이름이 방마다 새로 뽑히지 않고 계정에 고정된다.
--    → 같은 사람을 다른 방에서 다시 만나면 알아볼 수 있다.
--      그래서 소개글·관심사에 연락처·학번처럼 보이는 내용은 서버가 거절한다.
-- ════════════════════════════════════════════════════════════════════

alter table public.app_settings add column if not exists max_open_rooms int not null default 5;
alter table public.app_settings add column if not exists online_ttl_sec int not null default 70;
alter table public.app_settings drop constraint if exists app_settings_max_open_rooms;
alter table public.app_settings add  constraint app_settings_max_open_rooms check (max_open_rooms between 1 and 20);

-- ── 27. 프로필 — 익명 이름 + 간단한 기본 정보 ───────────────────────
alter table public.profiles add column if not exists nickname  text;
alter table public.profiles add column if not exists bio       text   not null default '';
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles add column if not exists mbti      text;
create unique index if not exists profiles_nickname on public.profiles (nickname);

alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add  constraint profiles_bio_len check (char_length(bio) <= 60);
alter table public.profiles drop constraint if exists profiles_interests_len;
alter table public.profiles add  constraint profiles_interests_len check (cardinality(interests) <= 5);
alter table public.profiles drop constraint if exists profiles_mbti;
alter table public.profiles add  constraint profiles_mbti check (mbti is null or mbti ~ '^[EI][NS][TF][JP]$');

-- 자기 행 읽기 (정책은 self read 그대로). ★ 소개글 등은 컬럼 update 권한을 주지 않는다 —
-- 검사를 거치는 update_my_profile() 로만 바뀐다. 이름(nickname)은 아예 바꿀 수 없다.
grant select on public.profiles to authenticated;

-- 이름 후보 — 40 × 40 = 1600 조합
create or replace function private.nickname_candidate()
returns text language sql volatile as $fn$
  select (array['말랑','포근','새벽','바삭','조용','느긋','반짝','시원','담백','뭉게',
                '노란','파란','초록','보라','하얀','까만','붉은','은은','졸린','수줍은',
                '용감한','엉뚱한','다정한','배고픈','씩씩한','얌전한','꼬마','몽글','촉촉','단단',
                '동글','포슬','말간','깜찍','새침','든든','나른','산뜻','달콤','상큼'])[floor(random()*40)::int + 1]
      || (array['복숭아','고양이','달팽이','구름','수달','펭귄','자몽','토끼','라떼','북극곰',
                '해달','민트','오리','참새','여우','고래','두더지','감자','다람쥐','판다',
                '코알라','햄스터','부엉이','거북이','문어','해파리','청귤','망고','호랑이','너구리',
                '강아지','도토리','양파','치즈','마카롱','푸딩','젤리','별똥별','솜사탕','뭉치'])[floor(random()*40)::int + 1];
$fn$;

-- 계정에 고유 이름을 붙인다. 이미 있으면 그대로 돌려준다.
-- ★ 동시에 가입한 두 사람이 같은 이름을 뽑아도 유니크 인덱스 충돌을 잡아 다시 뽑는다 — 가입이 실패하지 않는다.
create or replace function private.assign_nickname(p_user uuid)
returns text language plpgsql security definer set search_path = public, private as $fn$
declare v text; i int := 0;
begin
  select nickname into v from public.profiles where id = p_user;
  if v is not null then return v; end if;
  loop
    i := i + 1;
    v := private.nickname_candidate();
    -- 조합이 붐비면 숫자를 붙인다
    if i > 5 then v := v || (floor(random() * 900) + 100)::int::text; end if;
    begin
      update public.profiles set nickname = v where id = p_user and nickname is null;
      return v;
    exception when unique_violation then
      if i >= 40 then raise; end if;
    end;
  end loop;
end
$fn$;
revoke all on function private.nickname_candidate(), private.assign_nickname(uuid) from public, anon, authenticated;

-- 가입 트리거·폴백이 이름까지 붙이도록 교체
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.profiles (id, verified)
    values (new.id, new.email_confirmed_at is not null)
    on conflict (id) do nothing;
  insert into public.user_presence (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  perform private.assign_nickname(new.id);
  return new;
end
$fn$;

create or replace function public.ensure_self()
returns void language plpgsql security definer set search_path = public as $fn$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  insert into public.profiles (id) values (me) on conflict (id) do nothing;
  insert into public.user_presence (user_id) values (me) on conflict (user_id) do nothing;
  update public.profiles p set verified = true
    where p.id = me and not p.verified
      and exists (select 1 from auth.users u
                   where u.id = me and u.email_confirmed_at is not null);
  perform private.assign_nickname(me);
end
$fn$;

-- 이미 가입해 있던 계정들에도 이름을 붙인다
do $do$
declare v uuid;
begin
  for v in select id from public.profiles where nickname is null loop
    perform private.assign_nickname(v);
  end loop;
end
$do$;

-- 내 기본 정보 수정 — 검사를 거쳐서만 바뀐다
create or replace function public.update_my_profile(p_bio text, p_interests text[], p_mbti text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  me     uuid := auth.uid();
  v_bio  text := btrim(regexp_replace(coalesce(p_bio, ''), '\s+', ' ', 'g'));
  v_tags text[];
  v_mbti text := nullif(upper(btrim(coalesce(p_mbti, ''))), '');
  t      text;
begin
  if me is null then raise exception 'unauthenticated'; end if;

  -- 관심사: 앞뒤 공백 제거, 빈 값·중복 제거(순서 유지)
  select coalesce(array_agg(x order by o), '{}') into v_tags
    from (select distinct on (lower(x)) x, o
            from (select btrim(e) x, o from unnest(coalesce(p_interests, '{}')) with ordinality u(e, o)) s
           where x <> ''
           order by lower(x), o) d;

  if char_length(v_bio) > 60 then raise exception 'bio_too_long'; end if;
  if cardinality(v_tags) > 5 then raise exception 'too_many_interests'; end if;
  foreach t in array v_tags loop
    if char_length(t) > 12 then raise exception 'interest_too_long'; end if;
  end loop;
  if v_mbti is not null and v_mbti !~ '^[EI][NS][TF][JP]$' then raise exception 'invalid_mbti'; end if;

  -- ★ 신원이 드러나는 정보 차단 — 학번·전화번호처럼 긴 숫자, 이메일·SNS 아이디(@)
  if v_bio ~ '[0-9]{4,}' or v_bio ~ '@' or array_to_string(v_tags, ' ') ~ '[0-9]{4,}|@' then
    raise exception 'personal_info';
  end if;

  update public.profiles set bio = v_bio, interests = v_tags, mbti = v_mbti where id = me;
  return jsonb_build_object('bio', v_bio, 'interests', to_jsonb(v_tags), 'mbti', v_mbti);
end
$fn$;

-- 비밀번호가 설정됐는지 (auth.users 는 클라가 읽을 수 없으므로)
create or replace function public.my_account()
returns jsonb language sql security definer set search_path = public, auth stable as $fn$
  select jsonb_build_object('has_password', coalesce(u.encrypted_password, '') <> '')
    from auth.users u where u.id = auth.uid();
$fn$;


-- ── 28. 온라인 표시 ─────────────────────────────────────────────────
-- 앱이 화면에 떠 있는 동안 30초마다 부른다. 백그라운드로 가면 p_online = false 로 한 번.
-- ★ user_presence 는 여전히 정책 0개. 상대가 아는 것은 "같은 방 상대가 지금 켜져 있는가" 한 비트뿐.
create or replace function public.heartbeat(p_online boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare cfg public.app_settings%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select * into cfg from public.app_settings where id;
  if p_online then
    update public.user_presence
       set online_until = greatest(online_until, now() + make_interval(secs => cfg.online_ttl_sec))
     where user_id = auth.uid();
  else
    -- 앱을 내려놓으면 오프라인 + 찾기 중단 (폰을 내려놓은 사람에게 매칭이 가지 않게)
    update public.user_presence
       set online_until = now(), seeking_until = null, seeking_since = null
     where user_id = auth.uid();
  end if;
  return jsonb_build_object('server_now', now());
end
$fn$;


-- ── 29. 대화 목록 · 상대 프로필 ─────────────────────────────────────
-- 내 열린 대화 전부. ★ 방마다 room_id 외의 uuid 는 없다.
create or replace function public.my_rooms()
returns jsonb language sql security definer set search_path = public stable as $fn$
  select jsonb_build_object(
    'rooms', coalesce(jsonb_agg(to_jsonb(x) - 'sort_at' order by x.sort_at desc), '[]'::jsonb),
    'server_now', now())
  from (
    select r.id as room_id, r.status, rm.seat as my_seat,
           case when rm.seat = 1 then r.alias2 else r.alias1 end as partner_alias,
           r.expires_at, r.round,
           rm.joined_at is not null as joined,
           coalesce(up.online_until > now(), false) as partner_online,
           lm.body as last_body, lm.sender_seat as last_seat, lm.created_at as last_at,
           (select count(*) from public.messages m
             where m.room_id = r.id and m.sender_seat not in (0, rm.seat)
               and m.id > coalesce(case when rm.seat = 1 then r.read1 else r.read2 end, 0))::int as unread,
           coalesce(lm.created_at, r.created_at) as sort_at
      from public.room_members rm
      join public.rooms r on r.id = rm.room_id
      join public.room_members o on o.room_id = r.id and o.seat <> rm.seat
      left join public.user_presence up on up.user_id = o.user_id
      left join lateral (select body, sender_seat, created_at from public.messages
                          where room_id = r.id order by id desc limit 1) lm on true
     where rm.user_id = auth.uid() and rm.open
       and r.status <> 'closed' and now() < r.expires_at
  ) x;
$fn$;

-- 대화 상대의 기본 정보. 같은 방에 있었던 사람만 볼 수 있다(대화가 끝난 뒤 신고 화면에서도).
create or replace function public.partner_profile(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $fn$
declare s smallint; v jsonb;
begin
  s := public.my_seat(p_room);
  if s is null then raise exception 'not_member'; end if;
  select jsonb_build_object(
           'nickname',  case when s = 1 then r.alias2 else r.alias1 end,
           'bio',       p.bio,
           'interests', to_jsonb(p.interests),
           'mbti',      p.mbti,
           'online',    coalesce(up.online_until > now(), false))
    into v
    from public.rooms r
    join public.room_members o on o.room_id = r.id and o.seat <> s
    join public.profiles p on p.id = o.user_id
    left join public.user_presence up on up.user_id = o.user_id
   where r.id = p_room;
  return v;
end
$fn$;

revoke all on function public.update_my_profile(text, text[], text), public.my_account(),
                       public.heartbeat(boolean), public.my_rooms(), public.partner_profile(uuid)
  from public, anon;
grant execute on function public.update_my_profile(text, text[], text), public.my_account(),
                          public.heartbeat(boolean), public.my_rooms(), public.partner_profile(uuid)
  to authenticated;


-- ════════════════════════════════════════════════════════════════════
--  Phase 9 — 새 메시지 푸시 알림
--
--  흐름: 보낸 사람 앱이 메시지 저장에 성공하면 /api/push 에 message_id 만 알린다.
--        서버(Worker)가 보낸 사람을 JWT 로 확인한 뒤 push_payload() 로
--        "받는 사람이 앱을 안 보고 있으면" 그 사람의 기기 목록과 알림 문구를 받아 보낸다.
--  ★ 구독 정보(기기 주소·키)는 정책 0개 — 클라는 자기 것을 저장·삭제만 할 수 있고 읽을 수 없다.
--  ★ 같은 메시지로는 한 번만 보낸다 (private.push_log) — 조작된 앱이 알림을 반복시키지 못한다.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create table if not exists private.push_log (
  message_id bigint primary key,
  created_at timestamptz not null default now()
);
alter table private.push_log enable row level security;

-- 이 기기로 알림 받기. 같은 기기에서 다른 계정으로 로그인하면 주인이 바뀐다.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  -- ★ 알려진 푸시 서버 주소만 (Phase 22 보안 점검) — 아무 https 주소나 받으면 서버(Worker)가 그 주소로
  --   요청을 보내게 만들 수 있다. 구글(FCM: 크롬·안드로이드·삼성) · 애플(사파리·아이폰) · 모질라(파이어폭스) · 윈도(엣지)
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'
     or char_length(p_endpoint) > 1000
     or char_length(coalesce(p_p256dh, '')) not between 80 and 100
     or char_length(coalesce(p_auth, '')) not between 16 and 32 then
    raise exception 'invalid_subscription';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
     set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  -- 한 사람 기기 10대까지 — 넘으면 오래된 것부터 지운다 (알림 한 번에 수백 곳으로 보내게 만들지 못하게)
  delete from public.push_subscriptions
   where user_id = auth.uid()
     and endpoint not in (select endpoint from public.push_subscriptions
                           where user_id = auth.uid() order by created_at desc limit 10);
end
$fn$;

-- 알림 끄기 · 로그아웃. 내 것만 지운다.
create or replace function public.delete_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end
$fn$;

revoke all on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text)
  from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text)
  to authenticated;

-- ★ service_role 전용 — 알림을 보낼지, 누구에게, 무슨 문구로.
--   p_sender 는 서버가 JWT 로 확인한 보낸 사람. 그 사람이 실제로 보낸 메시지일 때만 동작한다.
-- 받는 사람의 알림 대상 — 채팅 메시지 · 편지 댓글 · 공감 알림이 같이 쓴다.
--   지금 앱을 보고 있으면 보내지 않는다(앱 안에서 이미 보인다) → { skip: 'online' }
--   알림을 켠 기기가 없으면 → { skip: 'no_device' },  있으면 → { subs: [{endpoint, p256dh, auth}, …] }
create or replace function private.push_target(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare v_subs jsonb;
begin
  if exists (select 1 from public.user_presence where user_id = p_user and online_until > now()) then
    return jsonb_build_object('skip', 'online');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]'::jsonb)
    into v_subs from public.push_subscriptions where user_id = p_user;
  if jsonb_array_length(v_subs) = 0 then return jsonb_build_object('skip', 'no_device'); end if;
  return jsonb_build_object('subs', v_subs);
end
$fn$;
revoke all on function private.push_target(uuid) from public, anon, authenticated;

create or replace function public.push_payload(p_message bigint, p_sender uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare
  m        public.messages%rowtype;
  r        public.rooms%rowtype;
  v_seat   smallint;
  v_to     uuid;
  v_subs   jsonb;
begin
  select * into m from public.messages where id = p_message;
  if not found or m.sender_seat = 0 then return jsonb_build_object('skip', 'no_message'); end if;
  select seat into v_seat from public.room_members where room_id = m.room_id and user_id = p_sender;
  if v_seat is null or v_seat <> m.sender_seat then return jsonb_build_object('skip', 'not_sender'); end if;
  if m.created_at < now() - interval '2 minutes' then return jsonb_build_object('skip', 'stale'); end if;
  select * into r from public.rooms where id = m.room_id;
  if r.status = 'closed' then return jsonb_build_object('skip', 'closed'); end if;

  -- 한 메시지에 한 번만
  insert into private.push_log (message_id) values (p_message) on conflict do nothing;
  if not found then return jsonb_build_object('skip', 'already'); end if;

  select user_id into v_to from public.room_members where room_id = m.room_id and seat <> m.sender_seat;
  v_subs := private.push_target(v_to);          -- 앱을 보고 있거나 기기가 없으면 { skip }
  if v_subs ? 'skip' then return v_subs; end if;
  v_subs := v_subs -> 'subs';

  -- ★ 알림 문구에 uuid 는 없다. 제목 = 받는 사람이 보는 상대 이름(보낸 사람의 익명 이름).
  return jsonb_build_object(
    'title',   case when m.sender_seat = 1 then r.alias1 else r.alias2 end,
    'body',    left(m.body, 120),
    'room_id', m.room_id,
    'subs',    v_subs);
end
$fn$;

-- 푸시 서버가 "없는 기기"(404/410)라고 답한 구독을 지운다
create or replace function public.push_prune(p_endpoints text[])
returns void language sql security definer set search_path = public as $fn$
  delete from public.push_subscriptions where endpoint = any(p_endpoints);
$fn$;

revoke all on function public.push_payload(bigint, uuid), public.push_prune(text[]) from public, anon, authenticated;
grant execute on function public.push_payload(bigint, uuid), public.push_prune(text[]) to service_role;

-- 발송 기록은 하루면 충분 (중복 방지용)
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'simbun-purge-push';
    perform cron.schedule('simbun-purge-push', '47 4 * * *',
      $q$delete from private.push_log where created_at < now() - interval '1 day'$q$);
  end if;
end
$do$;


-- ════════════════════════════════════════════════════════════════════
--  Phase 10 — 익명편지
--
--  채팅과 다른 두 번째 기능: 누구나 스크롤하며 읽는 공개 익명 게시판 + 댓글·대댓글(2단계).
--  공개 게시판은 "아무도 답을 안 한다"가 가장 큰 실패 모드라, 매칭으로 편지마다
--  "지정 답장자" 1명을 붙인다. 두 사람을 짝짓는 채팅 매칭과 달리 여기는
--  "답장하고 싶은 사람" 을 "아직 아무도 맡지 않은 편지" 에 배정하는 큐 소비 구조다.
--
--  ★ 익명성 — 채팅과 경계가 다르다
--    · 본문은 원래 전교생 공개용이다. 그래서 letters / letter_comments 는 누구나 읽는다.
--    · 대신 본문과 계정을 잇는 통로를 없앤다: 두 테이블에는 식별 컬럼이 없고
--      (author_no = 그 편지 안에서만 의미 있는 번호), 실제 user_id 는 letter_participants 에만
--      있으며 그 테이블은 자기 행만 읽힌다 (room_members 와 같은 급소).
--    · 이름은 "편지 1개 × 계정 1개" 마다 새로 뽑는다. 한 편지 안에서는 같은 이름(OP 표시 가능),
--      다른 편지에서는 완전히 다른 이름. 계정 고정 닉네임(profiles.nickname)은 절대 쓰지 않는다 —
--      전교생이 보는 게시판에서 이름이 고정되면 활동이 쌓여 신원이 특정된다.
--    · 편지 이름은 "형용사 + 공백 + 명사" (예: 푸른 우표). 채팅 닉네임엔 공백이 없으므로
--      두 이름 공간이 절대 겹치지 않는다 → 편지 이름을 보고 채팅 상대를 떠올릴 일이 없다.
--  ★ 쓰기는 전부 RPC 로만. letters / letter_comments 에는 insert 정책이 없다.
--  ★ 차단(blocks)은 채팅과 공유, 재배정 쿨다운(letter_reply_cooldown)은 편지 전용.
-- ════════════════════════════════════════════════════════════════════

alter table public.app_settings add column if not exists letter_max_len              int  not null default 500;
alter table public.app_settings add column if not exists comment_max_len             int  not null default 300;
alter table public.app_settings add column if not exists letter_burst                real not null default 3;
alter table public.app_settings add column if not exists letter_refill_per_sec       real not null default 0.0000347;  -- 하루에 3통 분량이 채워진다
alter table public.app_settings add column if not exists comment_burst               real not null default 10;
alter table public.app_settings add column if not exists comment_refill_per_sec      real not null default 0.5;
alter table public.app_settings add column if not exists letter_task_burst           real not null default 6;
alter table public.app_settings add column if not exists letter_task_refill_sec      real not null default 10;
alter table public.app_settings add column if not exists letter_reply_cooldown_days  int  not null default 7;
alter table public.app_settings add column if not exists letter_reply_deadline_hours int  not null default 48;
alter table public.app_settings add column if not exists letter_feed_page_size       int  not null default 20;
alter table public.app_settings add column if not exists letter_auto_suspend_reports int  not null default 3;
alter table public.app_settings drop constraint if exists app_settings_letter_lens;
alter table public.app_settings add  constraint app_settings_letter_lens
  check (letter_max_len between 20 and 1000 and comment_max_len between 10 and 500);

-- 토큰 버킷 3종 (편지 쓰기 · 댓글 · 답장할 편지 받기)
alter table public.user_presence add column if not exists letter_tokens  real        not null default 3;
alter table public.user_presence add column if not exists letter_at      timestamptz not null default now();
alter table public.user_presence add column if not exists comment_tokens real        not null default 10;
alter table public.user_presence add column if not exists comment_at     timestamptz not null default now();
alter table public.user_presence add column if not exists task_tokens    real        not null default 6;
alter table public.user_presence add column if not exists task_at        timestamptz not null default now();


-- ── 30. 편지 · 참여자 · 댓글 ────────────────────────────────────────
create table if not exists public.letters (
  id                          bigint generated always as identity primary key,
  body                        text not null check (char_length(btrim(body)) between 1 and 1000),
  status                      text not null default 'open' check (status in ('open','removed')),
  reply_status                text not null default 'unassigned'
                              check (reply_status in ('unassigned','assigned','replied')),
  designated_reply_comment_id bigint,
  created_at                  timestamptz not null default now()
);
-- ★ 식별 컬럼이 없다. 작성자는 letter_participants 의 participant_no = 1.
-- 서식(굵게·형광펜 등)은 본문과 따로 — {"m": [[시작, 끝, 종류]...], "a": [[줄, 정렬]...]} (private.letter_fmt_ok)
alter table public.letters add column if not exists fmt jsonb;
create index if not exists letters_feed  on public.letters (id desc) where status = 'open';
create index if not exists letters_queue on public.letters (created_at) where status = 'open' and reply_status <> 'replied';

create table if not exists public.letter_participants (
  letter_id      bigint   not null references public.letters(id) on delete cascade,
  participant_no smallint not null,          -- 1 = 작성자, 이후 처음 말한 순서
  user_id        uuid     not null references public.profiles(id) on delete cascade,
  alias          text     not null,
  is_author      boolean  not null default false,
  created_at     timestamptz not null default now(),
  primary key (letter_id, participant_no),
  unique (letter_id, user_id),
  unique (letter_id, alias)
);
create index if not exists letter_participants_user on public.letter_participants (user_id);

create table if not exists public.letter_comments (
  id                bigint generated always as identity primary key,
  letter_id         bigint   not null references public.letters(id) on delete cascade,
  parent_comment_id bigint   references public.letter_comments(id) on delete cascade,  -- null = 최상위
  author_no         smallint not null,
  body              text     not null check (char_length(btrim(body)) between 1 and 500),
  status            text     not null default 'visible' check (status in ('visible','removed')),
  client_comment_id uuid     not null,
  created_at        timestamptz not null default now(),
  foreign key (letter_id, author_no) references public.letter_participants (letter_id, participant_no)
);
-- ★ 식별 컬럼이 없다. author_no 는 그 편지 안에서만 의미 있는 번호.
create unique index if not exists letter_comments_dedupe on public.letter_comments (letter_id, client_comment_id);
create index        if not exists letter_comments_thread on public.letter_comments (letter_id, id);

do $do$
begin
  alter table public.letters add constraint letters_designated_reply_fk
    foreign key (designated_reply_comment_id) references public.letter_comments(id) on delete set null;
exception when duplicate_object then null;
end
$do$;

-- 매칭 큐가 만든 "답장 숙제". 편지 1개에 답장자 1명 (PK = letter_id).
create table if not exists public.letter_reply_assignments (
  letter_id    bigint primary key references public.letters(id) on delete cascade,
  reader_id    uuid   not null references public.profiles(id) on delete cascade,
  assigned_at  timestamptz not null default now(),
  expires_at   timestamptz not null,
  fulfilled_at timestamptz,
  comment_id   bigint references public.letter_comments(id) on delete set null
);
create index if not exists letter_assign_reader on public.letter_reply_assignments (reader_id) where fulfilled_at is null;

-- 편지 전용 재배정 쿨다운 — 채팅의 pair_history 와 모양은 같지만 완전히 따로 쓴다
create table if not exists public.letter_reply_cooldown (
  user_lo          uuid not null references public.profiles(id) on delete cascade,
  user_hi          uuid not null references public.profiles(id) on delete cascade,
  last_assigned_at timestamptz not null default now(),
  times            int not null default 1,
  primary key (user_lo, user_hi),
  check (user_lo < user_hi)
);

-- ── 31. RLS — 본문은 공개, 신원 연결 고리는 자기 행만 ────────────────
alter table public.letters enable row level security;
drop policy if exists "letters: public read" on public.letters;
create policy "letters: public read" on public.letters
  for select to authenticated using (status = 'open');
revoke all on public.letters from anon, authenticated;
grant select on public.letters to authenticated;

alter table public.letter_comments enable row level security;
drop policy if exists "letter_comments: public read" on public.letter_comments;
create policy "letter_comments: public read" on public.letter_comments
  for select to authenticated using (status = 'visible');
revoke all on public.letter_comments from anon, authenticated;
grant select on public.letter_comments to authenticated;

alter table public.letter_participants enable row level security;
drop policy if exists "letter_participants: self read only" on public.letter_participants;
create policy "letter_participants: self read only" on public.letter_participants
  for select to authenticated using (user_id = auth.uid());
-- ★ 편지 쪽 급소. "같은 편지 참여자 전부 읽기"로 바꾸는 순간 공개 글과 계정이 이어진다.
revoke all on public.letter_participants from anon, authenticated;
grant select on public.letter_participants to authenticated;

alter table public.letter_reply_assignments enable row level security;
drop policy if exists "letter_assign: self read" on public.letter_reply_assignments;
create policy "letter_assign: self read" on public.letter_reply_assignments
  for select to authenticated using (reader_id = auth.uid());
revoke all on public.letter_reply_assignments from anon, authenticated;
grant select on public.letter_reply_assignments to authenticated;

alter table public.letter_reply_cooldown enable row level security;
revoke all on public.letter_reply_cooldown from anon, authenticated;   -- 정책 0개

-- 하트 — 누가 눌렀는지는 private 에만 둔다. 화면에는 개수와 "내가 눌렀는지"만 간다 (작성자도 누가 눌렀는지 모른다).
create table if not exists private.letter_likes (
  letter_id  bigint not null references public.letters(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (letter_id, user_id)
);
create index if not exists letter_likes_user on private.letter_likes (user_id);
alter table private.letter_likes enable row level security;


-- ── 32. 헬퍼 ────────────────────────────────────────────────────────
-- 편지 이름 후보 — "형용사 명사" (공백 포함 → 채팅 닉네임 공간과 절대 겹치지 않음)
create or replace function private.letter_alias_candidate()
returns text language sql volatile as $fn$
  select (array['푸른','조용한','따뜻한','수줍은','느린','작은','먼','흐린','맑은','졸린',
                '낯선','다정한','서툰','오래된','새하얀','깊은','가벼운','둥근','비밀스런','차분한',
                '설레는','고요한','반짝이는','포근한','아득한','투명한','엉성한','느긋한','선선한','부드러운'])[floor(random()*30)::int + 1]
      || ' ' ||
         (array['우표','편지지','우체통','등대','엽서','봉투','연필','잉크','창문','가로등',
                '종이배','별빛','달빛','바람','구름','파도','새벽','오후','계절','첫눈',
                '벚꽃','낙엽','모래','시계','책갈피','풍선','기차','정류장','골목','담벼락'])[floor(random()*30)::int + 1];
$fn$;

-- 이 편지에서 이 계정의 이름·번호. 이미 있으면 그대로(멱등), 없으면 새로 뽑는다.
-- 편지 행을 잠가 번호 계산을 직렬화한다 (ack_room 의 for update 와 같은 방식).
create or replace function private.assign_letter_alias(p_letter bigint, p_user uuid, p_is_author boolean)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare v public.letter_participants%rowtype; v_no smallint; v_alias text; i int := 0;
begin
  select * into v from public.letter_participants where letter_id = p_letter and user_id = p_user;
  if found then return jsonb_build_object('no', v.participant_no, 'alias', v.alias); end if;

  perform 1 from public.letters where id = p_letter for update;
  select * into v from public.letter_participants where letter_id = p_letter and user_id = p_user;
  if found then return jsonb_build_object('no', v.participant_no, 'alias', v.alias); end if;

  select coalesce(max(participant_no), 0) + 1 into v_no from public.letter_participants where letter_id = p_letter;
  loop
    i := i + 1;
    v_alias := private.letter_alias_candidate();
    if i > 8 then v_alias := v_alias || ' ' || (floor(random() * 90) + 10)::int::text; end if;
    exit when not exists (select 1 from public.letter_participants where letter_id = p_letter and alias = v_alias);
    if i > 40 then raise exception 'alias_exhausted'; end if;
  end loop;

  insert into public.letter_participants (letter_id, participant_no, user_id, alias, is_author)
  values (p_letter, v_no, p_user, v_alias, p_is_author);
  return jsonb_build_object('no', v_no, 'alias', v_alias);
end
$fn$;

-- 편지 쪽 토큰 버킷 3종. msg_rate_limit / match_bucket_take 와 같은 O(1) 행 잠금 방식.
create or replace function private.letter_bucket_take(p_user uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare cfg public.app_settings%rowtype; v_tokens real; v_burst real; v_rate real;
begin
  select * into cfg from public.app_settings where id;
  if p_kind = 'letter' then
    v_burst := cfg.letter_burst; v_rate := cfg.letter_refill_per_sec;
    select least(v_burst, letter_tokens + extract(epoch from (now() - letter_at)) * v_rate)
      into v_tokens from public.user_presence where user_id = p_user for update;
  elsif p_kind = 'comment' then
    v_burst := cfg.comment_burst; v_rate := cfg.comment_refill_per_sec;
    select least(v_burst, comment_tokens + extract(epoch from (now() - comment_at)) * v_rate)
      into v_tokens from public.user_presence where user_id = p_user for update;
  elsif p_kind = 'task' then
    v_burst := cfg.letter_task_burst; v_rate := 1.0 / cfg.letter_task_refill_sec;
    select least(v_burst, task_tokens + extract(epoch from (now() - task_at)) * v_rate)
      into v_tokens from public.user_presence where user_id = p_user for update;
  else
    raise exception 'invalid_bucket';
  end if;
  if v_tokens is null then raise exception 'unauthenticated'; end if;
  if v_tokens < 1 then
    return jsonb_build_object('ok', false, 'retry_after_ms', ceil((1 - v_tokens) / v_rate * 1000));
  end if;
  if p_kind = 'letter' then
    update public.user_presence set letter_tokens = v_tokens - 1, letter_at = now() where user_id = p_user;
  elsif p_kind = 'comment' then
    update public.user_presence set comment_tokens = v_tokens - 1, comment_at = now() where user_id = p_user;
  else
    update public.user_presence set task_tokens = v_tokens - 1, task_at = now() where user_id = p_user;
  end if;
  return jsonb_build_object('ok', true);
end
$fn$;

-- 편지를 쓰고 읽을 자격 — request_match 와 같은 게이트
create or replace function private.letter_eligible(p_user uuid)
returns text language plpgsql security definer set search_path = public, private stable as $fn$
declare cfg public.app_settings%rowtype; m public.profiles%rowtype;
begin
  if p_user is null then raise exception 'unauthenticated'; end if;
  select * into cfg from public.app_settings where id;
  if not cfg.is_open then return 'service_closed'; end if;
  select * into m from public.profiles where id = p_user;
  if not found or not m.verified or not m.onboarded or m.status <> 'active'
     or (m.suspended_until is not null and m.suspended_until > now()) then
    return 'not_eligible';
  end if;
  return null;
end
$fn$;

-- 두 사람 사이에 차단이 있는가 (어느 쪽이 했든)
create or replace function private.blocked_between(a uuid, b uuid)
returns boolean language sql security definer set search_path = public stable as $fn$
  select exists (select 1 from public.blocks
                  where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$fn$;

-- 편지 작성자 (participant_no = 1)
create or replace function private.letter_author(p_letter bigint)
returns uuid language sql security definer set search_path = public stable as $fn$
  select user_id from public.letter_participants where letter_id = p_letter and participant_no = 1;
$fn$;

-- 피드에 보여도 되는 편지인가: 열려 있고, 작성자가 정상이고, 나와 차단 관계가 없다
create or replace function private.letter_visible_to(p_letter bigint, p_user uuid)
returns boolean language sql security definer set search_path = public, private stable as $fn$
  select exists (
    select 1 from public.letters l
      join public.letter_participants a on a.letter_id = l.id and a.participant_no = 1
      join public.profiles p on p.id = a.user_id
     where l.id = p_letter and l.status = 'open'
       and p.status = 'active' and (p.suspended_until is null or p.suspended_until <= now())
       and not private.blocked_between(a.user_id, p_user));
$fn$;

revoke all on function private.letter_alias_candidate(), private.assign_letter_alias(bigint, uuid, boolean),
                       private.letter_bucket_take(uuid, text), private.letter_eligible(uuid),
                       private.blocked_between(uuid, uuid), private.letter_author(bigint),
                       private.letter_visible_to(bigint, uuid)
  from public, anon, authenticated;


-- ── 33. 읽기 RPC ────────────────────────────────────────────────────
-- 피드 한 페이지. ★ uuid 는 없다. 이름은 편지마다 새로 뽑은 것.
create or replace function public.letter_feed(p_cursor bigint default null, p_limit int default null)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare me uuid := auth.uid(); cfg public.app_settings%rowtype; v jsonb;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into cfg from public.app_settings where id;
  select coalesce(jsonb_agg(x order by x.id desc), '[]'::jsonb) into v from (
    select l.id, left(l.body, 280) as body, l.fmt, char_length(l.body) > 280 as truncated,
           a.alias as author_alias, a.user_id = me as is_mine, l.reply_status, l.created_at,
           (select count(*) from private.letter_likes k where k.letter_id = l.id)::int as like_count,
           exists (select 1 from private.letter_likes k where k.letter_id = l.id and k.user_id = me) as liked,
           (select count(*) from public.letter_comments c
             where c.letter_id = l.id and c.status = 'visible')::int as comment_count,
           exists (select 1 from public.letter_reply_assignments r
                    where r.letter_id = l.id and r.reader_id = me and r.fulfilled_at is null) as assigned_to_me
      from public.letters l
      join public.letter_participants a on a.letter_id = l.id and a.participant_no = 1
      join public.profiles p on p.id = a.user_id
     where l.status = 'open'
       and (p_cursor is null or l.id < p_cursor)
       and p.status = 'active' and (p.suspended_until is null or p.suspended_until <= now())
       and not private.blocked_between(a.user_id, me)
     order by l.id desc
     limit least(coalesce(p_limit, cfg.letter_feed_page_size), 50)
  ) x;
  return jsonb_build_object('letters', v, 'server_now', now());
end
$fn$;

-- 편지 하나 + 댓글 전부(평면 목록, 클라가 한 단계만 묶는다).
-- 차단 관계인 사람의 댓글은 내용을 가리고, 지워진 댓글은 답글이 있을 때만 자리를 남긴다.
create or replace function public.letter_detail(p_letter bigint)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare me uuid := auth.uid(); l public.letters%rowtype; v_author public.letter_participants%rowtype;
        v_mine public.letter_participants%rowtype; v_comments jsonb; v_task public.letter_reply_assignments%rowtype;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not private.letter_visible_to(p_letter, me) then
    return jsonb_build_object('letter', null, 'server_now', now());
  end if;
  select * into l from public.letters where id = p_letter;
  select * into v_author from public.letter_participants where letter_id = p_letter and participant_no = 1;
  select * into v_mine from public.letter_participants where letter_id = p_letter and user_id = me;
  select * into v_task from public.letter_reply_assignments where letter_id = p_letter;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'parent_id', c.parent_comment_id,
           'author_alias', case when c.status = 'removed' then null else pp.alias end,
           'is_op', c.author_no = 1,
           'is_mine', pp.user_id = me,
           'is_designated', c.id = l.designated_reply_comment_id,
           'hidden', case when c.status = 'removed' then 'removed'
                          when private.blocked_between(pp.user_id, me) then 'blocked' end,
           'body', case when c.status = 'removed' or private.blocked_between(pp.user_id, me)
                        then null else c.body end,
           'created_at', c.created_at) order by c.id), '[]'::jsonb)
    into v_comments
    from public.letter_comments c
    join public.letter_participants pp on pp.letter_id = c.letter_id and pp.participant_no = c.author_no
   where c.letter_id = p_letter
     and (c.status = 'visible'
          or exists (select 1 from public.letter_comments k
                      where k.parent_comment_id = c.id and k.status = 'visible'));

  return jsonb_build_object(
    'letter', jsonb_build_object(
      'id', l.id, 'body', l.body, 'fmt', l.fmt, 'author_alias', v_author.alias, 'is_mine', v_author.user_id = me,
      'reply_status', l.reply_status, 'created_at', l.created_at,
      'like_count', (select count(*) from private.letter_likes k where k.letter_id = l.id),
      'liked', exists (select 1 from private.letter_likes k where k.letter_id = l.id and k.user_id = me),
      'assigned_to_me', v_task.reader_id = me and v_task.fulfilled_at is null,
      'task_expires_at', case when v_task.reader_id = me then v_task.expires_at end),
    'comments', v_comments,
    'my_alias', v_mine.alias,
    'server_now', now());
end
$fn$;


-- ── 34. 쓰기 RPC ────────────────────────────────────────────────────
-- 편지 서식 검사. 화면은 이 목록에 있는 종류·색·크기만 그린다(src/lib/letters/rich.ts) — 여기서 한 번 더 막는다.
--   m: [[시작, 끝, 종류]...]  글자(code point) 위치, 끝은 포함 안 함, 0 <= 시작 < 끝 <= 본문 길이
--   a: [[줄 번호, 'center'|'right']...]  줄 번호는 본문의 줄 수보다 작아야 함
create or replace function private.letter_fmt_ok(f jsonb, p_body text) returns boolean
language plpgsql immutable as $fn$
declare n int := char_length(p_body);
        v_lines int := char_length(p_body) - char_length(replace(p_body, E'\n', '')) + 1;
        e jsonb; k text;
begin
  if f is null then return true; end if;
  if jsonb_typeof(f) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(f) loop
    if k not in ('m', 'a') then return false; end if;
  end loop;
  if f ? 'm' then
    if jsonb_typeof(f->'m') <> 'array' or jsonb_array_length(f->'m') > 500 then return false; end if;
    for e in select value from jsonb_array_elements(f->'m') loop
      if jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 3 then return false; end if;
      if jsonb_typeof(e->0) <> 'number' or jsonb_typeof(e->1) <> 'number' or jsonb_typeof(e->2) <> 'string' then
        return false;
      end if;
      if (e->>0) !~ '^\d{1,5}$' or (e->>1) !~ '^\d{1,5}$' then return false; end if;
      if (e->>0)::int >= (e->>1)::int or (e->>1)::int > n then return false; end if;
      if (e->>2) !~ '^(b|i|u|s|h:(yellow|green|blue|pink|orange)|c:(red|orange|green|blue|purple|gray)|z:(sm|lg|xl))$' then
        return false;
      end if;
    end loop;
  end if;
  if f ? 'a' then
    if jsonb_typeof(f->'a') <> 'array' or jsonb_array_length(f->'a') > 500 then return false; end if;
    for e in select value from jsonb_array_elements(f->'a') loop
      if jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 2 then return false; end if;
      if jsonb_typeof(e->0) <> 'number' or (e->>0) !~ '^\d{1,5}$' then return false; end if;
      if (e->>0)::int >= v_lines or (e->>1) is null or (e->>1) not in ('center', 'right') then return false; end if;
    end loop;
  end if;
  return true;
end
$fn$;
revoke all on function private.letter_fmt_ok(jsonb, text) from public, anon, authenticated;

-- 서식이 생기며 인자가 늘었다 — 옛 한 인자 버전을 지워 두 버전이 헷갈리지 않게
drop function if exists public.post_letter(text);
create or replace function public.post_letter(p_body text, p_fmt jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); cfg public.app_settings%rowtype; v_gate text; v_b jsonb;
        v_body text := btrim(coalesce(p_body, '')); v_id bigint; v_alias jsonb;
        v_fmt jsonb := case when p_fmt is null or p_fmt = '{}'::jsonb or jsonb_typeof(p_fmt) = 'null' then null else p_fmt end;
begin
  v_gate := private.letter_eligible(me);
  if v_gate is not null then
    select * into cfg from public.app_settings where id;
    return jsonb_build_object('status', v_gate, 'notice', cfg.notice);
  end if;
  select * into cfg from public.app_settings where id;
  if char_length(v_body) = 0 then raise exception 'empty_body'; end if;
  if char_length(v_body) > cfg.letter_max_len then raise exception 'too_long'; end if;
  -- 서식 위치는 본문 기준이라, 앞뒤 공백이 잘려 나가면 어긋난다 — 클라가 미리 잘라서 보낸다
  if v_fmt is not null and (v_body <> p_body or not private.letter_fmt_ok(v_fmt, v_body)) then
    raise exception 'bad_format';
  end if;

  v_b := private.letter_bucket_take(me, 'letter');
  if not (v_b->>'ok')::boolean then
    return jsonb_build_object('status', 'rate_limited', 'retry_after_ms', (v_b->>'retry_after_ms')::bigint);
  end if;

  insert into public.letters (body, fmt) values (v_body, v_fmt) returning id into v_id;
  v_alias := private.assign_letter_alias(v_id, me, true);
  return jsonb_build_object('status', 'ok', 'letter_id', v_id, 'alias', v_alias->>'alias');
end
$fn$;

-- 댓글 · 대댓글. p_parent 가 있으면 대댓글이며, 그 부모는 반드시 최상위 댓글이어야 한다 (2단계).
-- 지정 답장자가 쓴 첫 최상위 댓글이 곧 "답장" — 편지 상태를 replied 로 바꾸고 쿨다운을 남긴다.
create or replace function public.post_comment(p_letter bigint, p_parent bigint, p_body text, p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); cfg public.app_settings%rowtype; v_gate text; v_b jsonb;
        v_body text := btrim(coalesce(p_body, '')); par public.letter_comments%rowtype;
        v_alias jsonb; v_id bigint; v_task public.letter_reply_assignments%rowtype;
        v_author uuid; v_designated boolean := false; v_existing bigint;
begin
  v_gate := private.letter_eligible(me);
  if v_gate is not null then return jsonb_build_object('status', v_gate); end if;
  select * into cfg from public.app_settings where id;
  if char_length(v_body) = 0 then raise exception 'empty_body'; end if;
  if char_length(v_body) > cfg.comment_max_len then raise exception 'too_long'; end if;
  if p_client_id is null then raise exception 'client_id_required'; end if;

  if not private.letter_visible_to(p_letter, me) then return jsonb_build_object('status', 'closed'); end if;

  -- 재전송(타임아웃 뒤 다시 누름) — 이미 들어갔으면 그 댓글을 돌려준다
  select id into v_existing from public.letter_comments where letter_id = p_letter and client_comment_id = p_client_id;
  if v_existing is not null then
    return jsonb_build_object('status', 'duplicate', 'comment_id', v_existing);
  end if;

  if p_parent is not null then
    select * into par from public.letter_comments where id = p_parent;
    if not found or par.letter_id <> p_letter or par.status <> 'visible' then
      return jsonb_build_object('status', 'parent_missing');
    end if;
    if par.parent_comment_id is not null then
      return jsonb_build_object('status', 'max_depth_exceeded');
    end if;
  end if;

  v_b := private.letter_bucket_take(me, 'comment');
  if not (v_b->>'ok')::boolean then
    return jsonb_build_object('status', 'rate_limited', 'retry_after_ms', (v_b->>'retry_after_ms')::bigint);
  end if;

  v_author := private.letter_author(p_letter);
  v_alias := private.assign_letter_alias(p_letter, me, me = v_author);
  insert into public.letter_comments (letter_id, parent_comment_id, author_no, body, client_comment_id)
  values (p_letter, p_parent, (v_alias->>'no')::smallint, v_body, p_client_id)
  returning id into v_id;

  -- 지정 답장자의 첫 최상위 댓글 → 답장 완료
  if p_parent is null then
    select * into v_task from public.letter_reply_assignments
     where letter_id = p_letter and reader_id = me and fulfilled_at is null for update;
    if found then
      update public.letter_reply_assignments set fulfilled_at = now(), comment_id = v_id where letter_id = p_letter;
      update public.letters set reply_status = 'replied', designated_reply_comment_id = v_id where id = p_letter;
      insert into public.letter_reply_cooldown (user_lo, user_hi)
      values (least(me, v_author), greatest(me, v_author))
      on conflict (user_lo, user_hi) do update
         set last_assigned_at = now(), times = public.letter_reply_cooldown.times + 1;
      v_designated := true;
    end if;
  end if;

  return jsonb_build_object('status', 'ok', 'comment_id', v_id, 'my_alias', v_alias->>'alias',
                            'designated', v_designated);
end
$fn$;

-- 내 글 지우기 (소프트 삭제). 신고 증거는 신고 순간 이미 복사되어 있다.
create or replace function public.delete_my_letter(p_letter bigint)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if private.letter_author(p_letter) is distinct from auth.uid() then raise exception 'not_owner'; end if;
  update public.letters set status = 'removed' where id = p_letter;
  return jsonb_build_object('status', 'ok');
end
$fn$;

create or replace function public.delete_my_comment(p_comment bigint)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare c public.letter_comments%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select * into c from public.letter_comments where id = p_comment;
  if not found or not exists (select 1 from public.letter_participants
                               where letter_id = c.letter_id and participant_no = c.author_no
                                 and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;
  update public.letter_comments set status = 'removed' where id = p_comment;
  return jsonb_build_object('status', 'ok');
end
$fn$;


-- ── 35. 답장할 편지 받기 — 큐 소비 ──────────────────────────────────
-- 채팅 request_match 는 advisory lock 하나로 풀 전체를 직렬화한다 (두 사람을 한 번에 잡아야 하므로).
-- 여기는 밀린 편지 여러 통을 여러 사람이 나눠 가져가는 큐라, 서로 다른 편지만 안 겹치면 동시에
-- 처리해도 된다 → for update skip locked. 쉬는 시간에 30명이 동시에 눌러도 한 줄로 서지 않는다.
create or replace function public.request_letter_reply_task()
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); cfg public.app_settings%rowtype; v_gate text; v_b jsonb;
        v_task public.letter_reply_assignments%rowtype; v_letter bigint; v_pool int;
begin
  v_gate := private.letter_eligible(me);
  select * into cfg from public.app_settings where id;
  if v_gate is not null then return jsonb_build_object('status', v_gate, 'notice', cfg.notice); end if;

  -- ① 이미 맡은 편지가 있으면 그것 (반복 폴링에 안전)
  select a.* into v_task from public.letter_reply_assignments a
    join public.letters l on l.id = a.letter_id
   where a.reader_id = me and a.fulfilled_at is null and a.expires_at > now() and l.status = 'open'
   limit 1;
  if found then
    return jsonb_build_object('status', 'assigned', 'letter_id', v_task.letter_id,
                              'expires_at', v_task.expires_at, 'server_now', now());
  end if;

  -- ② 큐에서 한 통. 오래 기다린 편지부터. 마감이 지난 배정은 다시 큐로 돌아온다.
  select l.id into v_letter
    from public.letters l
    join public.letter_participants a on a.letter_id = l.id and a.participant_no = 1
    join public.profiles p on p.id = a.user_id
    left join public.letter_reply_assignments r on r.letter_id = l.id
   where l.status = 'open'
     and (l.reply_status = 'unassigned'
          or (l.reply_status = 'assigned' and r.fulfilled_at is null and r.expires_at <= now()
              and r.reader_id <> me))
     and a.user_id <> me
     and p.status = 'active' and (p.suspended_until is null or p.suspended_until <= now())
     and not private.blocked_between(a.user_id, me)
     and not exists (select 1 from public.letter_reply_cooldown h
                      where h.user_lo = least(me, a.user_id) and h.user_hi = greatest(me, a.user_id)
                        and h.last_assigned_at > now() - make_interval(days => cfg.letter_reply_cooldown_days))
   order by l.created_at
   limit 1
   for update of l skip locked;

  if v_letter is null then
    select count(*) into v_pool from public.letters l
      join public.letter_participants a on a.letter_id = l.id and a.participant_no = 1
     where l.status = 'open' and l.reply_status <> 'replied' and a.user_id <> me;
    return jsonb_build_object('status', 'waiting', 'reason', case when v_pool = 0 then 'empty' else 'filtered' end,
                              'poll_ms', cfg.seek_poll_sec * 1000 * 3, 'server_now', now());
  end if;

  -- ③ 실제로 잡았을 때만 버킷 차감 (match_bucket_take 와 같은 순서)
  v_b := private.letter_bucket_take(me, 'task');
  if not (v_b->>'ok')::boolean then
    return jsonb_build_object('status', 'cooldown', 'retry_after_ms', (v_b->>'retry_after_ms')::bigint);
  end if;

  insert into public.letter_reply_assignments (letter_id, reader_id, assigned_at, expires_at)
  values (v_letter, me, now(), now() + make_interval(hours => cfg.letter_reply_deadline_hours))
  on conflict (letter_id) do update
     set reader_id = excluded.reader_id, assigned_at = excluded.assigned_at,
         expires_at = excluded.expires_at, fulfilled_at = null, comment_id = null;
  update public.letters set reply_status = 'assigned' where id = v_letter;

  return jsonb_build_object('status', 'assigned', 'letter_id', v_letter,
    'expires_at', now() + make_interval(hours => cfg.letter_reply_deadline_hours), 'server_now', now());
end
$fn$;


-- ── 36. 신고 · 차단 ─────────────────────────────────────────────────
-- 채팅 신고(private.reports)는 2인 방 구조에 맞춰 굳어 있어 따로 둔다.
create table if not exists private.letter_reports (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('letter','comment')),
  letter_id   bigint not null,       -- ★ FK 없음: 글이 지워져도 신고는 남아야 한다
  comment_id  bigint,
  reporter_id uuid not null,
  reported_id uuid not null,
  reason      text not null check (reason in
              ('harassment','sexual','spam','personal_info','hate','impersonation','other')),
  note        text not null default '',
  status      text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  handled_by  uuid,
  handled_at  timestamptz,
  action_note text,
  created_at  timestamptz not null default now()
);
alter table private.letter_reports add column if not exists source text not null default 'user' check (source in ('user','auto'));
create index if not exists letter_reports_queue    on private.letter_reports (status, created_at desc);
create index if not exists letter_reports_reported on private.letter_reports (reported_id, created_at desc);
create unique index if not exists letter_reports_once_letter
  on private.letter_reports (letter_id, reporter_id) where comment_id is null;
create unique index if not exists letter_reports_once_comment
  on private.letter_reports (comment_id, reporter_id) where comment_id is not null;
alter table private.letter_reports enable row level security;

create table if not exists private.letter_report_evidence (
  report_id uuid not null references private.letter_reports(id) on delete cascade,
  ord       int  not null,
  kind      text not null,          -- letter / parent / comment
  alias     text,
  body      text not null,
  sent_at   timestamptz not null,
  primary key (report_id, ord)
);
alter table private.letter_report_evidence enable row level security;

-- 신고 대상의 계정 (편지면 작성자, 댓글이면 댓글 작성자)
create or replace function private.letter_target_user(p_letter bigint, p_comment bigint)
returns uuid language sql security definer set search_path = public stable as $fn$
  select case when p_comment is null then
           (select user_id from public.letter_participants where letter_id = p_letter and participant_no = 1)
         else
           (select pp.user_id from public.letter_comments c
              join public.letter_participants pp on pp.letter_id = c.letter_id and pp.participant_no = c.author_no
             where c.id = p_comment and c.letter_id = p_letter)
         end;
$fn$;
revoke all on function private.letter_target_user(bigint, bigint) from public, anon, authenticated;

-- 공개 게시판이라 방 구성원 확인이 없다 — 피드를 보는 누구나 신고할 수 있다.
create or replace function public.report_letter(p_letter bigint, p_comment bigint, p_reason text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); cfg public.app_settings%rowtype; v_target uuid; v_report uuid; v_n int;
        c public.letter_comments%rowtype;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if p_reason not in ('harassment','sexual','spam','personal_info','hate','impersonation','other') then
    raise exception 'invalid_reason';
  end if;
  v_target := private.letter_target_user(p_letter, p_comment);
  if v_target is null then return jsonb_build_object('status', 'not_found'); end if;
  if v_target = me then return jsonb_build_object('status', 'self'); end if;

  if exists (select 1 from private.letter_reports
              where reporter_id = me and letter_id = p_letter
                and comment_id is not distinct from p_comment) then
    return jsonb_build_object('status', 'already');
  end if;

  select * into cfg from public.app_settings where id;
  insert into private.letter_reports (target_type, letter_id, comment_id, reporter_id, reported_id, reason, note)
  values (case when p_comment is null then 'letter' else 'comment' end,
          p_letter, p_comment, me, v_target, p_reason, left(coalesce(p_note, ''), 1000))
  returning id into v_report;

  -- 증거: 편지 본문, (대댓글이면) 부모 댓글, 신고한 댓글 — 신고 순간의 사본
  insert into private.letter_report_evidence (report_id, ord, kind, alias, body, sent_at)
  select v_report, 1, 'letter', a.alias, l.body, l.created_at
    from public.letters l
    join public.letter_participants a on a.letter_id = l.id and a.participant_no = 1
   where l.id = p_letter;
  if p_comment is not null then
    select * into c from public.letter_comments where id = p_comment;
    if c.parent_comment_id is not null then
      insert into private.letter_report_evidence (report_id, ord, kind, alias, body, sent_at)
      select v_report, 2, 'parent', pp.alias, k.body, k.created_at
        from public.letter_comments k
        join public.letter_participants pp on pp.letter_id = k.letter_id and pp.participant_no = k.author_no
       where k.id = c.parent_comment_id;
    end if;
    insert into private.letter_report_evidence (report_id, ord, kind, alias, body, sent_at)
    select v_report, 3, 'comment', pp.alias, c.body, c.created_at
      from public.letter_participants pp where pp.letter_id = c.letter_id and pp.participant_no = c.author_no;
  end if;

  -- 신고하면 자동 차단 (채팅과 같은 blocks)
  insert into public.blocks (blocker_id, blocked_id) values (me, v_target) on conflict do nothing;

  -- 자동 정지 — 편지 신고만 따로 센다
  select count(distinct reporter_id) into v_n from private.letter_reports
   where reported_id = v_target and status <> 'dismissed' and created_at > now() - interval '30 days';
  if v_n >= cfg.letter_auto_suspend_reports then
    update public.profiles set status = 'suspended' where id = v_target and status = 'active';
    if found then
      insert into private.audit_log (staff_id, action, target_user, report_id, detail)
      values (null, 'auto_suspend_letters', v_target, v_report, jsonb_build_object('distinct_reporters', v_n));
      perform public.close_room(rm.room_id, 'admin')
         from public.room_members rm where rm.user_id = v_target and rm.open;
    end if;
  end if;
  return jsonb_build_object('status', 'ok');
end
$fn$;

-- 차단: blocks 에 넣기만 한다. 공개 글 자체는 그대로 두고, 내 화면과 답장 배정에서만 빠진다.
create or replace function public.block_letter_author(p_letter bigint, p_comment bigint default null)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare v_target uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  v_target := private.letter_target_user(p_letter, p_comment);
  if v_target is null then return jsonb_build_object('status', 'not_found'); end if;
  if v_target = auth.uid() then return jsonb_build_object('status', 'self'); end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), v_target) on conflict do nothing;
  return jsonb_build_object('status', 'ok');
end
$fn$;

-- 하트 누르기·취소 — 토글이 아니라 "이 상태로" 맞춘다 (연타·재전송해도 결과가 같다)
create or replace function public.set_letter_like(p_letter bigint, p_like boolean)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); v_gate text;
begin
  v_gate := private.letter_eligible(me);
  if v_gate is not null then return jsonb_build_object('status', v_gate); end if;
  if not private.letter_visible_to(p_letter, me) then return jsonb_build_object('status', 'closed'); end if;
  if coalesce(p_like, false) then
    insert into private.letter_likes (letter_id, user_id) values (p_letter, me) on conflict do nothing;
  else
    delete from private.letter_likes where letter_id = p_letter and user_id = me;
  end if;
  return jsonb_build_object('status', 'ok', 'liked', coalesce(p_like, false),
    'like_count', (select count(*) from private.letter_likes where letter_id = p_letter)::int);
end
$fn$;

revoke all on function public.letter_feed(bigint, int), public.letter_detail(bigint), public.post_letter(text, jsonb),
                       public.post_comment(bigint, bigint, text, uuid), public.delete_my_letter(bigint),
                       public.delete_my_comment(bigint), public.request_letter_reply_task(),
                       public.report_letter(bigint, bigint, text, text), public.block_letter_author(bigint, bigint),
                       public.set_letter_like(bigint, boolean)
  from public, anon;
grant execute on function public.letter_feed(bigint, int), public.letter_detail(bigint), public.post_letter(text, jsonb),
                          public.post_comment(bigint, bigint, text, uuid), public.delete_my_letter(bigint),
                          public.delete_my_comment(bigint), public.request_letter_reply_task(),
                          public.report_letter(bigint, bigint, text, text), public.block_letter_author(bigint, bigint),
                          public.set_letter_like(bigint, boolean)
  to authenticated;


-- ── 37. 편지 알림 ───────────────────────────────────────────────────
-- 새 댓글이 달리면 댓글 쓴 앱이 /api/push 에 comment_id 만 알린다. 받을 사람·문구는 여기서 정한다.
--   최상위 댓글 → 편지 작성자 / 대댓글 → 부모 댓글 작성자 / 지정 답장 → 편지 작성자 ("답장이 도착")
--   새 편지·답장 배정에는 알림이 없다 (전교생 브로드캐스트는 스팸, 배정은 앱 안에서 바로 보인다)
create table if not exists private.letter_push_log (
  comment_id bigint primary key,
  created_at timestamptz not null default now()
);
alter table private.letter_push_log enable row level security;

create or replace function public.letter_notify(p_comment bigint, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare c public.letter_comments%rowtype; l public.letters%rowtype; v_actor public.letter_participants%rowtype;
        v_to uuid; v_subs jsonb; v_title text;
begin
  select * into c from public.letter_comments where id = p_comment;
  if not found or c.status <> 'visible' then return jsonb_build_object('skip', 'no_comment'); end if;
  select * into v_actor from public.letter_participants where letter_id = c.letter_id and participant_no = c.author_no;
  if v_actor.user_id is distinct from p_actor then return jsonb_build_object('skip', 'not_author'); end if;
  if c.created_at < now() - interval '2 minutes' then return jsonb_build_object('skip', 'stale'); end if;
  select * into l from public.letters where id = c.letter_id;
  if l.status <> 'open' then return jsonb_build_object('skip', 'closed'); end if;

  insert into private.letter_push_log (comment_id) values (p_comment) on conflict do nothing;
  if not found then return jsonb_build_object('skip', 'already'); end if;

  if c.parent_comment_id is null then
    v_to := private.letter_author(c.letter_id);
    v_title := case when l.designated_reply_comment_id = c.id then '편지에 답장이 도착했어요'
                    else '내 편지에 새 댓글' end;
  else
    select pp.user_id into v_to from public.letter_comments k
      join public.letter_participants pp on pp.letter_id = k.letter_id and pp.participant_no = k.author_no
     where k.id = c.parent_comment_id;
    v_title := '내 댓글에 답글';
  end if;

  if v_to is null or v_to = p_actor then return jsonb_build_object('skip', 'self'); end if;
  if private.blocked_between(v_to, p_actor) then return jsonb_build_object('skip', 'blocked'); end if;
  v_subs := private.push_target(v_to);
  if v_subs ? 'skip' then return v_subs; end if;
  v_subs := v_subs -> 'subs';

  -- ★ uuid 없음. 이름은 이 편지 안에서만 쓰는 임시 이름.
  return jsonb_build_object(
    'title', v_title,
    'body',  v_actor.alias || ': ' || left(c.body, 100),
    'url',   '/letters/' || c.letter_id,
    'tag',   'letter-' || c.letter_id,
    'subs',  v_subs);
end
$fn$;
revoke all on function public.letter_notify(bigint, uuid) from public, anon, authenticated;
grant execute on function public.letter_notify(bigint, uuid) to service_role;


-- ── 38. 운영자 RPC (편지) — service_role 전용 ───────────────────────
create or replace function public.admin_list_letter_reports(p_status text default 'open', p_limit int default 100)
returns jsonb language sql security definer set search_path = public, private stable as $fn$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select r.id, r.created_at, r.target_type, r.letter_id, r.comment_id, r.reason, left(r.note, 140) as note,
           r.status, r.reported_id, r.reporter_id, r.source,
           (select count(distinct r2.reporter_id) from private.letter_reports r2
             where r2.reported_id = r.reported_id and r2.status <> 'dismissed'
               and r2.created_at > now() - interval '30 days') as reported_30d,
           (select left(e.body, 80) from private.letter_report_evidence e
             where e.report_id = r.id order by e.ord desc limit 1) as preview,
           p.status as reported_status
      from private.letter_reports r
      left join public.profiles p on p.id = r.reported_id
     where p_status = 'all' or r.status = p_status
     order by r.created_at desc
     limit p_limit
  ) x;
$fn$;

create or replace function public.admin_letter_report(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare r private.letter_reports%rowtype;
begin
  select * into r from private.letter_reports where id = p_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'report', to_jsonb(r),
    'evidence', (select coalesce(jsonb_agg(jsonb_build_object(
                    'ord', e.ord, 'kind', e.kind, 'alias', e.alias, 'body', e.body, 'sent_at', e.sent_at)
                    order by e.ord), '[]'::jsonb)
                   from private.letter_report_evidence e where e.report_id = p_id),
    'target', jsonb_build_object(
                'letter_status', (select status from public.letters where id = r.letter_id),
                'comment_status', (select status from public.letter_comments where id = r.comment_id)),
    'reported', (select jsonb_build_object('status', p.status, 'strikes', p.strikes,
                        'suspended_until', p.suspended_until, 'created_at', p.created_at)
                   from public.profiles p where p.id = r.reported_id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', h.id, 'created_at', h.created_at, 'reason', h.reason, 'status', h.status)
                    order by h.created_at desc), '[]'::jsonb)
                  from private.letter_reports h where h.reported_id = r.reported_id and h.id <> p_id),
    'chat_reports', (select count(*) from private.reports where reported_id = r.reported_id),
    'reporter_filed', (select count(*) from private.letter_reports f where f.reporter_id = r.reporter_id),
    'reporter_dismissed', (select count(*) from private.letter_reports f
                            where f.reporter_id = r.reporter_id and f.status = 'dismissed'));
end
$fn$;

create or replace function public.admin_set_letter_report(p_id uuid, p_status text, p_note text, p_staff uuid)
returns void language plpgsql security definer set search_path = public, private as $fn$
begin
  perform private.require_staff(p_staff);
  update private.letter_reports
     set status = p_status, action_note = nullif(p_note, ''), handled_by = p_staff, handled_at = now()
   where id = p_id;
  insert into private.audit_log (staff_id, action, report_id, detail)
  values (p_staff, 'letter_report_' || p_status, p_id, jsonb_build_object('note', p_note));
end
$fn$;

-- 운영진 삭제 (소프트). p_comment 가 null 이면 편지 자체를 내린다.
create or replace function public.admin_remove_letter_content(p_letter bigint, p_comment bigint, p_staff uuid, p_report uuid)
returns void language plpgsql security definer set search_path = public, private as $fn$
begin
  perform private.require_staff(p_staff);
  if p_comment is null then
    update public.letters set status = 'removed' where id = p_letter;
  else
    update public.letter_comments set status = 'removed' where id = p_comment and letter_id = p_letter;
  end if;
  insert into private.audit_log (staff_id, action, report_id, detail)
  values (p_staff, case when p_comment is null then 'remove_letter' else 'remove_comment' end, p_report,
          jsonb_build_object('letter_id', p_letter, 'comment_id', p_comment));
end
$fn$;

-- 대시보드 수치에 편지 신고 · 편지 수 추가
create or replace function public.admin_stats()
returns jsonb language sql security definer set search_path = public, private stable as $fn$
  select jsonb_build_object(
    'open_reports',    (select count(*) from private.reports where status = 'open'),
    'reviewing',       (select count(*) from private.reports where status = 'reviewing'),
    'open_letter_reports', (select count(*) from private.letter_reports where status = 'open'),
    'active_rooms',    (select count(*) from public.rooms where status <> 'closed' and now() < expires_at),
    'seeking_now',     (select count(*) from public.user_presence where seeking_until > now()),
    'restricted_users',(select count(*) from public.profiles
                         where status <> 'active' or suspended_until > now()),
    'rooms_24h',       (select count(*) from public.rooms where created_at > now() - interval '24 hours'),
    'letters_24h',     (select count(*) from public.letters where created_at > now() - interval '24 hours'),
    'is_open',         (select is_open from public.app_settings where id));
$fn$;

do $do$
declare f text;
begin
  foreach f in array array[
    'admin_list_letter_reports(text, int)', 'admin_letter_report(uuid)',
    'admin_set_letter_report(uuid, text, text, uuid)', 'admin_remove_letter_content(bigint, bigint, uuid, uuid)',
    'admin_stats()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$do$;

-- 편지 신고 증거 보존 기간 · 알림 기록 정리
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
     where jobname in ('simbun-purge-letter-reports', 'simbun-purge-letter-push');
    perform cron.schedule('simbun-purge-letter-reports', '57 4 * * *',
      $q$delete from private.letter_reports where status in ('actioned','dismissed')
          and created_at < now() - interval '180 days'$q$);
    perform cron.schedule('simbun-purge-letter-push', '7 5 * * *',
      $q$delete from private.letter_push_log where created_at < now() - interval '1 day'$q$);
  end if;
end
$do$;


-- ════════════════════════════════════════════════════════════════════
--  Phase 11 — 관리자 권한 확장
--
--  역할:
--    moderator(운영진) — 신고 처리, 경고, 7일 이하 정지, 사용자 검색(익명 이름·ID)·상세
--    admin(관리자)     — 위 전부 + 영구 정지·영구정지 해제, 이메일 열람·이메일 검색,
--                        모든 대화 열람, 모든 편지·댓글 작성자 확인, 설정 변경
--
--  ★ 학생 앱의 구조적 익명성(학생끼리)은 그대로다. 넓어진 것은 운영자 → 학생 방향의 열람뿐이고,
--    모든 열람·검색은 private.audit_log 에 남는다. 역할 검사는 서버 라우트와 이 함수들 양쪽에서 한다.
-- ════════════════════════════════════════════════════════════════════

create or replace function private.require_staff(p_staff uuid, p_admin boolean default false)
returns text language plpgsql security definer set search_path = public, private stable as $fn$
declare v text;
begin
  select role into v from private.staff where user_id = p_staff;
  if v is null then raise exception 'not_staff'; end if;
  if p_admin and v <> 'admin' then raise exception 'admin_only'; end if;
  return v;
end
$fn$;
revoke all on function private.require_staff(uuid, boolean) from public, anon, authenticated;

-- 운영진이 정지할 수 있는 최대 일수
create or replace function private.mod_max_suspend_days() returns int
language sql immutable as $fn$ select 7 $fn$;

-- 역할 검사가 들어간 제재 (기존 시그니처 유지)
create or replace function public.admin_sanction(
  p_user uuid, p_action text, p_days int, p_staff uuid, p_report uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare v_role text := private.require_staff(p_staff);
begin
  -- 탈퇴한 계정 — 아무것도 바뀌지 않는데 "조치 완료"로 보이지 않게
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'user_not_found'; end if;
  if v_role <> 'admin' then
    if p_action = 'ban' then raise exception 'admin_only'; end if;
    if p_action = 'suspend' and coalesce(p_days, 0) > private.mod_max_suspend_days() then
      raise exception 'mod_days_limit';
    end if;
    if p_action = 'reinstate' and exists (select 1 from public.profiles where id = p_user and status = 'banned') then
      raise exception 'admin_only';
    end if;
    if exists (select 1 from private.staff where user_id = p_user) then raise exception 'admin_only'; end if;
  end if;

  if p_action = 'warn' then
    update public.profiles set strikes = strikes + 1 where id = p_user;
  elsif p_action = 'suspend' then
    if coalesce(p_days, 0) < 1 then raise exception 'days_required'; end if;
    update public.profiles
       set status = 'active', suspended_until = now() + make_interval(days => p_days), strikes = strikes + 1
     where id = p_user;
  elsif p_action = 'ban' then
    update public.profiles set status = 'banned', strikes = strikes + 1 where id = p_user;
  elsif p_action = 'reinstate' then
    update public.profiles set status = 'active', suspended_until = null where id = p_user;
  else
    raise exception 'invalid_action';
  end if;

  if p_action in ('suspend', 'ban') then
    perform public.close_room(rm.room_id, 'admin')
       from public.room_members rm where rm.user_id = p_user and rm.open;
    update public.user_presence set seeking_until = null, seeking_since = null where user_id = p_user;
  end if;

  insert into private.audit_log (staff_id, action, target_user, report_id, detail)
  values (p_staff, 'sanction_' || p_action, p_user, p_report,
          jsonb_build_object('days', p_days, 'note', p_note));
  return (select jsonb_build_object('status', status, 'strikes', strikes, 'suspended_until', suspended_until)
            from public.profiles where id = p_user);
end
$fn$;

-- 이메일 열람은 관리자만 (기존 시그니처 유지)
create or replace function public.admin_log_identity_view(p_staff uuid, p_users uuid[], p_report uuid)
returns void language plpgsql security definer set search_path = public, private as $fn$
begin
  perform private.require_staff(p_staff, true);
  insert into private.audit_log (staff_id, action, target_user, report_id, detail)
  values (p_staff, 'view_identity', case when cardinality(p_users) = 1 then p_users[1] end, p_report,
          jsonb_build_object('users', p_users));
end
$fn$;

-- 한 사람이 받은 신고 수 (기각 제외, 채팅 + 편지)
create or replace function private.reports_received(p_user uuid) returns int
language sql security definer set search_path = public, private stable as $fn$
  select ((select count(*) from private.reports where reported_id = p_user and status <> 'dismissed')
        + (select count(*) from private.letter_reports where reported_id = p_user and status <> 'dismissed'))::int;
$fn$;
revoke all on function private.reports_received(uuid) from public, anon, authenticated;

-- 사용자 검색.  p_filter: all | restricted | staff
--   '@' 가 들어간 검색어 = 이메일 검색 → 관리자만, 기록 남김
--   그 외 = 익명 이름 부분 일치 또는 ID 앞자리
create or replace function public.admin_find_users(p_query text, p_filter text, p_staff uuid, p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare
  q text := btrim(coalesce(p_query, ''));
  by_email boolean := position('@' in btrim(coalesce(p_query, ''))) > 0;
begin
  perform private.require_staff(p_staff, by_email);
  if by_email then
    insert into private.audit_log (staff_id, action, detail)
    values (p_staff, 'search_email', jsonb_build_object('query', q));
  end if;

  return (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select p.id, p.nickname, p.status, p.suspended_until, p.strikes, p.verified, p.onboarded, p.created_at,
           coalesce(pr.online_until > now(), false) as online, pr.online_until as last_seen,
           s.role as staff_role,
           private.reports_received(p.id) as reports_received
      from public.profiles p
      left join public.user_presence pr on pr.user_id = p.id
      left join private.staff s on s.user_id = p.id
     where (q = ''
            or (by_email and exists (select 1 from auth.users u where u.id = p.id and u.email ilike '%' || q || '%'))
            or (not by_email and (p.nickname ilike '%' || q || '%' or p.id::text like lower(q) || '%')))
       and (coalesce(p_filter, 'all') = 'all'
            or (p_filter = 'restricted' and (p.status <> 'active' or p.suspended_until > now()))
            or (p_filter = 'staff' and s.role is not null))
     order by p.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) x);
end
$fn$;

-- 사용자 상세 (이메일 없음 — 이메일은 admin_log_identity_view 후 서버가 따로 조회)
create or replace function public.admin_user(p_user uuid, p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
begin
  perform private.require_staff(p_staff);
  if not exists (select 1 from public.profiles where id = p_user) then return null; end if;
  return jsonb_build_object(
    'profile', (select jsonb_build_object(
                  'id', p.id, 'nickname', p.nickname, 'bio', p.bio, 'interests', p.interests, 'mbti', p.mbti,
                  'gender', p.gender, 'want', p.want, 'status', p.status, 'suspended_until', p.suspended_until,
                  'strikes', p.strikes, 'verified', p.verified, 'onboarded', p.onboarded, 'created_at', p.created_at)
                  from public.profiles p where p.id = p_user),
    'online', coalesce((select online_until > now() from public.user_presence where user_id = p_user), false),
    'last_seen', (select online_until from public.user_presence where user_id = p_user),
    'staff_role', (select role from private.staff where user_id = p_user),
    'counts', jsonb_build_object(
      'rooms', (select count(*) from public.room_members where user_id = p_user),
      'open_rooms', (select count(*) from public.room_members where user_id = p_user and open),
      'letters', (select count(*) from public.letter_participants where user_id = p_user and is_author),
      'comments', (select count(*) from public.letter_comments c
                     join public.letter_participants lp
                       on lp.letter_id = c.letter_id and lp.participant_no = c.author_no
                    where lp.user_id = p_user),
      'reports_filed', (select count(*) from private.reports where reporter_id = p_user)
                     + (select count(*) from private.letter_reports where reporter_id = p_user),
      'reports_dismissed', (select count(*) from private.reports where reporter_id = p_user and status = 'dismissed')
                         + (select count(*) from private.letter_reports where reporter_id = p_user and status = 'dismissed')),
    'chat_reports', (select coalesce(jsonb_agg(jsonb_build_object(
                        'id', r.id, 'created_at', r.created_at, 'reason', r.reason, 'status', r.status)
                        order by r.created_at desc), '[]'::jsonb)
                       from (select * from private.reports where reported_id = p_user
                              order by created_at desc limit 50) r),
    'letter_reports', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', r.id, 'created_at', r.created_at, 'reason', r.reason, 'status', r.status,
                          'target_type', r.target_type)
                          order by r.created_at desc), '[]'::jsonb)
                         from (select * from private.letter_reports where reported_id = p_user
                                order by created_at desc limit 50) r),
    'history', (select coalesce(jsonb_agg(jsonb_build_object(
                   'action', a.action, 'staff_id', a.staff_id, 'detail', a.detail, 'created_at', a.created_at)
                   order by a.created_at desc), '[]'::jsonb)
                  from (select * from private.audit_log
                         where target_user = p_user and (action like 'sanction_%' or action like '%auto_suspend%')
                         order by created_at desc limit 50) a));
end
$fn$;

-- 한 사람의 대화 목록 (관리자) — 내용은 admin_room 으로
create or replace function public.admin_user_rooms(p_user uuid, p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
begin
  perform private.require_staff(p_staff, true);
  return (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select r.id, r.status, r.created_at, r.closed_at, r.close_reason,
           (r.status <> 'closed' and now() < r.expires_at) as live,
           case when me.seat = 1 then r.alias1 else r.alias2 end as alias,
           other.user_id as partner_id,
           (select nickname from public.profiles where id = other.user_id) as partner_nickname,
           (select count(*) from public.messages m where m.room_id = r.id and m.sender_seat > 0) as message_count
      from public.room_members me
      join public.rooms r on r.id = me.room_id
      left join public.room_members other on other.room_id = r.id and other.user_id <> me.user_id
     where me.user_id = p_user
     order by r.created_at desc
     limit 200
  ) x);
end
$fn$;

-- 전체 대화 목록 (관리자).  p_filter: live | all
create or replace function public.admin_rooms(p_filter text, p_staff uuid, p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
begin
  perform private.require_staff(p_staff, true);
  return (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select r.id, r.status, r.created_at, r.closed_at, r.close_reason, r.round,
           (r.status <> 'closed' and now() < r.expires_at) as live,
           (select jsonb_agg(jsonb_build_object('seat', rm.seat, 'user_id', rm.user_id,
                     'nickname', (select nickname from public.profiles where id = rm.user_id)) order by rm.seat)
              from public.room_members rm where rm.room_id = r.id) as members,
           (select count(*) from public.messages m where m.room_id = r.id and m.sender_seat > 0) as message_count
      from public.rooms r
     where coalesce(p_filter, 'all') = 'all'
        or (p_filter = 'live' and r.status <> 'closed' and now() < r.expires_at)
     order by r.created_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 300)
  ) x);
end
$fn$;

-- 대화 열람 (관리자) — 열 때마다 기록
create or replace function public.admin_room(p_room uuid, p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare r public.rooms%rowtype;
begin
  perform private.require_staff(p_staff, true);
  select * into r from public.rooms where id = p_room;
  if not found then return null; end if;
  insert into private.audit_log (staff_id, action, detail)
  values (p_staff, 'view_room', jsonb_build_object('room', p_room));
  return jsonb_build_object(
    'room', jsonb_build_object('id', r.id, 'status', r.status, 'round', r.round, 'created_at', r.created_at,
              'armed_at', r.armed_at, 'expires_at', r.expires_at, 'closed_at', r.closed_at,
              'close_reason', r.close_reason, 'live', r.status <> 'closed' and now() < r.expires_at),
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
                   'seat', rm.seat, 'user_id', rm.user_id, 'open', rm.open,
                   'alias', case when rm.seat = 1 then r.alias1 else r.alias2 end,
                   'nickname', p.nickname, 'status', p.status) order by rm.seat), '[]'::jsonb)
                  from public.room_members rm join public.profiles p on p.id = rm.user_id
                 where rm.room_id = p_room),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', m.id, 'seat', m.sender_seat, 'body', m.body, 'created_at', m.created_at,
                    'reply_to', m.reply_to,   -- 답장 (Phase 18)
                    -- 공감 (Phase 17) — { "1": "heart", "2": "laugh" } 누가(자리) 어떤 공감을 달았는지
                    'reactions', (select jsonb_object_agg(mr.seat::text, mr.emoji)
                                    from public.message_reactions mr
                                   where mr.message_id = m.id and mr.emoji is not null)) order by m.id), '[]'::jsonb)
                   from public.messages m where m.room_id = p_room));
end
$fn$;

-- 편지 한 통의 작성자·참여자 확인 (관리자) — 기록 남김. 내려간 글·댓글도 보인다.
create or replace function public.admin_letter_post(p_letter bigint, p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare l public.letters%rowtype;
begin
  perform private.require_staff(p_staff, true);
  select * into l from public.letters where id = p_letter;
  if not found then return null; end if;
  insert into private.audit_log (staff_id, action, detail)
  values (p_staff, 'view_letter_authors', jsonb_build_object('letter', p_letter));
  return jsonb_build_object(
    'letter', jsonb_build_object('id', l.id, 'body', l.body, 'fmt', l.fmt, 'status', l.status,
               'reply_status', l.reply_status, 'created_at', l.created_at,
               'like_count', (select count(*) from private.letter_likes k where k.letter_id = l.id)),
    'participants', (select coalesce(jsonb_agg(jsonb_build_object(
                        'no', lp.participant_no, 'alias', lp.alias, 'is_author', lp.is_author,
                        'user_id', lp.user_id, 'nickname', p.nickname, 'status', p.status) order by lp.participant_no), '[]'::jsonb)
                       from public.letter_participants lp join public.profiles p on p.id = lp.user_id
                      where lp.letter_id = p_letter),
    'reader', (select jsonb_build_object('user_id', a.reader_id, 'expires_at', a.expires_at,
                        'fulfilled_at', a.fulfilled_at,
                        'nickname', (select nickname from public.profiles where id = a.reader_id))
                 from public.letter_reply_assignments a where a.letter_id = p_letter),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', c.id, 'parent_id', c.parent_comment_id, 'author_no', c.author_no,
                    'body', c.body, 'status', c.status, 'created_at', c.created_at) order by c.id), '[]'::jsonb)
                   from public.letter_comments c where c.letter_id = p_letter));
end
$fn$;

-- 한 사람이 쓴 편지·댓글 (관리자) — 기록 남김
create or replace function public.admin_user_letters(p_user uuid, p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
begin
  perform private.require_staff(p_staff, true);
  insert into private.audit_log (staff_id, action, target_user, detail)
  values (p_staff, 'view_user_letters', p_user, '{}'::jsonb);
  return (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select l.id as letter_id, lp.alias, lp.is_author, l.status, l.created_at,
           left(l.body, 80) as preview,
           (select count(*) from public.letter_comments c
             where c.letter_id = l.id and c.author_no = lp.participant_no) as my_comments
      from public.letter_participants lp
      join public.letters l on l.id = lp.letter_id
     where lp.user_id = p_user
     order by l.created_at desc
     limit 200
  ) x);
end
$fn$;

do $do$
declare f text;
begin
  foreach f in array array[
    'admin_sanction(uuid, text, int, uuid, uuid, text)', 'admin_log_identity_view(uuid, uuid[], uuid)',
    'admin_find_users(text, text, uuid, int)', 'admin_user(uuid, uuid)', 'admin_user_rooms(uuid, uuid)',
    'admin_rooms(text, uuid, int)', 'admin_room(uuid, uuid)', 'admin_letter_post(bigint, uuid)',
    'admin_user_letters(uuid, uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$do$;

-- ════════════════════════════════════════════════════════════════════
--  Phase 12 — 학번-이름 명렬표 (관리자 신원 확인 보조)
--
--  private.student_roster 는 학교가 관리하는 학번↔실명 명단이다. 학생이 직접 입력하는 값이 아니고
--  (Phase 1~11 의 "실명·학번을 수집하지 않는다" 원칙은 학생 쪽 입력·저장에 대한 것),
--  admin(관리자) 화면에서만 쓴다:
--    · admin_roster_name — "이메일 확인"(admin_log_identity_view 로 기록됨) 옆에 이름
--    · admin_student_labels — 운영자 화면의 익명 이름 옆에 "(학번 이름)". 부를 때마다 view_identity 기록.
--    · 운영진(moderator)은 둘 다 못 부른다. 학생 앱·PostgREST 에는 노출되지 않는다 (service_role RPC 전용).
--  명단 원본(xlsx/csv)은 실명이 들어 있으므로 저장소에 커밋하지 않는다 — scripts/import-roster.mjs 로
--  로컬에서 서비스 키를 이용해 바로 DB 에 반영한다.
-- ════════════════════════════════════════════════════════════════════

create table if not exists private.student_roster (
  student_no int primary key,
  grade      smallint not null,
  name       text not null
);
revoke all on private.student_roster from public, anon, authenticated;

-- 명단 일괄 반영 (scripts/import-roster.mjs 전용) — p_rows: [{"no": 10101, "name": "홍길동"}, ...]
create or replace function public.admin_roster_import(p_grade smallint, p_rows jsonb)
returns int language plpgsql security definer set search_path = public, private as $fn$
declare n int;
begin
  insert into private.student_roster (student_no, grade, name)
  select (r->>'no')::int, p_grade, r->>'name'
    from jsonb_array_elements(p_rows) r
  on conflict (student_no) do update set grade = excluded.grade, name = excluded.name;
  get diagnostics n = row_count;
  insert into private.audit_log (staff_id, action, detail)
  values (null, 'roster_import', jsonb_build_object('grade', p_grade, 'count', n));
  return n;
end
$fn$;

-- 이메일 앞자리의 학번 (숫자 1~9자리만 — 그보다 길면 학번이 아니고 int 로 바꿀 수도 없다)
create or replace function private.email_student_no(p_email text) returns text
language sql immutable as $fn$
  select case when n ~ '^[0-9]{1,9}$' then n end
    from (select substring(split_part(coalesce(p_email, ''), '@', 1) from '^[0-9]+') as n) x;
$fn$;
revoke all on function private.email_student_no(text) from public, anon, authenticated;

-- 학교 이메일 앞자리(학번)로 이름 찾기 — admin(관리자)만, 이미 이메일을 확인한 다음에만 의미가 있다
create or replace function public.admin_roster_name(p_staff uuid, p_email text)
returns text language plpgsql security definer set search_path = public, private stable as $fn$
declare v_no text := private.email_student_no(p_email);
begin
  perform private.require_staff(p_staff, true);
  if v_no is null then return null; end if;
  return (select name from private.student_roster where student_no = v_no::int);
end
$fn$;

-- 화면에 나오는 사용자들의 "학번 이름" 한꺼번에 — 관리자만, 한 번 부를 때마다 활동 기록 한 줄.
-- 명단에 이름이 없으면 학번만, 이메일이 학번 형태가 아니면 빠진다.
create or replace function public.admin_student_labels(p_staff uuid, p_users uuid[])
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare r jsonb;
begin
  perform private.require_staff(p_staff, true);
  if coalesce(cardinality(p_users), 0) = 0 then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(x.id, x.label), '{}'::jsonb) into r from (
    select u.id, concat_ws(' ', v.no, sr.name) as label
      from auth.users u
      cross join lateral (select private.email_student_no(u.email) as no) v
      left join private.student_roster sr on sr.student_no = v.no::int
     where u.id = any(p_users) and v.no is not null
  ) x;
  insert into private.audit_log (staff_id, action, target_user, detail)
  values (p_staff, 'view_identity', case when cardinality(p_users) = 1 then p_users[1] end,
          jsonb_build_object('users', p_users, 'via', 'label'));
  return r;
end
$fn$;

do $do$
declare f text;
begin
  foreach f in array array['admin_roster_import(smallint, jsonb)', 'admin_roster_name(uuid, text)',
                           'admin_student_labels(uuid, uuid[])']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$do$;


-- ════════════════════════════════════════════════════════════════════
--  Phase 13 — 실시간 현황 (전체 사용자 + 지금 상태)
--
--  상태는 이미 있는 값에서만 계산한다 (새로 수집하는 정보 없음):
--    · 접속 중   user_presence.online_until > now()   (앱이 화면에 떠 있으면 heartbeat 로 갱신)
--    · 매칭 대기 user_presence.seeking_until > now()
--    · 대화 중   열린 room_members + 살아 있는 방(닫히지 않았고 마감 전)
--  어느 방인지(= 누구와 대화 중인지)는 전체 대화 열람과 같은 관리자 전용이라 운영진에게는 개수만 준다.
--  상태만 보는 것이므로 열람 기록은 남기지 않는다 (학번·이름은 admin_student_labels 가 따로 기록).
-- ════════════════════════════════════════════════════════════════════

create or replace function public.admin_live_users(p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare v_admin boolean := private.require_staff(p_staff) = 'admin';
begin
  return (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select p.id, p.nickname, p.status, p.suspended_until, p.onboarded, s.role as staff_role,
           coalesce(pr.online_until > now(), false) as online,
           pr.online_until as last_seen,
           coalesce(pr.seeking_until > now(), false) as seeking,
           coalesce(lr.n, 0) as room_count,
           case when v_admin then coalesce(lr.ids, '[]'::jsonb) end as rooms
      from public.profiles p
      left join public.user_presence pr on pr.user_id = p.id
      left join private.staff s on s.user_id = p.id
      left join lateral (
        select count(*)::int as n, jsonb_agg(r.id order by r.created_at) as ids
          from public.room_members rm
          join public.rooms r on r.id = rm.room_id
         where rm.user_id = p.id and rm.open and r.status <> 'closed' and now() < r.expires_at
      ) lr on true
  ) x);
end
$fn$;
revoke all on function public.admin_live_users(uuid) from public, anon, authenticated;
grant execute on function public.admin_live_users(uuid) to service_role;


-- ════════════════════════════════════════════════════════════════════
--  Phase 16 — 공지사항 (종 아이콘 · 빨간 점)
--
--  · 공지는 관리자만 올리고 내린다 (활동 기록에 남음). 운영진은 목록만 본다.
--  · 학생은 my_notices() 로 최근 공지와 "어디까지 봤는지"를 함께 받는다.
--    봤는지는 계정에 저장한다 (private.notice_reads) — 폰을 바꿔도 이미 본 공지에 점이 다시 뜨지 않게.
--  · 홈 화면 맨 위 한 줄(app_settings.notice)은 그대로 둔다 — 서비스를 닫았을 때 안내로도 쓰인다.
-- ════════════════════════════════════════════════════════════════════

create table if not exists private.notices (
  id          bigint generated always as identity primary key,
  title       text not null check (char_length(btrim(title)) between 1 and 80),
  body        text not null default '' check (char_length(body) <= 2000),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  removed_at  timestamptz
);
create index if not exists notices_live on private.notices (id desc) where removed_at is null;
alter table private.notices enable row level security;

create table if not exists private.notice_reads (
  user_id    uuid   primary key references public.profiles(id) on delete cascade,
  last_id    bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table private.notice_reads enable row level security;

-- 학생: 최근 공지 30개 + 내가 마지막으로 본 공지 번호. 이용 제한 계정도 공지는 본다.
create or replace function public.my_notices()
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  return jsonb_build_object(
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'created_at', n.created_at)
                       order by n.id desc)
        from (select * from private.notices where removed_at is null order by id desc limit 30) n
    ), '[]'::jsonb),
    'last_seen', coalesce((select last_id from private.notice_reads where user_id = me), 0)
  );
end
$fn$;

-- 학생: 여기까지 봤다. 뒤로 가지 않고(greatest), 없는 번호로 앞질러 가지도 않는다.
create or replace function public.mark_notices_seen(p_id bigint)
returns bigint language plpgsql security definer set search_path = public, private as $fn$
declare
  me uuid := auth.uid();
  v  bigint := least(coalesce(p_id, 0), coalesce((select max(id) from private.notices), 0));
  r  bigint;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  insert into private.notice_reads (user_id, last_id) values (me, greatest(v, 0))
  on conflict (user_id) do update
     set last_id = greatest(private.notice_reads.last_id, excluded.last_id), updated_at = now()
  returning last_id into r;
  return r;
end
$fn$;

revoke all on function public.my_notices(), public.mark_notices_seen(bigint) from public, anon;
grant execute on function public.my_notices(), public.mark_notices_seen(bigint) to authenticated;

-- 운영자: 목록 (운영진도 볼 수 있다)
create or replace function public.admin_notices(p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
begin
  perform private.require_staff(p_staff);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'created_at', created_at)
                     order by id desc)
      from private.notices where removed_at is null
  ), '[]'::jsonb);
end
$fn$;

-- 관리자: 공지 올리기
create or replace function public.admin_post_notice(p_staff uuid, p_title text, p_body text)
returns bigint language plpgsql security definer set search_path = public, private as $fn$
declare v bigint;
begin
  perform private.require_staff(p_staff, true);
  insert into private.notices (title, body, created_by)
  values (btrim(p_title), btrim(coalesce(p_body, '')), p_staff)
  returning id into v;
  insert into private.audit_log (staff_id, action, detail)
  values (p_staff, 'post_notice', jsonb_build_object('notice', v, 'title', btrim(p_title)));
  return v;
end
$fn$;

-- 관리자: 공지 내리기 (지우지 않고 숨긴다 — 기록은 남는다)
create or replace function public.admin_remove_notice(p_staff uuid, p_id bigint)
returns void language plpgsql security definer set search_path = public, private as $fn$
declare v_title text;
begin
  perform private.require_staff(p_staff, true);
  update private.notices set removed_at = now()
   where id = p_id and removed_at is null
  returning title into v_title;
  if not found then raise exception 'notice_not_found'; end if;
  insert into private.audit_log (staff_id, action, detail)
  values (p_staff, 'remove_notice', jsonb_build_object('notice', p_id, 'title', v_title));
end
$fn$;

do $do$
declare f text;
begin
  foreach f in array array['admin_notices(uuid)', 'admin_post_notice(uuid, text, text)',
                           'admin_remove_notice(uuid, bigint)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$do$;


-- ════════════════════════════════════════════════════════════════════
--  Phase 17 — 메시지 공감 (❤️ 😂 😮 😢 👍 🔥)
--
--  · messages 는 그대로 둔다 (update 없음 = 증거 무결성). 공감은 별도 표에 자리(seat)로만 남긴다 —
--    extension_votes 와 같은 방식이라 사용자 식별자가 없다.
--  · 메시지 하나에 자리마다 공감 하나. 다른 걸 누르면 바뀌고, emoji = null 이 "취소".
--    ★ 행을 지우지 않는 이유: Realtime 의 DELETE 는 room_id 필터·RLS 가 적용되지 않는다.
--      null 로 바꾸는 UPDATE 는 둘 다 적용되어 같은 방 두 사람에게만 간다.
--  · 대화 중(쓸 수 있는 방)에만 달 수 있다. 방이 닫히면 메시지와 함께 보이지 않고, 지워질 때 같이 지워진다.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.message_reactions (
  message_id bigint   not null references public.messages(id) on delete cascade,
  room_id    uuid     not null references public.rooms(id) on delete cascade,
  seat       smallint not null check (seat in (1, 2)),
  emoji      text     check (emoji in ('heart', 'laugh', 'wow', 'sad', 'like', 'fire')),
  updated_at timestamptz not null default now(),
  primary key (message_id, seat)
);
create index if not exists message_reactions_room on public.message_reactions (room_id);

alter table public.message_reactions enable row level security;
drop policy if exists "reactions: read while room alive" on public.message_reactions;
create policy "reactions: read while room alive" on public.message_reactions
  for select to authenticated
  using (public.is_room_member(room_id) and public.room_is_visible(room_id));
revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;
-- 쓰기는 react_message() 로만

do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.message_reactions;
    exception when duplicate_object then null; end;
  end if;
end
$do$;

create or replace function public.react_message(p_message bigint, p_emoji text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  me       uuid := auth.uid();
  v_room   uuid;
  v_sender smallint;
  v_seat   smallint;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if p_emoji is not null and p_emoji not in ('heart', 'laugh', 'wow', 'sad', 'like', 'fire') then
    return jsonb_build_object('status', 'bad_emoji');
  end if;
  select room_id, sender_seat into v_room, v_sender from public.messages where id = p_message;
  if found then
    select seat into v_seat from public.room_members where room_id = v_room and user_id = me;
  end if;
  -- 내 방의 메시지가 아니면 있는지 없는지도 알려주지 않는다
  if v_seat is null then return jsonb_build_object('status', 'not_found'); end if;
  if v_sender = 0 then return jsonb_build_object('status', 'system'); end if;
  if not public.room_is_writable(v_room) then return jsonb_build_object('status', 'closed'); end if;

  insert into public.message_reactions (message_id, room_id, seat, emoji)
  values (p_message, v_room, v_seat, p_emoji)
  on conflict (message_id, seat) do update
     set emoji = excluded.emoji, updated_at = now()
   where public.message_reactions.emoji is distinct from excluded.emoji;  -- 같은 걸 또 보내면 이벤트 없음

  return jsonb_build_object('status', 'ok', 'message_id', p_message, 'seat', v_seat, 'emoji', p_emoji);
end
$fn$;
revoke all on function public.react_message(bigint, text) from public, anon;
grant execute on function public.react_message(bigint, text) to authenticated;

-- ── 공감 푸시 알림 ─────────────────────────────────────────────────
-- 상대 메시지에 공감을 달면 상대에게 알림. /api/push 가 { reaction_message_id } 로 부른다.
--  · 메시지 하나 × 자리 하나에 딱 한 번 — 공감을 바꾸거나 껐다 켜도 다시 울리지 않는다 (연타로 알림 폭탄 방지)
--  · 내 메시지에 단 공감, 받는 사람이 앱을 보고 있을 때(이미 보인다)는 보내지 않는다
--  · 문구에 uuid 없음 — 제목은 공감한 사람의 방 안 이름
create table if not exists private.reaction_push_log (
  message_id bigint   not null references public.messages(id) on delete cascade,
  seat       smallint not null,
  created_at timestamptz not null default now(),
  primary key (message_id, seat)
);
alter table private.reaction_push_log enable row level security;

create or replace function public.reaction_push_payload(p_message bigint, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare
  m      public.messages%rowtype;
  r      public.rooms%rowtype;
  v_seat smallint;
  v_rx   public.message_reactions%rowtype;
  v_to   uuid;
  v_subs jsonb;
begin
  select * into m from public.messages where id = p_message;
  if not found then return jsonb_build_object('skip', 'no_message'); end if;
  select seat into v_seat from public.room_members where room_id = m.room_id and user_id = p_actor;
  if v_seat is null then return jsonb_build_object('skip', 'not_member'); end if;
  if m.sender_seat = v_seat or m.sender_seat = 0 then return jsonb_build_object('skip', 'own_message'); end if;
  select * into v_rx from public.message_reactions where message_id = p_message and seat = v_seat;
  if not found or v_rx.emoji is null then return jsonb_build_object('skip', 'no_reaction'); end if;
  if v_rx.updated_at < now() - interval '2 minutes' then return jsonb_build_object('skip', 'stale'); end if;
  select * into r from public.rooms where id = m.room_id;
  if r.status = 'closed' then return jsonb_build_object('skip', 'closed'); end if;

  insert into private.reaction_push_log (message_id, seat) values (p_message, v_seat) on conflict do nothing;
  if not found then return jsonb_build_object('skip', 'already'); end if;

  select user_id into v_to from public.room_members where room_id = m.room_id and seat = m.sender_seat;
  v_subs := private.push_target(v_to);
  if v_subs ? 'skip' then return v_subs; end if;
  v_subs := v_subs -> 'subs';

  return jsonb_build_object(
    'title',   case when v_seat = 1 then r.alias1 else r.alias2 end,
    'body',    (case v_rx.emoji when 'heart' then '❤️' when 'laugh' then '😂' when 'wow' then '😮'
                               when 'sad' then '😢' when 'like' then '👍' else '🔥' end)
               || ' 공감: ' || left(m.body, 80),
    'room_id', m.room_id,
    'subs',    v_subs);
end
$fn$;
revoke all on function public.reaction_push_payload(bigint, uuid) from public, anon, authenticated;
grant execute on function public.reaction_push_payload(bigint, uuid) to service_role;


-- ════════════════════════════════════════════════════════════════════
--  Phase 18 — 메시지 답장 (특정 메시지를 짚어서 답하기)
--
--  · messages.reply_to = 같은 방의 다른 메시지 id. 식별 정보가 아니라 메시지 번호일 뿐이다.
--  · 보낼 때 한 번만 정하고 바꿀 수 없다 (update 권한 없음 — 증거 무결성 그대로).
--  · 같은 방 · 시스템 안내가 아닌 메시지만 — 트리거가 검사한다 (다른 방 메시지 번호를 넣어 내용을 엿볼 수 없게).
--    FK 를 걸지 않는 이유: 방이 지워질 때 메시지가 한꺼번에 지워지므로 가리킬 대상이 남지 않는다.
-- ════════════════════════════════════════════════════════════════════

alter table public.messages add column if not exists reply_to bigint;

create or replace function public.msg_reply_check()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.reply_to is not null and not exists (
       select 1 from public.messages r
        where r.id = new.reply_to and r.room_id = new.room_id and r.sender_seat <> 0) then
    raise exception 'bad_reply';
  end if;
  return new;
end
$fn$;
revoke all on function public.msg_reply_check() from public, anon, authenticated;

drop trigger if exists messages_reply_check on public.messages;
create trigger messages_reply_check
  before insert on public.messages
  for each row execute function public.msg_reply_check();

grant insert (reply_to) on public.messages to authenticated;


-- ════════════════════════════════════════════════════════════════════
--  Phase 19 — 검열봇 (규칙 필터 + AI 검토) · AI 대화 상대
--
--  1단 규칙 필터 — 보내기 전에 DB 가 막는다 (무료 · 즉시 · 밖으로 나가는 데이터 없음).
--     전화번호 · 학번 · "N학년 N반" · SNS 아이디/주소 · 금칙어(private.banned_terms, 관리자가 고친다).
--     채팅 메시지 · 편지 · 댓글 모두 insert 트리거에서. 막히면 'personal_info' / 'blocked_word' 오류.
--  2단 AI 검토 — 올라간 뒤에 서버(/api/moderate)가 Cloudflare Workers AI 로 판정한다.
--     걸리면 운영진 신고함에 '자동 감지'(source = 'auto', reporter_id 없음)로 올라간다. 판단은 사람이.
--     하루 한도(ai_mod_daily_cap) — Workers AI 무료 몫이 하루 단위(UTC 00:00 = 한국 오전 9시)라서.
--     자동 신고는 자동 정지 횟수에 세지 않는다 (count(distinct reporter_id) 가 null 을 빼므로).
--  AI 대화 상대 — 매칭을 기다리는 동안. 사람당 하루 N번 · 앱 전체 하루 N번 · 한 번에 N분 · N턴.
--     대화 내용은 DB 에 남기지 않는다 (몇 번 썼는지만 센다).
--  AI 두 기능 모두 기본은 꺼짐 — 개인정보 처리방침에 적고 운영 설정에서 켠다.
-- ════════════════════════════════════════════════════════════════════

-- ── 설정 ──
alter table public.app_settings add column if not exists ai_moderation     boolean not null default false;
alter table public.app_settings add column if not exists ai_mod_daily_cap  int     not null default 250;
alter table public.app_settings add column if not exists ai_chat           boolean not null default false;
alter table public.app_settings add column if not exists ai_chat_per_user  int     not null default 3;
alter table public.app_settings add column if not exists ai_chat_daily_cap int     not null default 3;
alter table public.app_settings add column if not exists ai_chat_minutes   int     not null default 10;
alter table public.app_settings add column if not exists ai_chat_max_turns int     not null default 30;
do $do$
begin
  alter table public.app_settings add constraint app_settings_ai_check check (
    ai_mod_daily_cap between 0 and 100000 and ai_chat_per_user between 0 and 50
    and ai_chat_daily_cap between 0 and 100000 and ai_chat_minutes between 1 and 30
    and ai_chat_max_turns between 1 and 100);
exception when duplicate_object then null;
end
$do$;

-- ── 1단: 규칙 필터 ──
create table if not exists private.banned_terms (
  pattern    text primary key,     -- 정규식 (소문자로 바꾼 글에 맞춘다)
  created_at timestamptz not null default now()
);
alter table private.banned_terms enable row level security;
-- 처음 한 번만 채운다 (관리자가 지운 것을 schema.sql 을 다시 돌릴 때 되살리지 않게)
insert into private.banned_terms (pattern)
select unnest(array[
  '섹\s*스', '씹\s*창', '보\s*빨', '느\s*금\s*마', '니\s*애\s*미', '니\s*엄\s*마\s*(뒤|죽)',
  '자\s*살\s*(해\s*라|하\s*세\s*요|해\s*버\s*려)', '뒤\s*져\s*(라|버\s*려)', '창\s*녀', '한\s*남\s*충', '김\s*치\s*녀'])
 where not exists (select 1 from private.banned_terms);

-- null = 통과, 아니면 막는 이유
create or replace function private.rule_violation(p_text text)
returns text language plpgsql stable security definer set search_path = public, private as $fn$
declare
  t text := lower(coalesce(p_text, ''));
  d text;
begin
  -- 숫자 사이의 띄어쓰기·하이픈·점을 없앤 글 (010 1234 5678, 010-1234-5678 → 01012345678)
  d := regexp_replace(t, '([0-9])[\s.\-]+(?=[0-9])', '\1', 'g');
  if d ~ '01[016789][0-9]{7,8}' then return 'personal_info'; end if;
  -- 학번: 학년 1~3 · 반 01~12 · 번호 01~39 (20529). 돈·개수 같은 숫자(15000원)는 반 자리가 맞지 않거나 단위로 걸러진다
  if t ~ '(^|[^0-9])[1-3](0[1-9]|1[0-2])(0[1-9]|[1-3][0-9])(?![0-9]|\s*(원|명|개|년|점|번|위|등|분|초|살|층|호|회|장|권|m|km|kg|%))' then
    return 'personal_info';
  end if;
  if t ~ '[1-3]\s*학년\s*[0-9]{1,2}\s*반' then return 'personal_info'; end if;
  -- SNS · 메신저 — @아이디, 주소, "인스타 아이디" 같은 말
  if t ~ '@[a-z0-9_.]{3,}' then return 'personal_info'; end if;
  if t ~ '(instagram\.com|instagr\.am|open\.kakao\.com|discord\.gg|discord\.com/invite|t\.me/|facebook\.com|tiktok\.com|snapchat\.com)' then
    return 'personal_info';
  end if;
  if t ~ '(인스타|insta|카톡|카카오톡|kakao|페메|페북|디코|디스코드|discord|텔레그램|telegram|스냅챗|snapchat|틱톡|tiktok)\s*(아이디|id|아뒤|주소|계정|알려|추가|맞팔|팔로|친추|dm|디엠)' then
    return 'personal_info';
  end if;
  if exists (select 1 from private.banned_terms b where t ~ b.pattern) then return 'blocked_word'; end if;
  return null;
end
$fn$;
revoke all on function private.rule_violation(text) from public, anon, authenticated;

create or replace function public.content_rule_check()
returns trigger language plpgsql security definer set search_path = public, private as $fn$
declare v text;
begin
  -- ★ 조건을 and 로 묶으면 편지 표에도 new.sender_seat 를 찾다가 오류 — 따로 묻는다
  if tg_table_name = 'messages' then
    if new.sender_seat = 0 then return new; end if;  -- 시스템 안내
  end if;
  v := private.rule_violation(new.body);
  if v is not null then raise exception '%', v; end if;
  return new;
end
$fn$;
revoke all on function public.content_rule_check() from public, anon, authenticated;

drop trigger if exists messages_rule_check on public.messages;
create trigger messages_rule_check before insert on public.messages
  for each row execute function public.content_rule_check();
drop trigger if exists letters_rule_check on public.letters;
create trigger letters_rule_check before insert on public.letters
  for each row execute function public.content_rule_check();
drop trigger if exists letter_comments_rule_check on public.letter_comments;
create trigger letter_comments_rule_check before insert on public.letter_comments
  for each row execute function public.content_rule_check();

-- ── 2단: AI 검토 대기열 ──
alter table private.reports        alter column reporter_id drop not null;
alter table private.letter_reports alter column reporter_id drop not null;
-- self_harm(위기 신호)은 AI 만 붙인다 — 학생 신고 사유 목록(report_partner · report_letter)은 그대로
alter table private.reports drop constraint if exists reports_reason_check;
alter table private.reports add constraint reports_reason_check check (reason in
  ('harassment','sexual','spam','personal_info','hate','impersonation','other','self_harm'));
alter table private.letter_reports drop constraint if exists letter_reports_reason_check;
alter table private.letter_reports add constraint letter_reports_reason_check check (reason in
  ('harassment','sexual','spam','personal_info','hate','impersonation','other','self_harm'));

create table if not exists private.mod_queue (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('message','letter','comment')),
  ref_id     bigint not null,
  status     text not null default 'pending' check (status in ('pending','working','done','skipped','error')),
  tries      smallint not null default 0,
  verdict    jsonb,              -- {flag, category, reason} — 글 본문은 담지 않는다
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  done_at    timestamptz,
  unique (kind, ref_id)
);
create index if not exists mod_queue_open on private.mod_queue (created_at) where status in ('pending','working');
create index if not exists mod_queue_claimed on private.mod_queue (claimed_at);
alter table private.mod_queue enable row level security;

create or replace function public.mod_enqueue()
returns trigger language plpgsql security definer set search_path = public, private as $fn$
begin
  if not coalesce((select ai_moderation from public.app_settings where id), false) then return null; end if;
  if tg_table_name = 'messages' then
    if new.sender_seat = 0 then return null; end if;
    insert into private.mod_queue (kind, ref_id) values ('message', new.id) on conflict do nothing;
  elsif tg_table_name = 'letters' then
    insert into private.mod_queue (kind, ref_id) values ('letter', new.id) on conflict do nothing;
  else
    insert into private.mod_queue (kind, ref_id) values ('comment', new.id) on conflict do nothing;
  end if;
  return null;
end
$fn$;
revoke all on function public.mod_enqueue() from public, anon, authenticated;

drop trigger if exists messages_mod_enqueue on public.messages;
create trigger messages_mod_enqueue after insert on public.messages
  for each row execute function public.mod_enqueue();
drop trigger if exists letters_mod_enqueue on public.letters;
create trigger letters_mod_enqueue after insert on public.letters
  for each row execute function public.mod_enqueue();
drop trigger if exists letter_comments_mod_enqueue on public.letter_comments;
create trigger letter_comments_mod_enqueue after insert on public.letter_comments
  for each row execute function public.mod_enqueue();

-- 오늘 (Workers AI 무료 몫이 초기화되는 UTC 00:00 = 한국 오전 9시 기준)
create or replace function private.ai_day_start()
returns timestamptz language sql stable as $fn$
  select date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$fn$;

-- 검토할 글 N개를 가져간다 (서버 전용). 글 본문 + 앞뒤 맥락. 동시에 여러 요청이 와도 같은 글을 두 번 가져가지 않는다.
create or replace function public.mod_claim(p_n int default 3)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare
  cfg    public.app_settings%rowtype;
  v_used int;
  v_take int;
  v_out  jsonb;
begin
  select * into cfg from public.app_settings where id;
  if not cfg.ai_moderation then return '[]'::jsonb; end if;

  -- 정리: 하루 지난 것은 건너뜀 · 세 번 실패한 것은 오류 · 오래된 기록은 지움 (본문은 원래 없다)
  update private.mod_queue set status = 'skipped', done_at = now()
   where status in ('pending','working') and created_at < now() - interval '1 day';
  update private.mod_queue set status = 'error', done_at = now()
   where status = 'working' and claimed_at < now() - interval '2 minutes' and tries >= 3;
  delete from private.mod_queue where created_at < now() - interval '30 days';
  delete from private.ai_chats where created_at < now() - interval '7 days';

  select count(*) into v_used from private.mod_queue where claimed_at >= private.ai_day_start();
  v_take := least(greatest(coalesce(p_n, 0), 0), 10, cfg.ai_mod_daily_cap - v_used);
  if v_take <= 0 then return '[]'::jsonb; end if;

  update private.mod_queue q set status = 'working', claimed_at = now(), tries = q.tries + 1
   where q.id in (select id from private.mod_queue
                   where status = 'pending'
                      or (status = 'working' and claimed_at < now() - interval '2 minutes')
                   order by created_at limit v_take
                   for update skip locked);

  -- 원문이 이미 지워졌으면(방 purge 등) 건너뜀
  update private.mod_queue q set status = 'skipped', done_at = now()
   where q.status = 'working' and q.claimed_at = now()
     and not case q.kind
       when 'message' then exists (select 1 from public.messages m where m.id = q.ref_id)
       when 'letter'  then exists (select 1 from public.letters l where l.id = q.ref_id)
       else exists (select 1 from public.letter_comments c where c.id = q.ref_id) end;

  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'text', x.body, 'context', x.ctx)
                            order by q.id), '[]'::jsonb) into v_out
    from private.mod_queue q
    cross join lateral (
      select m.body,
             -- 앞의 메시지 4개 (시간 순) — 같은 사람 = 작성자, 다른 사람 = 상대
             (select coalesce(jsonb_agg(jsonb_build_object('who', case when p.sender_seat = m.sender_seat then '작성자' else '상대' end,
                                                           'text', left(p.body, 300)) order by p.id), '[]'::jsonb)
                from (select * from public.messages p2
                       where p2.room_id = m.room_id and p2.id < m.id and p2.sender_seat <> 0
                       order by p2.id desc limit 4) p) as ctx
        from public.messages m where q.kind = 'message' and m.id = q.ref_id
      union all
      select l.body, '[]'::jsonb from public.letters l where q.kind = 'letter' and l.id = q.ref_id
      union all
      select c.body,
             jsonb_build_array(jsonb_build_object('who', '편지', 'text', left(l.body, 300)))
             || coalesce((select jsonb_build_array(jsonb_build_object('who', '윗댓글', 'text', left(pc.body, 300)))
                            from public.letter_comments pc where pc.id = c.parent_comment_id), '[]'::jsonb)
        from public.letter_comments c join public.letters l on l.id = c.letter_id
       where q.kind = 'comment' and c.id = q.ref_id
    ) x
   where q.status = 'working' and q.claimed_at = now();
  return v_out;
end
$fn$;

-- AI 가 판정을 못 냈다 (한도 초과 · 오류) — 다음 기회에 다시
create or replace function public.mod_release(p_ids bigint[])
returns void language sql security definer set search_path = public, private as $fn$
  update private.mod_queue set status = 'pending', claimed_at = null, tries = greatest(tries - 1, 0)
   where id = any(p_ids) and status = 'working';
$fn$;

-- 채팅 자동 신고 — 같은 방 · 같은 사람의 처리 안 된 자동 신고가 있으면 거기에 덧붙인다
create or replace function private.auto_report_message(p_msg bigint, p_reason text, p_why text)
returns void language plpgsql security definer set search_path = public, private as $fn$
declare m public.messages%rowtype; v_sender uuid; v_report uuid; v_line text;
begin
  select * into m from public.messages where id = p_msg;
  if not found then return; end if;
  select user_id into v_sender from public.room_members where room_id = m.room_id and seat = m.sender_seat;
  if v_sender is null then return; end if;
  v_line := '[자동 감지] "' || left(m.body, 60) || '" — ' || left(coalesce(p_why, ''), 200);

  select id into v_report from private.reports
   where room_id = m.room_id and source = 'auto' and reported_id = v_sender and status in ('open','reviewing')
   limit 1;
  if v_report is null then
    insert into private.reports (room_id, reporter_id, reported_id, reason, note, source)
    values (m.room_id, null, v_sender, p_reason, v_line, 'auto')
    returning id into v_report;
  else
    update private.reports set note = left(note || E'\n' || v_line, 1000) where id = v_report;
    delete from private.report_evidence where report_id = v_report;
  end if;

  -- 증거: 지금까지의 대화 전문 (1 = 상대, 2 = 걸린 사람)
  insert into private.report_evidence (report_id, ord, sender, body, sent_at)
  select v_report, row_number() over (order by x.id),
         case when x.sender_seat = 0 then 0 when x.sender_seat = m.sender_seat then 2 else 1 end,
         x.body, x.created_at
    from public.messages x where x.room_id = m.room_id and x.id <= m.id;
end
$fn$;

-- 편지 · 댓글 자동 신고
create or replace function private.auto_report_letter(p_kind text, p_ref bigint, p_reason text, p_why text)
returns void language plpgsql security definer set search_path = public, private as $fn$
declare v_letter bigint; v_comment bigint; v_target uuid; v_report uuid; v_body text; c public.letter_comments%rowtype;
begin
  if p_kind = 'letter' then
    v_letter := p_ref;
    select body into v_body from public.letters where id = p_ref;
  else
    select * into c from public.letter_comments where id = p_ref;
    if not found then return; end if;
    v_letter := c.letter_id; v_comment := c.id; v_body := c.body;
  end if;
  v_target := private.letter_target_user(v_letter, v_comment);
  if v_target is null then return; end if;

  select id into v_report from private.letter_reports
   where source = 'auto' and letter_id = v_letter and comment_id is not distinct from v_comment
     and status in ('open','reviewing')
   limit 1;
  if v_report is not null then return; end if;   -- 글 하나에 자동 신고 하나

  insert into private.letter_reports (target_type, letter_id, comment_id, reporter_id, reported_id, reason, note, source)
  values (case when v_comment is null then 'letter' else 'comment' end, v_letter, v_comment, null, v_target,
          p_reason, '[자동 감지] ' || left(coalesce(p_why, ''), 200), 'auto')
  returning id into v_report;

  -- 증거: 편지 본문, (대댓글이면) 윗댓글, 걸린 댓글 — report_letter 와 같은 모양
  insert into private.letter_report_evidence (report_id, ord, kind, alias, body, sent_at)
  select v_report, 1, 'letter', a.alias, l.body, l.created_at
    from public.letters l
    join public.letter_participants a on a.letter_id = l.id and a.participant_no = 1
   where l.id = v_letter;
  if v_comment is not null then
    if c.parent_comment_id is not null then
      insert into private.letter_report_evidence (report_id, ord, kind, alias, body, sent_at)
      select v_report, 2, 'parent', pp.alias, k.body, k.created_at
        from public.letter_comments k
        join public.letter_participants pp on pp.letter_id = k.letter_id and pp.participant_no = k.author_no
       where k.id = c.parent_comment_id;
    end if;
    insert into private.letter_report_evidence (report_id, ord, kind, alias, body, sent_at)
    select v_report, 3, 'comment', pp.alias, c.body, c.created_at
      from public.letter_participants pp where pp.letter_id = c.letter_id and pp.participant_no = c.author_no;
  end if;
end
$fn$;
revoke all on function private.auto_report_message(bigint, text, text) from public, anon, authenticated;
revoke all on function private.auto_report_letter(text, bigint, text, text) from public, anon, authenticated;

-- AI 판정 결과 (서버 전용). 걸렸으면 자동 신고.
create or replace function public.mod_verdict(p_id bigint, p_flag boolean, p_category text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare q private.mod_queue%rowtype; v_cat text;
begin
  select * into q from private.mod_queue where id = p_id for update;
  if not found or q.status <> 'working' then return jsonb_build_object('status', 'gone'); end if;
  v_cat := case when p_category in ('harassment','sexual','hate','personal_info','spam','self_harm')
                then p_category else 'other' end;
  update private.mod_queue
     set status = 'done', done_at = now(),
         verdict = jsonb_build_object('flag', coalesce(p_flag, false), 'category', v_cat, 'reason', left(coalesce(p_reason, ''), 200))
   where id = p_id;
  if coalesce(p_flag, false) then
    if q.kind = 'message' then perform private.auto_report_message(q.ref_id, v_cat, p_reason);
    else perform private.auto_report_letter(q.kind, q.ref_id, v_cat, p_reason);
    end if;
  end if;
  return jsonb_build_object('status', 'ok', 'flagged', coalesce(p_flag, false));
end
$fn$;

-- ── AI 대화 상대 ──
create table if not exists private.ai_chats (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  turns      int not null default 0
);
create index if not exists ai_chats_day  on private.ai_chats (created_at);
create index if not exists ai_chats_user on private.ai_chats (user_id, created_at desc);
alter table private.ai_chats enable row level security;

-- 학생이 부른다. 한도 안이면 새 AI 대화(또는 아직 안 끝난 대화)를 돌려준다.
create or replace function public.ai_chat_start()
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare
  me     uuid := auth.uid();
  cfg    public.app_settings%rowtype;
  p      public.profiles%rowtype;
  v_day  timestamptz := private.ai_day_start();
  v_mine int;
  v_all  int;
  c      private.ai_chats%rowtype;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into cfg from public.app_settings where id;
  if not cfg.ai_chat or not cfg.is_open then return jsonb_build_object('status', 'off'); end if;
  select * into p from public.profiles where id = me;
  if not found or p.status <> 'active' or coalesce(p.suspended_until > now(), false) then
    return jsonb_build_object('status', 'restricted');
  end if;

  -- 아직 안 끝난 대화가 있으면 그걸 이어간다 (화면을 다시 열어도 한 번으로 센다)
  select * into c from private.ai_chats
   where user_id = me and expires_at > now() and turns < cfg.ai_chat_max_turns
   order by created_at desc limit 1;
  if not found then
    select count(*) filter (where user_id = me), count(*) into v_mine, v_all
      from private.ai_chats where created_at >= v_day;
    if v_mine >= cfg.ai_chat_per_user then return jsonb_build_object('status', 'limit', 'per_user', cfg.ai_chat_per_user); end if;
    if v_all >= cfg.ai_chat_daily_cap then return jsonb_build_object('status', 'full'); end if;
    insert into private.ai_chats (user_id, expires_at)
    values (me, now() + make_interval(mins => cfg.ai_chat_minutes))
    returning * into c;
  end if;
  select count(*) into v_mine from private.ai_chats where user_id = me and created_at >= v_day;
  return jsonb_build_object('status', 'ok', 'id', c.id, 'expires_at', c.expires_at, 'turns', c.turns,
    'max_turns', cfg.ai_chat_max_turns, 'left_today', greatest(cfg.ai_chat_per_user - v_mine, 0),
    'server_now', now());
end
$fn$;

-- 한 턴 (서버 전용 — /api/ai-chat 이 토큰에서 확인한 사용자로 부른다). 규칙 필터도 여기서.
create or replace function public.ai_chat_turn(p_chat uuid, p_user uuid, p_text text)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare cfg public.app_settings%rowtype; c private.ai_chats%rowtype; v text;
begin
  select * into cfg from public.app_settings where id;
  select * into c from private.ai_chats where id = p_chat and user_id = p_user for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not cfg.ai_chat then return jsonb_build_object('status', 'off'); end if;
  if now() >= c.expires_at then return jsonb_build_object('status', 'expired'); end if;
  if c.turns >= cfg.ai_chat_max_turns then return jsonb_build_object('status', 'turns'); end if;
  if char_length(btrim(coalesce(p_text, ''))) not between 1 and 500 then return jsonb_build_object('status', 'bad_text'); end if;
  v := private.rule_violation(p_text);
  if v is not null then return jsonb_build_object('status', 'blocked', 'code', v); end if;
  update private.ai_chats set turns = turns + 1 where id = p_chat;
  return jsonb_build_object('status', 'ok', 'turns', c.turns + 1, 'max_turns', cfg.ai_chat_max_turns);
end
$fn$;

-- ── 운영자 ──
create or replace function public.admin_ai_usage()
returns jsonb language sql security definer set search_path = public, private stable as $fn$
  select jsonb_build_object(
    'mod_checked_today', (select count(*) from private.mod_queue where claimed_at >= private.ai_day_start()),
    'mod_flagged_today', (select count(*) from private.mod_queue
                           where done_at >= private.ai_day_start() and (verdict->>'flag')::boolean),
    'mod_pending',       (select count(*) from private.mod_queue where status in ('pending','working')),
    'ai_chats_today',    (select count(*) from private.ai_chats where created_at >= private.ai_day_start()),
    'day_start',         private.ai_day_start());
$fn$;

create or replace function public.admin_banned_terms()
returns jsonb language sql security definer set search_path = public, private stable as $fn$
  select coalesce(jsonb_agg(pattern order by created_at, pattern), '[]'::jsonb) from private.banned_terms;
$fn$;

-- 통째로 바꾼다 (관리자만). 정규식이 틀리면 모든 글이 막히므로 하나씩 미리 돌려 본다.
create or replace function public.admin_set_banned_terms(p_terms text[], p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare t text; v_clean text[] := '{}';
begin
  if private.require_staff(p_staff) <> 'admin' then raise exception 'admin_only'; end if;
  foreach t in array coalesce(p_terms, '{}') loop
    t := lower(btrim(t));
    if t = '' or t = any(v_clean) then continue; end if;
    if char_length(t) > 100 then raise exception 'bad_pattern:%', left(t, 40); end if;
    begin
      perform '' ~ t;
    exception when others then
      raise exception 'bad_pattern:%', left(t, 40);
    end;
    v_clean := v_clean || t;
  end loop;
  if cardinality(v_clean) > 300 then raise exception 'too_many_terms'; end if;
  delete from private.banned_terms where pattern <> all(v_clean);
  insert into private.banned_terms (pattern) select unnest(v_clean) on conflict do nothing;
  insert into private.audit_log (staff_id, action, detail)
  values (p_staff, 'update_banned_terms', jsonb_build_object('count', cardinality(v_clean)));
  return public.admin_banned_terms();
end
$fn$;

do $do$
declare f text;
begin
  foreach f in array array[
    'mod_claim(int)', 'mod_release(bigint[])', 'mod_verdict(bigint, boolean, text, text)',
    'ai_chat_turn(uuid, uuid, text)', 'admin_ai_usage()', 'admin_banned_terms()',
    'admin_set_banned_terms(text[], uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$do$;
revoke all on function public.ai_chat_start() from public, anon;
grant execute on function public.ai_chat_start() to authenticated;


-- ════════════════════════════════════════════════════════════════════
--  Phase 20 — 대화 백업 (CSV) — 서버에서 지워지기(방이 닫히고 24시간 뒤, 매일 04:17) 전에 관리자가 내려받는다
--
--  · 관리자만. 내려받을 때마다 활동 기록(export_messages)에 기간과 함께 남는다.
--  · 파일에는 계정 정보(이메일 · 사용자 id)가 없다 — 방 번호 · 방 안 익명 이름 · 시각 · 내용만.
--    누가 누구였는지는 여전히 운영자 화면에서만, 열람 기록과 함께 (방 번호로 찾아간다).
--  · 한 번에 최대 10,000줄씩 잘라서 준다 (Workers 의 요청당 CPU 한도 안에서 끝나게). 화면이 이어 붙인다.
--  · 엑셀 수식 주입 방지: = + - @ 로 시작하는 칸은 앞에 ' 를 붙인다 (학생이 쓴 글이 엑셀에서 실행되지 않게).
-- ════════════════════════════════════════════════════════════════════

create or replace function private.csv_cell(v text)
returns text language sql immutable as $fn$
  select '"' || replace(case when coalesce(v, '') ~ '^[=+\-@\t\r]' then '''' || v else coalesce(v, '') end, '"', '""') || '"';
$fn$;

create or replace function public.admin_export_messages(
  p_staff uuid, p_from timestamptz, p_to timestamptz, p_after bigint default 0, p_limit int default 5000)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare v_csv text; v_last bigint; v_n int;
begin
  if private.require_staff(p_staff) <> 'admin' then raise exception 'admin_only'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'bad_range'; end if;
  -- 첫 조각을 받을 때 한 번 기록 (이어 받는 조각마다 남기면 기록이 어지럽다)
  if coalesce(p_after, 0) = 0 then
    insert into private.audit_log (staff_id, action, detail)
    values (p_staff, 'export_messages', jsonb_build_object('from', p_from, 'to', p_to));
  end if;

  with x as (
    select m.id, m.room_id, r.status, m.sender_seat,
           case m.sender_seat when 1 then r.alias1 when 2 then r.alias2 else '시스템 안내' end as alias,
           m.created_at, m.body, m.reply_to
      from public.messages m
      join public.rooms r on r.id = m.room_id
     where m.id > coalesce(p_after, 0) and m.created_at >= p_from and m.created_at < p_to
     order by m.id
     limit least(greatest(coalesce(p_limit, 5000), 1), 10000)
  )
  select string_agg(array_to_string(array[
           x.id::text, x.room_id::text, x.status, x.sender_seat::text, private.csv_cell(x.alias),
           to_char(x.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS'),
           private.csv_cell(x.body), coalesce(x.reply_to::text, '')], ','), E'\n' order by x.id),
         max(x.id), count(*)
    into v_csv, v_last, v_n
    from x;
  return jsonb_build_object('csv', coalesce(v_csv, ''), 'last_id', v_last, 'count', v_n);
end
$fn$;
revoke all on function private.csv_cell(text) from public, anon, authenticated;
revoke all on function public.admin_export_messages(uuid, timestamptz, timestamptz, bigint, int) from public, anon, authenticated;
grant execute on function public.admin_export_messages(uuid, timestamptz, timestamptz, bigint, int) to service_role;


-- ════════════════════════════════════════════════════════════════════
--  Phase 21 — 만났던 사람도 다시 만나기 (설정 화면 스위치)
--
--  · 기본은 꺼짐 — 지금처럼 최근(운영 설정 rematch_cooldown_days, 기본 7일)에 대화한 상대는 다시 잡히지 않는다.
--  · 둘 다 켰을 때만 다시 잡힌다 (한쪽만 켜면 그대로 제외 — 다시 만나고 싶지 않은 사람의 뜻이 우선).
--  · 켜도 처음 보는 사람이 기다리고 있으면 그쪽이 먼저. 차단한 사이 · 이미 대화 중인 사이는 여전히 안 잡힌다.
--  · 본인만 바꾼다 (profiles 의 열 단위 update 권한 + "self update" 정책).
-- ════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists allow_rematch boolean not null default false;
grant update (allow_rematch) on public.profiles to authenticated;


-- ════════════════════════════════════════════════════════════════════
--  Phase 22 — 보안 점검 (SECURITY.md)
--
--  · 표 권한 줄이기 — Supabase 는 새 표에 anon · authenticated 권한을 넉넉히 준다. RLS 가 막고 있지만
--    RLS 를 거치지 않는 권한(TRUNCATE 등)까지 남겨 둘 이유가 없다. 앱이 직접 읽는 것만 남긴다:
--      profiles = 내 행 읽기(RLS) + 정해진 열 고치기,  app_settings = 읽기,  user_presence = 없음(전부 RPC)
--  · 트리거 전용 함수는 누구도 직접 부를 수 없게 (트리거로 도는 데는 실행 권한이 필요 없다)
--  · 바깥 표를 쓰지 않는 함수들의 search_path 고정 (Supabase 점검기 경고)
--  · 푸시 구독: 알려진 푸시 서버 주소만 · 한 사람 10대까지 (save_push_subscription 에서)
-- ════════════════════════════════════════════════════════════════════
revoke all on public.profiles from anon;
revoke insert, delete, truncate, references, trigger on public.profiles from authenticated;
revoke all on public.user_presence from anon, authenticated;
revoke all on public.app_settings from anon;
revoke insert, update, delete, truncate, references, trigger on public.app_settings from authenticated;

revoke execute on function public.handle_new_user(), public.msg_rate_limit(), public.sync_verified()
  from public, anon, authenticated;
revoke execute on function public.random_alias() from public, anon, authenticated;

alter function public.random_alias() set search_path = '';
alter function private.letter_fmt_ok(jsonb, text) set search_path = '';
alter function private.letter_alias_candidate() set search_path = '';
alter function private.nickname_candidate() set search_path = '';
alter function private.email_student_no(text) set search_path = '';
alter function private.ai_day_start() set search_path = '';
alter function private.mod_max_suspend_days() set search_path = '';
alter function private.csv_cell(text) set search_path = '';

-- 예전 규칙(https 면 무엇이든)으로 저장된 구독 중 알려진 푸시 서버가 아닌 주소는 지운다
delete from public.push_subscriptions
 where endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com)/';

-- ════════════════════════════════════════════════════════════════════
--  Phase 23 — 이름 편지 (익명편지 리뉴얼)
--
--  학생을 이름으로 찾아 → 익명으로 편지를 보내고 → 둘이 주고받는다.
--   · 받는 사람은 이름이 보인다(보낸 사람이 찾아서 골랐으니까). 보낸 사람은 편지마다 새로 붙는 익명 이름뿐.
--   · 이름은 명렬표(학교 이메일 앞자리 = 학번)에서 가져온다 — 학생이 고칠 수 없어 남의 이름으로 사칭할 수 없다.
--     명렬표에 없는 사람만 한 번 직접 적는다. 명렬표에 있는 이름은 적을 수 없다.
--   · 검색 · 받기는 profiles.letters_open(기본 켜짐)으로 끌 수 있다. 차단한 사이는 서로 검색 · 편지 불가.
--   · 괴롭힘 막기: 새 편지는 편지 한도(기본 하루 3통) · 한쪽이 답 없이 3개까지 · 받는 사람이 끝내면 그 사람에게 다시 못 보냄
--     · 규칙 필터(신상정보 · 금칙어) · AI 검토 · 신고(운영진은 보낸 사람을 기록과 함께 확인할 수 있다).
--   · 표는 전부 private — 학생은 아래 RPC 로만. 보낸 사람의 계정은 받는 사람에게 어떤 응답에도 나오지 않는다.
--   · 예전 공개 편지(letters · letter_comments)는 그대로 남겨 두되 학생 화면에서는 쓰지 않는다.
-- ════════════════════════════════════════════════════════════════════

-- ── 이름 ──
create table if not exists private.self_names (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  name       text not null check (char_length(name) between 2 and 20),
  created_at timestamptz not null default now()
);
alter table private.self_names enable row level security;

-- 한 사람의 이름 · 학년 · 출처(roster = 명렬표, self = 직접 적음)
create or replace function private.person(p_user uuid)
returns table (name text, grade smallint, source text)
language sql security definer set search_path = '' stable as $fn$
  select coalesce(r.name, s.name), r.grade,
         case when r.name is not null then 'roster' when s.name is not null then 'self' end
    from auth.users u
    left join private.student_roster r on r.student_no = private.email_student_no(u.email)::int
    left join private.self_names s on s.user_id = u.id
   where u.id = p_user;
$fn$;
revoke all on function private.person(uuid) from public, anon, authenticated;

-- 내 계정 — 비밀번호 여부 + 이름(Phase 23)
create or replace function public.my_account()
returns jsonb language sql security definer set search_path = public, auth stable as $fn$
  select jsonb_build_object('has_password', coalesce(u.encrypted_password, '') <> '',
                            'name', p.name, 'grade', p.grade, 'name_source', p.source)
    from auth.users u cross join lateral private.person(u.id) p
   where u.id = auth.uid();
$fn$;

-- 명렬표에 없는 사람만 한 번 — 명렬표에 있는 이름은 쓸 수 없다(사칭 방지). 바꾸려면 운영진에게.
create or replace function public.set_my_name(p_name text)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); v text := btrim(coalesce(p_name, '')); cur record;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into cur from private.person(me);
  if cur.source = 'roster' then return jsonb_build_object('status', 'roster'); end if;
  if cur.source = 'self' then return jsonb_build_object('status', 'already'); end if;
  if v !~ '^[가-힣A-Za-z]{2,20}$' then return jsonb_build_object('status', 'bad_name'); end if;
  if exists (select 1 from private.student_roster where name = v) then
    return jsonb_build_object('status', 'name_in_roster');
  end if;
  insert into private.self_names (user_id, name) values (me, v);
  return jsonb_build_object('status', 'ok');
end
$fn$;

-- ── 받기 설정 ──
alter table public.profiles add column if not exists letters_open boolean not null default true;
grant update (letters_open) on public.profiles to authenticated;

-- ── 편지 (대화 한 줄기 = thread) ──
create table if not exists private.dm_threads (
  id             bigint generated always as identity primary key,
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  recipient_id   uuid not null references public.profiles(id) on delete cascade,
  sender_alias   text not null,                  -- 받는 사람에게 보이는 이름 ("익명 · 푸른 우표")
  status         text not null default 'open' check (status in ('open','closed','removed')),
  closed_by      text check (closed_by in ('sender','recipient','staff')),
  created_at     timestamptz not null default now(),
  last_at        timestamptz not null default now(),
  sender_read    bigint not null default 0,      -- 어디까지 읽었나 (dm_msgs.id)
  recipient_read bigint not null default 0,
  check (sender_id <> recipient_id)
);
create unique index if not exists dm_threads_pair_open on private.dm_threads (sender_id, recipient_id) where status = 'open';
create index if not exists dm_threads_sender    on private.dm_threads (sender_id, last_at desc);
create index if not exists dm_threads_recipient on private.dm_threads (recipient_id, last_at desc);
alter table private.dm_threads enable row level security;

create table if not exists private.dm_msgs (
  id          bigint generated always as identity primary key,
  thread_id   bigint not null references private.dm_threads(id) on delete cascade,
  from_sender boolean not null,
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  status      text not null default 'visible' check (status in ('visible','removed')),
  created_at  timestamptz not null default now()
);
create index if not exists dm_msgs_thread on private.dm_msgs (thread_id, id);
alter table private.dm_msgs enable row level security;

-- 규칙 필터 (신상정보 · 금칙어) — 채팅 · 편지와 같은 함수
drop trigger if exists dm_msgs_rule_check on private.dm_msgs;
create trigger dm_msgs_rule_check before insert on private.dm_msgs
  for each row execute function public.content_rule_check();

-- AI 검토 대기열에 'dm'
alter table private.mod_queue drop constraint if exists mod_queue_kind_check;
alter table private.mod_queue add constraint mod_queue_kind_check check (kind in ('message','letter','comment','dm'));

create or replace function public.mod_enqueue()
returns trigger language plpgsql security definer set search_path = public, private as $fn$
begin
  if not coalesce((select ai_moderation from public.app_settings where id), false) then return null; end if;
  if tg_table_name = 'messages' then
    if new.sender_seat = 0 then return null; end if;
    insert into private.mod_queue (kind, ref_id) values ('message', new.id) on conflict do nothing;
  elsif tg_table_name = 'letters' then
    insert into private.mod_queue (kind, ref_id) values ('letter', new.id) on conflict do nothing;
  elsif tg_table_name = 'dm_msgs' then
    insert into private.mod_queue (kind, ref_id) values ('dm', new.id) on conflict do nothing;
  else
    insert into private.mod_queue (kind, ref_id) values ('comment', new.id) on conflict do nothing;
  end if;
  return null;
end
$fn$;
revoke all on function public.mod_enqueue() from public, anon, authenticated;
drop trigger if exists dm_msgs_mod_enqueue on private.dm_msgs;
create trigger dm_msgs_mod_enqueue after insert on private.dm_msgs
  for each row execute function public.mod_enqueue();

-- 편지 한 줄기에서 나(me)의 자리 — 'sender' / 'recipient' / null(남의 것)
create or replace function private.dm_role(p_thread bigint, p_user uuid)
returns text language sql security definer set search_path = '' stable as $fn$
  select case when t.sender_id = p_user then 'sender' when t.recipient_id = p_user then 'recipient' end
    from private.dm_threads t where t.id = p_thread;
$fn$;
revoke all on function private.dm_role(bigint, uuid) from public, anon, authenticated;

-- 보낼 수 있는 사람인가 (학생 쪽 공통) — 정지 · 온보딩 · 이름
create or replace function private.dm_can_write(p_user uuid)
returns text language plpgsql security definer set search_path = public, private stable as $fn$
declare p public.profiles%rowtype;
begin
  select * into p from public.profiles where id = p_user;
  if not found or not p.onboarded or p.status <> 'active' or coalesce(p.suspended_until > now(), false) then
    return 'restricted';
  end if;
  if (select name from private.person(p_user)) is null then return 'no_name'; end if;
  return null;
end
$fn$;
revoke all on function private.dm_can_write(uuid) from public, anon, authenticated;

-- 한쪽이 답 없이 연달아 보낸 수
create or replace function private.dm_streak(p_thread bigint, p_from_sender boolean)
returns int language sql security definer set search_path = '' stable as $fn$
  select count(*)::int from private.dm_msgs m
   where m.thread_id = p_thread and m.from_sender = p_from_sender
     and m.id > coalesce((select max(o.id) from private.dm_msgs o
                           where o.thread_id = p_thread and o.from_sender <> p_from_sender), 0);
$fn$;
revoke all on function private.dm_streak(bigint, boolean) from public, anon, authenticated;

-- 학생 찾기 — 이름에 검색어가 들어간 사람 10명. 받기를 끈 사람 · 차단한 사이 · 이용 제한 · 나 자신은 빼고.
create or replace function public.dm_search(p_q text)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare me uuid := auth.uid(); q text := btrim(coalesce(p_q, ''));
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'grade', x.grade, 'checked', x.source = 'roster')
                     order by x.exact desc, x.grade nulls last, x.name)
      from (select p.id, n.name, n.grade, n.source, n.name = q as exact
              from public.profiles p
              cross join lateral private.person(p.id) n
             where p.id <> me and p.letters_open and p.onboarded and p.status = 'active'
               and (p.suspended_until is null or p.suspended_until <= now())
               and n.name is not null and position(q in n.name) > 0
               and not private.blocked_between(me, p.id)
             order by (n.name = q) desc, n.grade nulls last, n.name
             limit 10) x), '[]'::jsonb);
end
$fn$;

-- 새 편지 — 받는 사람과 열린 편지가 있으면 거기에 이어 쓴다
create or replace function public.dm_send(p_to uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); v text; t private.dm_threads%rowtype; b jsonb; p public.profiles%rowtype; mid bigint;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  v := private.dm_can_write(me);
  if v is not null then return jsonb_build_object('status', v); end if;
  if p_to is null or p_to = me then return jsonb_build_object('status', 'not_available'); end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then return jsonb_build_object('status', 'bad_text'); end if;

  select * into p from public.profiles where id = p_to;
  if not found or not p.letters_open or not p.onboarded or p.status <> 'active'
     or coalesce(p.suspended_until > now(), false) or private.blocked_between(me, p_to) then
    return jsonb_build_object('status', 'not_available');   -- 왜 안 되는지(차단 · 받기 끔)는 알려 주지 않는다
  end if;
  -- 받는 사람이 끝낸 적이 있으면 그 사람에게는 다시 못 보낸다
  if exists (select 1 from private.dm_threads where sender_id = me and recipient_id = p_to and closed_by = 'recipient') then
    return jsonb_build_object('status', 'not_available');
  end if;

  select * into t from private.dm_threads where sender_id = me and recipient_id = p_to and status = 'open' for update;
  if found then
    if private.dm_streak(t.id, true) >= 3 then return jsonb_build_object('status', 'wait_reply', 'thread_id', t.id); end if;
    b := private.letter_bucket_take(me, 'comment');
  else
    b := private.letter_bucket_take(me, 'letter');       -- 새 편지는 편지 한도 (기본 하루 3통)
  end if;
  if not (b->>'ok')::boolean then
    return jsonb_build_object('status', 'rate_limited', 'retry_after_ms', (b->>'retry_after_ms')::int);
  end if;
  if t.id is null then
    insert into private.dm_threads (sender_id, recipient_id, sender_alias)
    values (me, p_to, private.letter_alias_candidate()) returning * into t;
  end if;
  insert into private.dm_msgs (thread_id, from_sender, body) values (t.id, true, btrim(p_body)) returning id into mid;
  update private.dm_threads set last_at = now(), sender_read = mid where id = t.id;
  return jsonb_build_object('status', 'ok', 'thread_id', t.id, 'msg_id', mid);
end
$fn$;

-- 답장 (보낸 사람 · 받는 사람 둘 다)
create or replace function public.dm_reply(p_thread bigint, p_body text)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); v text; role text; t private.dm_threads%rowtype; b jsonb; mid bigint;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into t from private.dm_threads where id = p_thread for update;
  role := case when t.sender_id = me then 'sender' when t.recipient_id = me then 'recipient' end;
  if role is null or t.status = 'removed' then return jsonb_build_object('status', 'not_found'); end if;
  if t.status <> 'open' then return jsonb_build_object('status', 'closed'); end if;
  v := private.dm_can_write(me);
  if v is not null then return jsonb_build_object('status', v); end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then return jsonb_build_object('status', 'bad_text'); end if;
  if private.blocked_between(t.sender_id, t.recipient_id) then return jsonb_build_object('status', 'closed'); end if;
  if private.dm_streak(p_thread, role = 'sender') >= 3 then return jsonb_build_object('status', 'wait_reply'); end if;
  b := private.letter_bucket_take(me, 'comment');
  if not (b->>'ok')::boolean then
    return jsonb_build_object('status', 'rate_limited', 'retry_after_ms', (b->>'retry_after_ms')::int);
  end if;
  insert into private.dm_msgs (thread_id, from_sender, body) values (p_thread, role = 'sender', btrim(p_body)) returning id into mid;
  if role = 'sender' then update private.dm_threads set last_at = now(), sender_read = mid where id = p_thread;
  else update private.dm_threads set last_at = now(), recipient_read = mid where id = p_thread; end if;
  return jsonb_build_object('status', 'ok', 'msg_id', mid);
end
$fn$;

-- 받은 · 보낸 편지 목록. 받는 사람에게 보낸 사람은 익명 이름뿐.
create or replace function public.dm_inbox()
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  return jsonb_build_object('threads', coalesce((
    select jsonb_agg(x order by x.last_at desc) from (
      select t.id, t.status, t.last_at,
             case when t.sender_id = me then 'sent' else 'received' end as role,
             case when t.sender_id = me then (select name from private.person(t.recipient_id)) else t.sender_alias end as title,
             case when t.sender_id = me then (select grade from private.person(t.recipient_id)) end as grade,
             (select left(m.body, 80) from private.dm_msgs m where m.thread_id = t.id and m.status = 'visible' order by m.id desc limit 1) as last_body,
             (select count(*) from private.dm_msgs m
               where m.thread_id = t.id and m.status = 'visible'
                 and m.from_sender = (t.sender_id <> me)
                 and m.id > case when t.sender_id = me then t.sender_read else t.recipient_read end)::int as unread
        from private.dm_threads t
       where (t.sender_id = me or t.recipient_id = me) and t.status <> 'removed'
       order by t.last_at desc limit 100) x), '[]'::jsonb),
    'server_now', now());
end
$fn$;

-- 편지 한 줄기 — 열면 읽음으로
create or replace function public.dm_thread(p_thread bigint)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); t private.dm_threads%rowtype; role text; last bigint;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into t from private.dm_threads where id = p_thread;
  role := case when t.sender_id = me then 'sender' when t.recipient_id = me then 'recipient' end;
  if role is null or t.status = 'removed' then return jsonb_build_object('status', 'not_found'); end if;
  select max(id) into last from private.dm_msgs where thread_id = p_thread;
  if role = 'sender' then update private.dm_threads set sender_read = greatest(sender_read, coalesce(last, 0)) where id = p_thread;
  else update private.dm_threads set recipient_read = greatest(recipient_read, coalesce(last, 0)) where id = p_thread; end if;
  return jsonb_build_object(
    'status', 'ok', 'id', t.id, 'role', case when role = 'sender' then 'sent' else 'received' end,
    'title', case when role = 'sender' then (select name from private.person(t.recipient_id)) else t.sender_alias end,
    'grade', case when role = 'sender' then (select grade from private.person(t.recipient_id)) end,
    'thread_status', t.status, 'closed_by', t.closed_by,
    'wait_reply', t.status = 'open' and private.dm_streak(p_thread, role = 'sender') >= 3,
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', m.id, 'mine', m.from_sender = (role = 'sender'),
                   'body', case when m.status = 'visible' then m.body end, 'removed', m.status = 'removed',
                   'created_at', m.created_at) order by m.id)
                 from private.dm_msgs m where m.thread_id = p_thread), '[]'::jsonb),
    'server_now', now());
end
$fn$;

-- 그만 주고받기 (둘 다 가능). 받는 사람이 끝내면 그 보낸 사람은 다시 편지를 보낼 수 없다.
create or replace function public.dm_close(p_thread bigint)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); role text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  role := private.dm_role(p_thread, me);
  if role is null then return jsonb_build_object('status', 'not_found'); end if;
  update private.dm_threads set status = 'closed', closed_by = role
   where id = p_thread and status = 'open';
  return jsonb_build_object('status', 'ok');
end
$fn$;

-- 차단 — 상대 계정은 알려 주지 않고 blocks 에 넣는다 (채팅 · 검색에서도 서로 안 보인다)
create or replace function public.dm_block(p_thread bigint)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); t private.dm_threads%rowtype; other uuid; role text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into t from private.dm_threads where id = p_thread;
  role := case when t.sender_id = me then 'sender' when t.recipient_id = me then 'recipient' end;
  if role is null then return jsonb_build_object('status', 'not_found'); end if;
  other := case when role = 'sender' then t.recipient_id else t.sender_id end;
  insert into public.blocks (blocker_id, blocked_id) values (me, other) on conflict do nothing;
  update private.dm_threads set status = 'closed', closed_by = role where id = p_thread and status = 'open';
  return jsonb_build_object('status', 'ok');
end
$fn$;

-- ── 신고 — 편지 신고함(letter_reports)에 target_type 'dm' 으로. letter_id = 편지 줄기 id, comment_id = 신고한 말 id
alter table private.letter_reports drop constraint if exists letter_reports_target_type_check;
alter table private.letter_reports add constraint letter_reports_target_type_check check (target_type in ('letter','comment','dm'));
drop index if exists private.letter_reports_once_letter;
create unique index if not exists letter_reports_once_letter
  on private.letter_reports (target_type, letter_id, reporter_id) where comment_id is null;
drop index if exists private.letter_reports_once_comment;
create unique index if not exists letter_reports_once_comment
  on private.letter_reports (target_type, comment_id, reporter_id) where comment_id is not null;

-- 증거: 그 줄기의 말 전부 (신고 순간의 사본). alias = 보낸 사람은 익명 이름, 받는 사람은 이름
create or replace function private.dm_copy_evidence(p_report uuid, p_thread bigint)
returns void language sql security definer set search_path = '' as $fn$
  insert into private.letter_report_evidence (report_id, ord, kind, alias, body, sent_at)
  select p_report, row_number() over (order by m.id),
         case when m.from_sender then 'dm_sender' else 'dm_recipient' end,
         case when m.from_sender then t.sender_alias else (select name from private.person(t.recipient_id)) end,
         m.body, m.created_at
    from private.dm_msgs m join private.dm_threads t on t.id = m.thread_id
   where m.thread_id = p_thread
  on conflict do nothing;
$fn$;
revoke all on function private.dm_copy_evidence(uuid, bigint) from public, anon, authenticated;

create or replace function public.dm_report(p_thread bigint, p_reason text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); t private.dm_threads%rowtype; role text; other uuid; v_report uuid;
        cfg public.app_settings%rowtype; v_n int;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if p_reason not in ('harassment','sexual','spam','personal_info','hate','impersonation','other') then
    raise exception 'invalid_reason';
  end if;
  select * into t from private.dm_threads where id = p_thread;
  role := case when t.sender_id = me then 'sender' when t.recipient_id = me then 'recipient' end;
  if role is null then return jsonb_build_object('status', 'not_found'); end if;
  other := case when role = 'sender' then t.recipient_id else t.sender_id end;
  if exists (select 1 from private.letter_reports where target_type = 'dm' and letter_id = p_thread and reporter_id = me and comment_id is null) then
    return jsonb_build_object('status', 'already');
  end if;
  insert into private.letter_reports (target_type, letter_id, comment_id, reporter_id, reported_id, reason, note)
  values ('dm', p_thread, null, me, other, p_reason, left(coalesce(p_note, ''), 1000))
  returning id into v_report;
  perform private.dm_copy_evidence(v_report, p_thread);
  -- 신고하면 차단 + 끝내기 (채팅 · 편지와 같다)
  insert into public.blocks (blocker_id, blocked_id) values (me, other) on conflict do nothing;
  update private.dm_threads set status = 'closed', closed_by = role where id = p_thread and status = 'open';

  -- 자동 정지 — 편지 신고와 같이 센다
  select * into cfg from public.app_settings where id;
  select count(distinct reporter_id) into v_n from private.letter_reports
   where reported_id = other and status <> 'dismissed' and created_at > now() - interval '30 days';
  if v_n >= cfg.letter_auto_suspend_reports then
    update public.profiles set status = 'suspended' where id = other and status = 'active';
    if found then
      insert into private.audit_log (staff_id, action, target_user, report_id, detail)
      values (null, 'auto_suspend_letters', other, v_report, jsonb_build_object('distinct_reporters', v_n));
      perform public.close_room(rm.room_id, 'admin') from public.room_members rm where rm.user_id = other and rm.open;
    end if;
  end if;
  return jsonb_build_object('status', 'ok');
end
$fn$;

-- AI 가 걸어 낸 편지 — 자동 신고 (줄기 하나에 하나)
create or replace function private.auto_report_dm(p_msg bigint, p_reason text, p_why text)
returns void language plpgsql security definer set search_path = public, private as $fn$
declare m private.dm_msgs%rowtype; t private.dm_threads%rowtype; v_target uuid; v_report uuid;
begin
  select * into m from private.dm_msgs where id = p_msg;
  if not found then return; end if;
  select * into t from private.dm_threads where id = m.thread_id;
  v_target := case when m.from_sender then t.sender_id else t.recipient_id end;
  if exists (select 1 from private.letter_reports where source = 'auto' and target_type = 'dm' and letter_id = t.id
                and status in ('open','reviewing')) then return; end if;
  insert into private.letter_reports (target_type, letter_id, comment_id, reporter_id, reported_id, reason, note, source)
  values ('dm', t.id, p_msg, null, v_target, p_reason, '[자동 감지] ' || left(coalesce(p_why, ''), 200), 'auto')
  returning id into v_report;
  perform private.dm_copy_evidence(v_report, t.id);
end
$fn$;
revoke all on function private.auto_report_dm(bigint, text, text) from public, anon, authenticated;

create or replace function public.mod_verdict(p_id bigint, p_flag boolean, p_category text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare q private.mod_queue%rowtype; v_cat text;
begin
  select * into q from private.mod_queue where id = p_id for update;
  if not found or q.status <> 'working' then return jsonb_build_object('status', 'gone'); end if;
  v_cat := case when p_category in ('harassment','sexual','hate','personal_info','spam','self_harm')
                then p_category else 'other' end;
  update private.mod_queue
     set status = 'done', done_at = now(),
         verdict = jsonb_build_object('flag', coalesce(p_flag, false), 'category', v_cat, 'reason', left(coalesce(p_reason, ''), 200))
   where id = p_id;
  if coalesce(p_flag, false) then
    if q.kind = 'message' then perform private.auto_report_message(q.ref_id, v_cat, p_reason);
    elsif q.kind = 'dm' then perform private.auto_report_dm(q.ref_id, v_cat, p_reason);
    else perform private.auto_report_letter(q.kind, q.ref_id, v_cat, p_reason);
    end if;
  end if;
  return jsonb_build_object('status', 'ok', 'flagged', coalesce(p_flag, false));
end
$fn$;

-- AI 검토: 이름 편지(dm)도 가져간다 (Phase 19 의 mod_claim 에 dm 줄기를 더한 것)
create or replace function public.mod_claim(p_n int default 3)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare
  cfg    public.app_settings%rowtype;
  v_used int;
  v_take int;
  v_out  jsonb;
begin
  select * into cfg from public.app_settings where id;
  if not cfg.ai_moderation then return '[]'::jsonb; end if;

  -- 정리: 하루 지난 것은 건너뜀 · 세 번 실패한 것은 오류 · 오래된 기록은 지움 (본문은 원래 없다)
  update private.mod_queue set status = 'skipped', done_at = now()
   where status in ('pending','working') and created_at < now() - interval '1 day';
  update private.mod_queue set status = 'error', done_at = now()
   where status = 'working' and claimed_at < now() - interval '2 minutes' and tries >= 3;
  delete from private.mod_queue where created_at < now() - interval '30 days';
  delete from private.ai_chats where created_at < now() - interval '7 days';

  select count(*) into v_used from private.mod_queue where claimed_at >= private.ai_day_start();
  v_take := least(greatest(coalesce(p_n, 0), 0), 10, cfg.ai_mod_daily_cap - v_used);
  if v_take <= 0 then return '[]'::jsonb; end if;

  update private.mod_queue q set status = 'working', claimed_at = now(), tries = q.tries + 1
   where q.id in (select id from private.mod_queue
                   where status = 'pending'
                      or (status = 'working' and claimed_at < now() - interval '2 minutes')
                   order by created_at limit v_take
                   for update skip locked);

  -- 원문이 이미 지워졌으면(방 purge 등) 건너뜀
  update private.mod_queue q set status = 'skipped', done_at = now()
   where q.status = 'working' and q.claimed_at = now()
     and not case q.kind
       when 'message' then exists (select 1 from public.messages m where m.id = q.ref_id)
       when 'letter'  then exists (select 1 from public.letters l where l.id = q.ref_id)
       when 'dm'      then exists (select 1 from private.dm_msgs d where d.id = q.ref_id and d.status = 'visible')
       else exists (select 1 from public.letter_comments c where c.id = q.ref_id) end;

  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'text', x.body, 'context', x.ctx)
                            order by q.id), '[]'::jsonb) into v_out
    from private.mod_queue q
    cross join lateral (
      select m.body,
             -- 앞의 메시지 4개 (시간 순) — 같은 사람 = 작성자, 다른 사람 = 상대
             (select coalesce(jsonb_agg(jsonb_build_object('who', case when p.sender_seat = m.sender_seat then '작성자' else '상대' end,
                                                           'text', left(p.body, 300)) order by p.id), '[]'::jsonb)
                from (select * from public.messages p2
                       where p2.room_id = m.room_id and p2.id < m.id and p2.sender_seat <> 0
                       order by p2.id desc limit 4) p) as ctx
        from public.messages m where q.kind = 'message' and m.id = q.ref_id
      union all
      select l.body, '[]'::jsonb from public.letters l where q.kind = 'letter' and l.id = q.ref_id
      union all
      select c.body,
             jsonb_build_array(jsonb_build_object('who', '편지', 'text', left(l.body, 300)))
             || coalesce((select jsonb_build_array(jsonb_build_object('who', '윗댓글', 'text', left(pc.body, 300)))
                            from public.letter_comments pc where pc.id = c.parent_comment_id), '[]'::jsonb)
        from public.letter_comments c join public.letters l on l.id = c.letter_id
       where q.kind = 'comment' and c.id = q.ref_id
      union all
      -- 이름 편지 (Phase 23) — 앞의 말 4개 (같은 쪽 = 작성자)
      select d.body,
             (select coalesce(jsonb_agg(jsonb_build_object('who', case when e.from_sender = d.from_sender then '작성자' else '상대' end,
                                                           'text', left(e.body, 300)) order by e.id), '[]'::jsonb)
                from (select * from private.dm_msgs e2
                       where e2.thread_id = d.thread_id and e2.id < d.id and e2.status = 'visible'
                       order by e2.id desc limit 4) e)
        from private.dm_msgs d where q.kind = 'dm' and d.id = q.ref_id
    ) x
   where q.status = 'working' and q.claimed_at = now();
  return v_out;
end
$fn$;

-- 운영자: 신고 상세에 편지 줄기 상태 · 내리기
create or replace function public.admin_letter_report(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare r private.letter_reports%rowtype;
begin
  select * into r from private.letter_reports where id = p_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'report', to_jsonb(r),
    'evidence', (select coalesce(jsonb_agg(jsonb_build_object(
                    'ord', e.ord, 'kind', e.kind, 'alias', e.alias, 'body', e.body, 'sent_at', e.sent_at)
                    order by e.ord), '[]'::jsonb)
                   from private.letter_report_evidence e where e.report_id = p_id),
    'target', case when r.target_type = 'dm' then
                jsonb_build_object('thread_status', (select status from private.dm_threads where id = r.letter_id))
              else jsonb_build_object(
                'letter_status', (select status from public.letters where id = r.letter_id),
                'comment_status', (select status from public.letter_comments where id = r.comment_id)) end,
    'reported', (select jsonb_build_object('status', p.status, 'strikes', p.strikes,
                        'suspended_until', p.suspended_until, 'created_at', p.created_at)
                   from public.profiles p where p.id = r.reported_id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', h.id, 'created_at', h.created_at, 'reason', h.reason, 'status', h.status)
                    order by h.created_at desc), '[]'::jsonb)
                  from private.letter_reports h where h.reported_id = r.reported_id and h.id <> p_id),
    'chat_reports', (select count(*) from private.reports where reported_id = r.reported_id),
    'reporter_filed', (select count(*) from private.letter_reports f where f.reporter_id = r.reporter_id),
    'reporter_dismissed', (select count(*) from private.letter_reports f
                            where f.reporter_id = r.reporter_id and f.status = 'dismissed'));
end
$fn$;

-- 편지 줄기 내리기 (운영진) — 둘 다에게서 사라진다. 증거는 신고에 복사돼 있다.
create or replace function public.admin_remove_dm(p_thread bigint, p_staff uuid, p_report uuid)
returns void language plpgsql security definer set search_path = public, private as $fn$
begin
  perform private.require_staff(p_staff);
  update private.dm_threads set status = 'removed', closed_by = 'staff' where id = p_thread;
  if not found then raise exception 'thread_not_found'; end if;
  insert into private.audit_log (staff_id, action, report_id, detail)
  values (p_staff, 'remove_dm', p_report, jsonb_build_object('thread', p_thread));
end
$fn$;

-- ── 푸시 — 새 편지 · 답장. 받는 사람에게 보낸 사람은 "익명"으로만.
create table if not exists private.dm_push_log (
  msg_id     bigint primary key references private.dm_msgs(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.dm_push_log enable row level security;

create or replace function public.dm_push_payload(p_msg bigint, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare m private.dm_msgs%rowtype; t private.dm_threads%rowtype; v_to uuid; v_subs jsonb; v_first boolean;
begin
  select * into m from private.dm_msgs where id = p_msg;
  if not found or m.status <> 'visible' then return jsonb_build_object('skip', 'no_message'); end if;
  select * into t from private.dm_threads where id = m.thread_id;
  if (case when m.from_sender then t.sender_id else t.recipient_id end) is distinct from p_actor then
    return jsonb_build_object('skip', 'not_author');
  end if;
  if m.created_at < now() - interval '2 minutes' then return jsonb_build_object('skip', 'stale'); end if;
  if t.status <> 'open' then return jsonb_build_object('skip', 'closed'); end if;
  insert into private.dm_push_log (msg_id) values (p_msg) on conflict do nothing;
  if not found then return jsonb_build_object('skip', 'already'); end if;
  v_to := case when m.from_sender then t.recipient_id else t.sender_id end;
  v_subs := private.push_target(v_to);
  if v_subs ? 'skip' then return v_subs; end if;
  v_first := not exists (select 1 from private.dm_msgs o where o.thread_id = t.id and o.id < m.id);
  -- ★ 받는 사람 쪽 알림에 보낸 사람 정보 없음 (익명 이름만). 보낸 사람 쪽에는 받는 사람 이름.
  return jsonb_build_object(
    'title', case when not m.from_sender then (select name from private.person(t.recipient_id)) || '님의 답장'
                  when v_first then '익명의 편지가 도착했어요'
                  else '익명 · ' || t.sender_alias end,
    'body',  left(m.body, 100),
    'url',   '/letters/' || t.id,
    'tag',   'dm-' || t.id,
    'subs',  v_subs -> 'subs');
end
$fn$;

do $do$
declare f text;
begin
  foreach f in array array['dm_search(text)', 'dm_send(uuid, text)', 'dm_reply(bigint, text)', 'dm_inbox()',
                           'dm_thread(bigint)', 'dm_close(bigint)', 'dm_block(bigint)', 'dm_report(bigint, text, text)',
                           'set_my_name(text)', 'my_account()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['dm_push_payload(bigint, uuid)', 'admin_remove_dm(bigint, uuid, uuid)',
                           'admin_letter_report(uuid)', 'mod_claim(int)', 'mod_verdict(bigint, boolean, text, text)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$do$;
