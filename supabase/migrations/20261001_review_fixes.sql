-- 2026-10-01 code-review fixes for an existing Phase 84 installation.
-- Run in the Supabase SQL editor before deploying the app that uses peer:<room>.
-- Applied to the live LOVE project on 2026-10-02 (review_fixes_20261001_part1~3).
-- Re-runnable; preserve existing messages and privilege grants.
begin;
set local check_function_bodies = off;
alter table private.dm_threads add column if not exists recipient_refused boolean not null default false;
alter table private.dm_msgs add column if not exists delivered boolean not null default true;
update private.dm_threads set recipient_refused = true
 where not recipient_refused and (closed_by = 'recipient' or (recipient_hidden and status <> 'open'));

create or replace function public.ack_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare
  r   public.rooms%rowtype;
  cfg public.app_settings%rowtype;
  v_joined int;
begin
  if public.my_seat(p_room) is null then raise exception 'not_member'; end if;
  select * into cfg from public.app_settings where id;
  perform private.room_clock(p_room);
  select * into r from public.rooms where id = p_room for update;

  if r.status = 'pending' and now() >= r.expires_at then
    perform public.close_room(p_room, 'no_show');
    return public.room_snapshot(p_room);
  end if;

  update public.room_members set joined_at = coalesce(joined_at, now()), viewing_until = now() + interval '45 seconds'
   where room_id = p_room and user_id = auth.uid();

  if r.status = 'pending' then
    select count(*) into v_joined from public.room_members
     where room_id = p_room and joined_at is not null;
    if v_joined = 2 then
      update public.rooms
         set status = 'active', armed_at = now(),
             expires_at = now() + make_interval(mins => cfg.room_minutes)
       where id = p_room;
      insert into public.pair_history (user_lo, user_hi)
      select least(a.user_id, b.user_id), greatest(a.user_id, b.user_id)
        from public.room_members a join public.room_members b
          on a.room_id = b.room_id and a.seat = 1 and b.seat = 2
       where a.room_id = p_room
      on conflict (user_lo, user_hi) do update
         set last_matched_at = now(), times = public.pair_history.times + 1;
      insert into public.messages (room_id, sender_seat, body, client_msg_id)
      values (p_room, 0,
              cfg.room_minutes || '분 동안 이야기할 수 있어요. 둘 다 대화를 보고 있을 때만 시간이 흘러요.',
              gen_random_uuid());
    end if;
  end if;
  perform private.room_clock(p_room);
  return public.room_snapshot(p_room);
end
$fn$;

