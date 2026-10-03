
	create role anon;
	create role authenticated;
	create role service_role;

	create schema auth;
	create table auth.sessions(id uuid primary key, user_id uuid, not_after timestamptz);
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
	-- Supabase 기본 권한 그대로: public 에 새로 만든 표 · 함수 · 시퀀스는 anon · authenticated 에게 전부 열린다
	-- (schema.sql 이 필요한 만큼 직접 닫아야 한다 — 이걸 흉내 내지 않으면 권한 시험이 거짓으로 통과한다)
	alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
	alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
	alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

	-- Supabase Realtime 흉내 (Phase 55) — realtime.send 는 realtime.messages 에 한 줄 넣는다(실제도 그렇다).
	-- 비공개 채널 권한은 Realtime 이 채널 이름을 realtime.topic 설정에 넣고 학생 권한으로 이 표를 읽고 · 써 보는 것으로 확인한다
	create schema realtime;
	create table realtime.messages (
		id          bigint generated always as identity primary key,
		topic       text not null,
		extension   text not null default 'broadcast',
		event       text,
		payload     jsonb,
		private     boolean default false,
		inserted_at timestamptz not null default now()
	);
	alter table realtime.messages enable row level security;
	create function realtime.topic() returns text language sql stable as $x$
		select nullif(current_setting('realtime.topic', true), '')
	$x$;
	create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
		language sql as $x$
		insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private)
	$x$;
	grant usage on schema realtime to anon, authenticated;
	grant select, insert on realtime.messages to anon, authenticated;
	grant execute on function realtime.topic() to anon, authenticated;

	-- Supabase Storage 흉내 (Phase 84 — 뱃지 사진 버킷 · 자기 폴더 권한)
	create schema storage;
	create table storage.buckets (
		id                 text primary key,
		name               text not null,
		public             boolean not null default false,
		file_size_limit    bigint,
		allowed_mime_types text[]
	);
	create table storage.objects (
		id        uuid primary key default gen_random_uuid(),
		bucket_id text references storage.buckets(id),
		name      text not null,
		owner     uuid default auth.uid()
	);
	alter table storage.objects enable row level security;
	create function storage.foldername(name text) returns text[] language sql immutable as $x$
		select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1]
	$x$;
	grant usage on schema storage to anon, authenticated;
	grant select, insert, delete on storage.objects to authenticated;
	grant execute on function storage.foldername(text) to anon, authenticated;
