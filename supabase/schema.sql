-- ════════════════════════════════════════════════════════════════════
--  십분 (simbun) — 교내 익명 대화 앱 스키마
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
-- ★ DB 레벨 최종 안전망: 한 사람은 동시에 한 방에만.
create unique index if not exists rm_one_open_room on public.room_members (user_id) where open;

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
  select room_id into v_room from public.room_members where user_id = auth.uid() and open;
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

  a1 := public.random_alias();
  loop a2 := public.random_alias(); exit when a2 <> a1; end loop;

  insert into public.rooms (status, armed_at, expires_at, alias1, alias2)
  values ('active', now(), now() + make_interval(mins => p_minutes), a1, a2)
  returning id into v_room;

  insert into public.room_members (room_id, user_id, seat, joined_at)
  values (v_room, u1, 1, now()), (v_room, u2, 2, now());

  insert into public.messages (room_id, sender_seat, body, client_msg_id)
  values (v_room, 0, '대화가 시작되었어요. 이름·학번·SNS는 묻지도 말하지도 않기로 해요.',
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
  v_my boolean; v_their boolean; v_joined boolean;
begin
  s := public.my_seat(p_room);
  if s is null then raise exception 'not_member'; end if;
  select * into r   from public.rooms where id = p_room;
  select * into cfg from public.app_settings where id;

  select agree into v_my    from public.extension_votes where room_id = p_room and round = r.round and seat = s;
  select agree into v_their from public.extension_votes where room_id = p_room and round = r.round and seat <> s;
  select joined_at is not null into v_joined
    from public.room_members where room_id = p_room and seat <> s;

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
    values (p_room, 0, cfg.extend_minutes || '분 연장됐어요.', gen_random_uuid());
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
-- 이걸 안 하면 rm_one_open_room 때문에 그 사람은 영원히 새 매칭을 못 받는다(좀비 방).
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
     set online_until  = excluded.online_until,
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

  -- ③ 누가 이미 나를 잡아갔으면 그 방으로
  select room_id into v_room from public.room_members where user_id = me and open;
  if v_room is not null then
    update public.user_presence set seeking_until = null, seeking_since = null where user_id = me;
    return jsonb_build_object('status', 'matched', 'room_id', v_room, 'server_now', v_now);
  end if;

  -- ④ 후보 1명
  select c.user_id into v_partner
    from public.user_presence c
    join public.profiles p on p.id = c.user_id
   where c.user_id <> me
     and c.seeking_until > v_now                         -- ★ 지금 실제로 앱을 보며 찾는 사람만
     and c.current_room_id is null
     and not exists (select 1 from public.room_members rm where rm.user_id = c.user_id and rm.open)
     and p.status = 'active' and p.verified and p.onboarded
     and (p.suspended_until is null or p.suspended_until <= v_now)
     -- 선호 성별: 양방향 모두 만족
     and (m.want = 'any' or m.want = p.gender)
     and (p.want = 'any' or p.want = m.gender)
     -- 차단: 어느 쪽이 했든
     and not exists (select 1 from public.blocks b
                      where (b.blocker_id = me and b.blocked_id = c.user_id)
                         or (b.blocker_id = c.user_id and b.blocked_id = me))
     -- 최근에 대화한 상대 제외
     and not exists (select 1 from public.pair_history h
                      where h.user_lo = least(me, c.user_id)
                        and h.user_hi = greatest(me, c.user_id)
                        and h.last_matched_at > v_now - make_interval(days => cfg.rematch_cooldown_days))
   order by c.seeking_since asc,   -- ★ 오래 기다린 사람 먼저 (굶주림 방지)
            random()
   limit 1;

  -- ⑤ 아무도 없으면 에러가 아니라 대기 상태
  if v_partner is null then
    select count(*) into v_pool
      from public.user_presence
     where user_id <> me and seeking_until > v_now and current_room_id is null;
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
  a1 := public.random_alias();
  loop a2 := public.random_alias(); exit when a2 <> a1; end loop;

  insert into public.rooms (status, expires_at, alias1, alias2)
  values ('pending', v_now + make_interval(secs => cfg.join_grace_sec), a1, a2)
  returning id into v_room;

  insert into public.room_members (room_id, user_id, seat)
  values (v_room, me, 1), (v_room, v_partner, 2);

  update public.user_presence
     set current_room_id = v_room, seeking_until = null, seeking_since = null
   where user_id in (me, v_partner);

  -- ★ 반환값에 상대의 uuid 는 없다. room_id 뿐.
  return jsonb_build_object('status', 'matched', 'room_id', v_room, 'server_now', v_now);

exception
  when unique_violation then   -- rm_one_open_room 안전망이 발동 — 락 로직이 틀렸어도 여기서 막힌다
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
           r.reported_id, r.reporter_id,
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
create or replace function public.admin_update_settings(p_patch jsonb, p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
begin
  update public.app_settings set
    is_open               = coalesce((p_patch->>'is_open')::boolean, is_open),
    notice                = coalesce(p_patch->>'notice', notice),
    room_minutes          = coalesce((p_patch->>'room_minutes')::int, room_minutes),
    extend_minutes        = coalesce((p_patch->>'extend_minutes')::int, extend_minutes),
    vote_window_sec       = coalesce((p_patch->>'vote_window_sec')::int, vote_window_sec),
    max_rounds            = coalesce((p_patch->>'max_rounds')::smallint, max_rounds),
    rematch_cooldown_days = coalesce((p_patch->>'rematch_cooldown_days')::int, rematch_cooldown_days),
    auto_suspend_reports  = coalesce((p_patch->>'auto_suspend_reports')::int, auto_suspend_reports)
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
-- Phase 4: heartbeat / request_match / pair_history
-- Phase 5: blocks / private.reports / private.report_evidence / 레이트리밋 트리거