create or replace function public.close_if_expired(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r public.rooms%rowtype;
begin
  if public.my_seat(p_room) is null then raise exception 'not_member'; end if;
  perform private.room_clock(p_room);
  select * into r from public.rooms where id = p_room for update;
  if r.status <> 'closed' and now() >= r.expires_at then
    perform public.close_room(p_room, case when r.status = 'pending' then 'no_show' else 'expired' end);
  end if;
  return public.room_snapshot(p_room);   -- 언제나 최신 스냅샷 + server_now
end
$fn$;

create or replace function public.sweep_rooms()
returns int language plpgsql security definer set search_path = public, private as $fn$
declare n int := 0; v record;
begin
  for v in select r.id from public.rooms r
            where r.status = 'active' and not r.pinned and r.paused_left is null
              and exists (select 1 from public.room_members m
                           where m.room_id = r.id and (m.viewing_until is null or m.viewing_until <= now()))
            limit 500
  loop
    perform private.room_clock(v.id);
  end loop;
  for v in select id from public.rooms
            where status = 'active' and not pinned and paused_since < now() - interval '1 day'
            limit 500 for update skip locked
  loop
    perform public.close_room(v.id, 'expired');
    n := n + 1;
  end loop;
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
  if not cfg.is_open or private.in_maintenance() then -- 서버 점검 중(Phase 52 · 예약 53)에도 새 대화 없음
    return jsonb_build_object('status', 'service_closed', 'notice', cfg.notice, 'server_now', v_now);
  end if;

  select * into m from public.profiles where id = me;
  if not found or not m.verified or not m.onboarded or m.status <> 'active'
     or (m.suspended_until is not null and m.suspended_until > v_now) then
    return jsonb_build_object('status', 'not_eligible', 'server_now', v_now);
  end if;

  insert into public.user_presence (user_id, online_until, seeking_until, seeking_since)
  values (me, v_now + make_interval(secs => cfg.seek_ttl_sec),
              v_now + make_interval(secs => cfg.seek_ttl_sec), v_now)
  on conflict (user_id) do update
     set online_until  = greatest(public.user_presence.online_until, excluded.online_until),
         seeking_until = excluded.seeking_until,
         seeking_since = coalesce(public.user_presence.seeking_since, excluded.seeking_since);

  if not pg_try_advisory_xact_lock(hashtext('simbun_match_pool')) then
    return jsonb_build_object('status', 'busy', 'retry_after_ms', 300, 'server_now', v_now);
  end if;

  for v_exp in
    select r.id, r.status from public.rooms r
      join public.room_members rm on rm.room_id = r.id
     where rm.user_id = me and rm.open and r.status <> 'closed' and v_now >= r.expires_at
  loop
    perform public.close_if_expired(v_exp.id);
  end loop;

  select rm.room_id into v_room
    from public.room_members rm join public.rooms r on r.id = rm.room_id
   where rm.user_id = me and rm.open and rm.joined_at is null and r.status = 'pending'
   order by r.created_at desc limit 1;
  if v_room is not null then
    update public.user_presence set seeking_until = null, seeking_since = null where user_id = me;
    return jsonb_build_object('status', 'matched', 'room_id', v_room, 'server_now', v_now);
  end if;

  -- 동시 대화 상한 — 고정한 대화는 빼고 센다
  v_open := private.open_rooms(me);
  if v_open >= cfg.max_open_rooms then
    update public.user_presence set seeking_until = null, seeking_since = null where user_id = me;
    return jsonb_build_object('status', 'full', 'max', cfg.max_open_rooms, 'server_now', v_now);
  end if;

  select c.user_id into v_partner
    from public.user_presence c
    join public.profiles p on p.id = c.user_id
   where c.user_id <> me
     and c.seeking_until > v_now
     and private.open_rooms(c.user_id) < cfg.max_open_rooms
     and not exists (select 1 from public.room_members x
                       join public.room_members y on y.room_id = x.room_id
                      where x.user_id = me and x.open and y.user_id = c.user_id)
     and p.status = 'active' and p.verified and p.onboarded
     and (p.suspended_until is null or p.suspended_until <= v_now)
     and (m.want = 'any' or m.want = p.gender)
     and (p.want = 'any' or p.want = m.gender)
     and not exists (select 1 from public.blocks b
                      where (b.blocker_id = me and b.blocked_id = c.user_id)
                         or (b.blocker_id = c.user_id and b.blocked_id = me))
     and ((coalesce(m.allow_rematch, false) and coalesce(p.allow_rematch, false))
          or not exists (select 1 from public.pair_history h
                          where h.user_lo = least(me, c.user_id)
                            and h.user_hi = greatest(me, c.user_id)
                            and h.last_matched_at > v_now - make_interval(days => cfg.rematch_cooldown_days)))
   order by exists (select 1 from public.pair_history h
                     where h.user_lo = least(me, c.user_id)
                       and h.user_hi = greatest(me, c.user_id)
                       and h.last_matched_at > v_now - make_interval(days => cfg.rematch_cooldown_days)),
            c.seeking_since asc,
            random()
   limit 1;

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

  v_bucket := public.match_bucket_take(me);
  if not (v_bucket->>'ok')::boolean then
    return jsonb_build_object('status', 'cooldown',
      'retry_after_ms', (v_bucket->>'retry_after_ms')::int, 'server_now', v_now);
  end if;

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

  return jsonb_build_object('status', 'matched', 'room_id', v_room, 'server_now', v_now);

exception
  when unique_violation then
    return jsonb_build_object('status', 'retry', 'retry_after_ms', 300, 'server_now', now());
end
$fn$;

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
  -- 서버가 사용자 턴 최대 20개(각 500자)를 줄바꿈으로 합쳐 모두 검사한다.
  if char_length(btrim(coalesce(p_text, ''))) not between 1 and 10019 then return jsonb_build_object('status', 'bad_text'); end if;
  v := private.rule_violation(p_text);
  if v is not null then return jsonb_build_object('status', 'blocked', 'code', v); end if;
  update private.ai_chats set turns = turns + 1 where id = p_chat;
  return jsonb_build_object('status', 'ok', 'turns', c.turns + 1, 'max_turns', cfg.ai_chat_max_turns);
end
$fn$;

create or replace function public.admin_export_messages(
  p_staff uuid, p_from timestamptz, p_to timestamptz, p_after bigint default 0, p_limit int default 5000)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare v_csv text; v_last bigint; v_n int;
begin
  if private.require_staff(p_staff) <> 'admin' then raise exception 'admin_only'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'bad_range'; end if;
  -- 모든 조각을 기록한다. 임의 커서로 시작한 내보내기도 열람 기록을 우회할 수 없다.
  insert into private.audit_log (staff_id, action, detail)
  values (p_staff, 'export_messages', jsonb_build_object('from', p_from, 'to', p_to, 'after', coalesce(p_after, 0)));

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

create or replace function private.dm_can_write(p_user uuid)
returns text language plpgsql security definer set search_path = public, private stable as $fn$
declare p public.profiles%rowtype;
begin
  if not coalesce((select is_open from public.app_settings where id), false) or private.in_maintenance() then
    return 'service_closed';
  end if;
  -- 익명편지 잠금 (Phase 44) — 가입한 학생이 적을 때는 누가 보냈는지 쉽게 짐작되므로 아무도 쓰지 못한다
  if private.letters_locked() then return 'letters_locked'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or not p.onboarded or p.status <> 'active' or coalesce(p.suspended_until > now(), false) then
    return 'restricted';
  end if;
  if (select name from private.person(p_user)) is null then return 'no_name'; end if;
  return null;
end
$fn$;

create or replace function private.dm_streak(p_thread bigint, p_from_sender boolean)
returns int language sql security definer set search_path = '' stable as $fn$
  select count(*)::int from private.dm_msgs m
   where m.thread_id = p_thread and m.from_sender = p_from_sender
     and m.id > coalesce((select max(o.id) from private.dm_msgs o
                           where o.thread_id = p_thread and o.from_sender <> p_from_sender and o.delivered), 0);
$fn$;

create or replace function public.dm_search(p_q text)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare me uuid := auth.uid(); q text := btrim(coalesce(p_q, ''));
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if char_length(q) < 2 or private.letters_locked() then return '[]'::jsonb; end if;   -- 잠겨 있으면 찾기도 없다 (Phase 44)
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'grade', x.grade, 'no', x.no, 'checked', x.source = 'roster',
                                        'badges', private.featured_for(x.id, 'letter'))   -- 대표 뱃지 (Phase 84 — 순서는 그 사람이 정한 대로)
                     order by x.exact desc, x.grade nulls last, x.no nulls last, x.name)
      from (select p.id, n.name, n.grade, n.source, n.name = q as exact,
                   -- 학번 = 학교 이메일 앞자리 (Phase 35 — 같은 학년 동명이인 구분)
                   (select private.email_student_no(u.email) from auth.users u where u.id = p.id) as no
              from public.profiles p
              cross join lateral private.person(p.id) n
             where p.id <> me and p.letters_open and p.onboarded
               and n.name is not null and position(q in n.name) > 0
             order by (n.name = q) desc, n.grade nulls last, n.name
             limit 10) x), '[]'::jsonb);
end
$fn$;

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
  -- 편지에서 차단해도 같은 두 사람의 이미 열린 랜덤채팅을 즉시 끝낸다.
  perform public.close_room(a.room_id, 'blocked')
    from public.room_members a join public.room_members b on b.room_id = a.room_id
   where a.user_id = me and b.user_id = other and a.open and b.open;
  perform private.dm_leave(p_thread, role);
  return jsonb_build_object('status', 'ok');
end
$fn$;

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
  -- 신고하면 차단 + 끝내고 내 목록에서 지운다 (증거는 위에서 복사해 뒀다)
  insert into public.blocks (blocker_id, blocked_id) values (me, other) on conflict do nothing;
  perform public.close_room(a.room_id, 'reported')
    from public.room_members a join public.room_members b on b.room_id = a.room_id
   where a.user_id = me and b.user_id = other and a.open and b.open;
  perform private.dm_leave(p_thread, role);

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

create or replace function public.dm_push_payload(p_msg bigint, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare m private.dm_msgs%rowtype; t private.dm_threads%rowtype; v_to uuid; v_subs jsonb;
begin
  select * into m from private.dm_msgs where id = p_msg;
  if not found or m.status <> 'visible' or not m.is_letter or not m.delivered then return jsonb_build_object('skip', 'no_message'); end if;
  select * into t from private.dm_threads where id = m.thread_id;
  if private.dm_writer(m, t) is distinct from p_actor then return jsonb_build_object('skip', 'not_author'); end if;
  if m.created_at < now() - interval '2 minutes' then return jsonb_build_object('skip', 'stale'); end if;
  if t.status <> 'open' then return jsonb_build_object('skip', 'closed'); end if;
  if private.blocked_between(t.sender_id, t.recipient_id) then return jsonb_build_object('skip', 'blocked'); end if;
  insert into private.dm_push_log (msg_id) values (p_msg) on conflict do nothing;
  if not found then return jsonb_build_object('skip', 'already'); end if;
  v_to := private.dm_reader(m, t);
  v_subs := private.push_target(v_to);
  if v_subs ? 'skip' then return v_subs; end if;
  -- ★ 받는 사람 쪽 알림에 보낸 사람 정보 없음 (성별만)
  return jsonb_build_object(
    'title', case when m.from_sender
                  then coalesce(m.from_nick, '익명의 ' || case m.from_gender when 'm' then '남학생' when 'f' then '여학생' else '학생' end)
                       || '에게서 편지가 왔어요'
                  else (select name from private.person(t.recipient_id)) || '님의 답장이 왔어요' end,
    'body',  '봉투를 열어 확인해 보세요',
    'url',   '/letters/m/' || m.id,
    'tag',   'dm-' || m.id,
    'subs',  v_subs -> 'subs');
end
$fn$;

create or replace function public.dm_send(p_to uuid, p_body text, p_fmt jsonb default null, p_nick text default null)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); v text; t private.dm_threads%rowtype; b jsonb; p public.profiles%rowtype; mid bigint;
        v_delivery boolean;
        v_body text := btrim(coalesce(p_body, ''));
        v_fmt jsonb := case when p_fmt is null or p_fmt = '{}'::jsonb or jsonb_typeof(p_fmt) = 'null' then null else p_fmt end;
        v_nick text := private.dm_nick(p_nick);
begin
  if me is null then raise exception 'unauthenticated'; end if;
  v := private.dm_can_write(me);
  if v is not null then return jsonb_build_object('status', v); end if;
  if p_to is null or p_to = me then return jsonb_build_object('status', 'not_available'); end if;
  if char_length(v_body) not between 1 and 1000 then return jsonb_build_object('status', 'bad_text'); end if;
  -- 서식 위치는 본문 기준이라, 앞뒤 공백이 잘려 나가면 어긋난다 — 클라가 미리 잘라서 보낸다
  if v_fmt is not null and (v_body <> p_body or not private.letter_fmt_ok(v_fmt, v_body)) then
    return jsonb_build_object('status', 'bad_text');
  end if;
  if private.dm_nick_bad(v_nick) then return jsonb_build_object('status', 'bad_nick'); end if;

  select * into p from public.profiles where id = p_to;
  if not found or not p.letters_open or not p.onboarded then
    return jsonb_build_object('status', 'not_available');
  end if;
  -- 차단 · 수신 거부 · 정지는 계정별 전송 응답으로 익명 상대를 찾는 단서가 되지 않는다.
  -- 발신자 편지는 똑같이 저장하고 한도를 적용하되, 수신자에게 전달하지 않는다.
  v_delivery := p.status = 'active' and not coalesce(p.suspended_until > now(), false)
    and not private.blocked_between(me, p_to)
    and not exists (select 1 from private.dm_threads where sender_id = me and recipient_id = p_to and recipient_refused);

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
  insert into private.dm_msgs (thread_id, from_sender, body, fmt, is_letter, from_nick, delivered)
  values (t.id, true, v_body, v_fmt, true, v_nick, v_delivery) returning id into mid;
  update private.dm_threads set last_at = now(), sender_read = mid where id = t.id;
  return jsonb_build_object('status', 'ok', 'thread_id', t.id, 'msg_id', mid);
end
$fn$;

create or replace function private.dm_leave(p_thread bigint, p_role text)
returns void language sql security definer set search_path = '' as $fn$
  update private.dm_threads
     set status    = case when status = 'open' then 'closed' else status end,
         closed_by = case when status = 'open' then p_role else closed_by end,
         recipient_refused = recipient_refused or p_role = 'recipient',
         sender_hidden    = sender_hidden or p_role = 'sender',
         recipient_hidden = recipient_hidden or p_role = 'recipient'
   where id = p_thread;
$fn$;

create or replace function public.dm_letter(p_thread bigint, p_body text, p_fmt jsonb default null, p_nick text default null)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); v text; role text; t private.dm_threads%rowtype; b jsonb; mid bigint;
        v_other uuid; v_delivery boolean;
        v_body text := btrim(coalesce(p_body, ''));
        v_fmt jsonb := case when p_fmt is null or p_fmt = '{}'::jsonb or jsonb_typeof(p_fmt) = 'null' then null else p_fmt end;
        v_nick text := private.dm_nick(p_nick);
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into t from private.dm_threads where id = p_thread for update;
  role := case when t.sender_id = me then 'sender' when t.recipient_id = me then 'recipient' end;
  if role is null or t.status = 'removed' then return jsonb_build_object('status', 'not_found'); end if;
  if t.status <> 'open' then return jsonb_build_object('status', 'closed'); end if;
  v := private.dm_can_write(me);
  if v is not null then return jsonb_build_object('status', v); end if;
  if char_length(v_body) not between 1 and 1000 then return jsonb_build_object('status', 'bad_text'); end if;
  if v_fmt is not null and (v_body <> p_body or not private.letter_fmt_ok(v_fmt, v_body)) then
    return jsonb_build_object('status', 'bad_text');
  end if;
  v_other := case when role = 'sender' then t.recipient_id else t.sender_id end;
  v_delivery := not private.blocked_between(t.sender_id, t.recipient_id)
    and not exists (select 1 from public.profiles p where p.id = v_other
                     and (p.status <> 'active' or coalesce(p.suspended_until > now(), false)))
    and not exists (select 1 from private.dm_threads x
                     where x.sender_id = me and x.recipient_id = v_other and x.recipient_refused);
  if role <> 'sender' then v_nick := null; end if;
  if private.dm_nick_bad(v_nick) then return jsonb_build_object('status', 'bad_nick'); end if;
  if private.dm_streak(p_thread, role = 'sender') >= 3 then return jsonb_build_object('status', 'wait_reply'); end if;
  b := private.letter_bucket_take(me, 'comment');
  if not (b->>'ok')::boolean then
    return jsonb_build_object('status', 'rate_limited', 'retry_after_ms', (b->>'retry_after_ms')::int);
  end if;
  insert into private.dm_msgs (thread_id, from_sender, body, fmt, is_letter, from_nick, delivered)
  values (p_thread, role = 'sender', v_body, v_fmt, true, v_nick, v_delivery) returning id into mid;
  if role = 'sender' then update private.dm_threads set last_at = now(), sender_read = mid where id = p_thread;
  else update private.dm_threads set last_at = now(), recipient_read = mid where id = p_thread; end if;
  return jsonb_build_object('status', 'ok', 'thread_id', p_thread, 'msg_id', mid);
end
$fn$;

create or replace function private.room_clock(p_room uuid)
returns void language plpgsql security definer set search_path = public, private as $fn$
declare r public.rooms%rowtype; v_n int; v_stop timestamptz; v_left interval;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found or r.status <> 'active' or r.pinned then return; end if;
  select count(*) filter (where viewing_until > now()), min(coalesce(viewing_until, now() - interval '90 seconds'))
    into v_n, v_stop
    from public.room_members where room_id = p_room;
  if v_n = 2 then
    if r.paused_left is not null then
      update public.rooms set expires_at = now() + r.paused_left, paused_left = null, paused_since = null where id = p_room;
    end if;
  elsif r.paused_left is null then
    -- 먼저 떠난 쪽이 마지막으로 보고 있던 때부터 멈춘다 (앱이 갑자기 꺼져도 90초 넘게는 흐르지 않게)
    v_stop := least(now(), greatest(v_stop, now() - interval '90 seconds', r.armed_at));
    v_left := r.expires_at - v_stop;
    if v_left > interval '0' then
      update public.rooms set paused_left = v_left, paused_since = now(), expires_at = 'infinity' where id = p_room;
    end if;
  end if;
end
$fn$;

create or replace function public.room_view(p_room uuid, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
begin
  if public.my_seat(p_room) is null then raise exception 'not_member'; end if;
  -- 돌아온 사람의 새 viewing_until 로 이전 이탈 시각을 덮기 전에 먼저 남은 시간을 보존한다.
  perform private.room_clock(p_room);
  update public.room_members
     set viewing_until = case when p_on then now() + interval '45 seconds' else now() end
   where room_id = p_room and user_id = auth.uid();
  perform private.room_clock(p_room);
  return public.room_snapshot(p_room);
end
$fn$;

create or replace function private.stats_on_dm()
returns trigger language plpgsql security definer set search_path = public, private as $fn$
declare t private.dm_threads%rowtype; v_from uuid; v_to uuid;
begin
  if not new.is_letter then return null; end if;
  select * into t from private.dm_threads where id = new.thread_id;
  v_from := case when new.from_sender then t.sender_id else t.recipient_id end;
  v_to   := case when new.from_sender then t.recipient_id else t.sender_id end;
  perform private.bump(v_from, 'letters_sent');
  if new.delivered then perform private.bump(v_to, 'letters_got'); end if;
  if new.fmt is not null then perform private.bump(v_from, 'deco'); end if;
  if new.delivered and exists (select 1 from private.dm_msgs o where o.thread_id = new.thread_id and o.id < new.id
               and o.is_letter and o.from_sender <> new.from_sender) then
    perform private.bump(v_to, 'replies_got');
  end if;
  return null;
end
$fn$;

create or replace function public.dm_unread()
returns int language sql security definer set search_path = public, private stable as $fn$
  select count(*)::int
    from private.dm_msgs m join private.dm_threads t on t.id = m.thread_id
   where m.is_letter and m.delivered and m.status = 'visible' and m.opened_at is null and t.status <> 'removed'
     and ((m.from_sender and t.recipient_id = auth.uid() and not t.recipient_hidden)
       or (not m.from_sender and t.sender_id = auth.uid() and not t.sender_hidden));
$fn$;

create or replace function public.dm_open(p_msg bigint)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); m private.dm_msgs%rowtype; t private.dm_threads%rowtype; v_reader boolean; v_hidden boolean;
        v_first boolean := false;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into m from private.dm_msgs where id = p_msg;
  if not found or not m.is_letter then return jsonb_build_object('status', 'not_found'); end if;
  select * into t from private.dm_threads where id = m.thread_id;
  if t.status = 'removed' then return jsonb_build_object('status', 'not_found'); end if;
  if private.dm_reader(m, t) = me then v_reader := true;
  elsif private.dm_writer(m, t) = me then v_reader := false;
  else return jsonb_build_object('status', 'not_found'); end if;
  if v_reader and not m.delivered then return jsonb_build_object('status', 'not_found'); end if;
  v_hidden := case when t.sender_id = me then t.sender_hidden else t.recipient_hidden end;
  if v_hidden then return jsonb_build_object('status', 'not_found'); end if;
  -- 내가 지운 편지 (Phase 69)
  if exists (select 1 from private.dm_hidden_msgs where owner_id = me and msg_id = p_msg) then return jsonb_build_object('status', 'not_found'); end if;
  if v_reader and m.opened_at is null then
    v_first := true;
    update private.dm_msgs set opened_at = now() where id = p_msg returning * into m;
    if t.sender_id = me then update private.dm_threads set sender_read = greatest(sender_read, p_msg) where id = t.id;
    else update private.dm_threads set recipient_read = greatest(recipient_read, p_msg) where id = t.id; end if;
  end if;
  return jsonb_build_object(
    'status', 'ok', 'id', m.id, 'thread_id', t.id,
    'role', case when v_reader then 'received' else 'sent' end,
    'body', case when m.status = 'visible' then m.body end,
    'fmt',  case when m.status = 'visible' then m.fmt end,
    'removed', m.status = 'removed',
    'created_at', m.created_at,
    -- From. / To. — 받은 편지: 모르는 사람이면 성별만, 아는 사람(내가 이름으로 보낸 사람)이면 이름
    'from_gender', m.from_gender,
    'from_name', case when not m.from_sender then (select name from private.person(t.recipient_id)) end,
    -- 서명 (Phase 35): 받은 편지의 From. · 답장의 To. · 내가 익명 쪽이면 지난번 내 서명 (답장 칸에 미리 채운다)
    'from_nick', case when m.from_sender then m.from_nick end,
    'to_nick',   case when not m.from_sender then
                   (select o.from_nick from private.dm_msgs o where o.thread_id = t.id and o.from_sender and o.id < m.id order by o.id desc limit 1) end,
    'my_nick',   case when t.sender_id = me then
                   (select o.from_nick from private.dm_msgs o where o.thread_id = t.id and o.from_sender order by o.id desc limit 1) end,
    'to_name',   case when m.from_sender then (select name from private.person(t.recipient_id)) end,
    'to_grade',  case when m.from_sender and not v_reader then (select grade from private.person(t.recipient_id)) end,
    'to_gender', case when not m.from_sender then
                   (select o.from_gender from private.dm_msgs o where o.thread_id = t.id and o.from_sender order by o.id desc limit 1) end,
    'is_reply', exists (select 1 from private.dm_msgs o where o.thread_id = t.id and o.id < m.id and o.is_letter and o.from_sender <> m.from_sender
                        and (o.delivered or private.dm_writer(o, t) = me)),
    'opened', m.opened_at is not null,
    'first_open', v_first,           -- 방금 처음 열었다 (봉투 여는 연출은 이때만)
    'replied', exists (select 1 from private.dm_msgs o where o.thread_id = t.id and o.id > m.id and o.is_letter and o.from_sender <> m.from_sender
                       and (o.delivered or private.dm_writer(o, t) = me)),
    'thread_status', t.status, 'closed_by', t.closed_by,
    -- 답장은 받은 편지에서만, 열린 편지 줄기에서, 답 없이 3통이면 상대 차례
    'can_reply', v_reader and t.status = 'open',
    'wait_reply', t.status = 'open' and private.dm_streak(t.id, t.sender_id = me) >= 3,
    'server_now', now());
end
$fn$;

create or replace function public.dm_reply_to(p_msg bigint, p_body text, p_fmt jsonb default null, p_nick text default null)
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid(); m private.dm_msgs%rowtype; t private.dm_threads%rowtype;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into m from private.dm_msgs where id = p_msg;
  if not found or not m.is_letter or not m.delivered then return jsonb_build_object('status', 'not_found'); end if;
  select * into t from private.dm_threads where id = m.thread_id;
  if private.dm_reader(m, t) is distinct from me then return jsonb_build_object('status', 'not_found'); end if;
  return public.dm_letter(m.thread_id, p_body, p_fmt, p_nick);
end
$fn$;

create or replace function private.dm_box_of(m private.dm_msgs, t private.dm_threads, p_me uuid)
returns text language sql stable set search_path = '' as $fn$
  select case when not m.delivered and private.dm_reader(m, t) = p_me then null
              when exists (select 1 from private.dm_hidden_msgs h where h.owner_id = p_me and h.msg_id = m.id) then null
              when (m.from_sender and t.recipient_id = p_me and not t.recipient_hidden)
                or (not m.from_sender and t.sender_id = p_me and not t.sender_hidden) then 'received'
              when (m.from_sender and t.sender_id = p_me and not t.sender_hidden)
                or (not m.from_sender and t.recipient_id = p_me and not t.recipient_hidden) then 'sent' end;
$fn$;

create or replace function public.dm_mailbox(p_box text, p_before bigint default null, p_folder bigint default null)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare
  me uuid := auth.uid();
  fname text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if p_folder is null and p_box not in ('received', 'sent') then return jsonb_build_object('letters', '[]'::jsonb); end if;
  if p_folder is not null then
    select name into fname from private.dm_folders where id = p_folder and owner_id = me;
    if fname is null then return jsonb_build_object('letters', '[]'::jsonb, 'folder', null, 'server_now', now()); end if;
  end if;
  return jsonb_build_object('letters', coalesce((
    select jsonb_agg(x order by x.id desc) from (
      select m.id, m.thread_id, m.created_at, m.status = 'removed' as removed, t.status as thread_status, b.bx as box,
             -- 받은 편지: 모르는 사람이면 성별만, 내가 이름으로 보낸 사람의 답장이면 그 이름
             case when b.bx = 'received' then m.from_gender end as from_gender,
             case when b.bx = 'received' and not m.from_sender then (select name from private.person(t.recipient_id)) end as from_name,
             -- 서명 (Phase 35) — 익명 쪽이 적은 것. 받은 편지의 From. / 보낸 답장의 To. / 내가 익명 쪽이면 내 서명
             case when b.bx = 'received' and m.from_sender then m.from_nick end as from_nick,
             case when b.bx = 'sent' and not m.from_sender then
               (select o.from_nick from private.dm_msgs o where o.thread_id = m.thread_id and o.from_sender and o.id < m.id order by o.id desc limit 1) end as to_nick,
             case when t.sender_id = me then
               (select o.from_nick from private.dm_msgs o where o.thread_id = m.thread_id and o.from_sender and o.id <= m.id order by o.id desc limit 1) end as my_nick,
             m.opened_at is not null as opened,
             exists (select 1 from private.dm_msgs o where o.thread_id = m.thread_id and o.id < m.id
                      and o.is_letter and o.from_sender <> m.from_sender and (o.delivered or private.dm_writer(o, t) = me)) as is_reply,
             -- 보낸 편지: 이름으로 보낸 편지면 받는 사람 이름 · 학년, 답장이면 "익명의 ○학생"
             case when b.bx = 'sent' and m.from_sender then (select name from private.person(t.recipient_id)) end as to_name,
             case when b.bx = 'sent' and m.from_sender then (select grade from private.person(t.recipient_id)) end as to_grade,
             case when b.bx = 'sent' and not m.from_sender then
               (select o.from_gender from private.dm_msgs o where o.thread_id = m.thread_id and o.from_sender order by o.id desc limit 1) end as to_gender,
             case when b.bx = 'sent' then exists (select 1 from private.dm_msgs o where o.thread_id = m.thread_id and o.id > m.id
                      and o.is_letter and o.from_sender <> m.from_sender and (o.delivered or private.dm_writer(o, t) = me)) end as replied
        from private.dm_msgs m
        join private.dm_threads t on t.id = m.thread_id
        cross join lateral (select private.dm_box_of(m, t, me) as bx) b
        left join private.dm_folder_items fi on fi.owner_id = me and fi.msg_id = m.id
       where m.is_letter and t.status <> 'removed' and (t.sender_id = me or t.recipient_id = me) and b.bx is not null
         and (p_before is null or m.id < p_before)
         and case when p_folder is null then b.bx = p_box and fi.msg_id is null else fi.folder_id = p_folder end
       order by m.id desc limit 30) x), '[]'::jsonb),
    'folders', case when p_before is null and p_folder is null then private.dm_folder_list(me) end,
    'folder', case when p_folder is not null then jsonb_build_object('id', p_folder, 'name', fname) || private.dm_folder_counts(p_folder, me) end,
    'server_now', now());
end
$fn$;

create or replace function public.rt_allowed(p_topic text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = public as $fn$
declare me uuid := auth.uid();
begin
  if me is null or p_topic is null then return false; end if;
  if p_topic ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return not p_write and exists (select 1 from public.room_members where room_id = substr(p_topic, 6)::uuid and user_id = me);
  end if;
  if p_topic ~ '^peer:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return exists (select 1 from public.room_members where room_id = substr(p_topic, 6)::uuid and user_id = me);
  end if;
  if p_write then return false; end if;
  return p_topic = 'inbox:' || me::text or p_topic = 'signups';
end
$fn$;

create or replace function public.admin_badges(p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public, private stable as $fn$
declare v_role text;
begin
  v_role := private.require_perm(p_staff, 'any');
  if not (private.staff_can(v_role, 'moderate') or private.staff_can(v_role, 'identity')) then
    raise exception 'no_permission';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('code', d.code, 'title', d.title, 'description', d.description, 'icon', d.icon,
                                        'category', d.category,
                                        'holders', (select count(*) from private.user_achievements a where a.code = d.code))
                     order by d.sort)
      from private.achievement_defs d
     where d.granted), '[]'::jsonb);
end
$fn$;

create or replace function public.dm_recommend()
returns jsonb language plpgsql security definer set search_path = public, private as $fn$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if private.letters_locked() then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'grade', x.grade, 'no', x.no, 'checked', x.source = 'roster',
                                        'badges', private.featured_for(x.id, 'letter')))
      from (select p.id, n.name, n.grade, n.source,
                   (select private.email_student_no(u.email) from auth.users u where u.id = p.id) as no
              from public.profiles p
              cross join lateral private.person(p.id) n
             where p.id <> me and p.letters_open and p.letters_recommend and p.onboarded
               and n.name is not null
               -- 한 번 내가 보낸 대상은 종료/차단과 무관하게 계속 제외해 결과 변화로 신원을 찾지 못하게 한다.
               and not exists (select 1 from private.dm_threads t
                                where t.sender_id = me and t.recipient_id = p.id)
             order by random()
             limit 5) x), '[]'::jsonb);
end
$fn$;

commit;
