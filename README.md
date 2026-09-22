# CNSATINDER

충남삼성고 교내 익명 대화 앱. 모르는 사람과 10분, 둘 다 원할 때만 연장.

- 전체 설계: `~/.claude/plans/dynamic-purring-acorn.md`
- 스택: SvelteKit 2 + Svelte 5 (runes) + Supabase + Cloudflare Pages

## 설계 원칙 (코드를 고칠 때 반드시 지킬 것)

1. **`messages` 에 식별 컬럼을 두지 않는다.** `sender_seat`(0=시스템, 1, 2)만 쓴다.
   컬럼이 없으면 유출될 수가 없다.
2. **`room_members` 는 '내 행만' 읽힌다.** 상대 `user_id` 가 클라이언트에 닿으면
   방을 건너뛰며 수집한 UUID 로 과거 대화 전부가 소급 추적된다.
3. **`private` 스키마는 PostgREST 에 노출하지 않는다.** Dashboard > Settings > API >
   Exposed schemas 에 `private` 를 넣지 말 것.
4. **실명·학번을 수집하지 않는다.** 이메일은 `auth.users` 에만 존재한다.
5. **`select('*')` 를 쓰지 않는다.** 항상 명시 컬럼.
6. **Realtime presence 에 `seat` 외의 값을 track 하지 않는다.**
7. **상대 정보는 room_id 로만 묻는다.** 상대 프로필(`partner_profile`)·대화 목록(`my_rooms`)은
   같은 방 멤버에게만, uuid 없이 돌려준다. 익명 이름은 계정에 고정이므로(재회 시 알아볼 수 있음)
   소개·관심사에 학번·전화번호·@아이디는 서버가 거절한다.

## 처음 설정하기

### 1. Supabase 프로젝트

새 프로젝트를 만들고 `supabase/schema.sql` 을 SQL Editor 에 통째로 붙여넣어 실행한다.
여러 번 실행해도 안전하다.

학교 도메인이 `cnsa.hs.kr` 이 아니라면 실행 후 한 줄 더:

```sql
update private.auth_config set allowed_domains = array['우리학교.hs.kr'];
```

`src/lib/state.svelte.ts` 의 `SCHOOL_DOMAIN` 도 같이 바꾼다(입력창 표시용).

### 2. Dashboard 설정 — 이게 빠지면 도메인 제한이 무의미해진다

Authentication > Sign In / Providers

- **Email 만 켜고 나머지 provider 는 전부 끈다**
- **Anonymous sign-ins 끈다**
- **Confirm email 켠다**
- Email OTP 를 사용한다 (매직링크가 아니라 6자리 코드).
  링크 방식은 브라우저에서 열리고, 그 브라우저는 PWA 설치 게이트에 막힌다.

Authentication > URL Configuration

- Redirect URLs 를 실제 배포 도메인만 남긴다

Settings > API

- **Exposed schemas 에 `private` 가 없는지 확인한다** (기본값: `public`, `graphql_public`)

### 3. 환경변수

```bash
cp .env.example .env
```

`PUBLIC_SUPABASE_URL` 과 `PUBLIC_SUPABASE_PUBLISHABLE_KEY` 를 채운다.
(`SUPABASE_SERVICE_ROLE_KEY` 는 Phase 6 운영자 대시보드에서 쓴다. 클라이언트 번들에
들어갈 경로가 없어야 한다.)

### 4. 실행

```bash
npm install
npm run dev
```

## 운영자 대시보드 (/admin)

1. `.env` 에 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`(앱과 **같은 프로젝트**)와 `ADMIN_SESSION_SECRET`(32자 이상) 설정
2. 운영진 지정 (SQL Editor):
   ```sql
   insert into private.staff (user_id, role)
   select id, 'admin' from auth.users where email = '담당자@cnsa.hs.kr';   -- 'moderator' 도 가능
   ```
3. 브라우저에서 `/admin` → 학교 계정으로 로그인

- **admin**: 모든 기능 + 운영 수치 변경 / **moderator**: 신고 처리·조치·서비스 열고 닫기
- 신고 목록·상세에는 이메일이 없다. "이메일 확인"을 눌러야만 보이고, **누가 언제 봤는지 활동 기록에 남는다.**
- 운영진 명단에서 지우면 로그인 쿠키가 살아 있어도 다음 요청부터 차단된다.
- `ADMIN_SESSION_SECRET` 을 바꾸면 운영진 전원이 즉시 로그아웃된다 (비상시).

## 배포 전 체크리스트

- [x] **Auth 요청 한도 올리기** — sign-ins · token verifications · token refreshes 를 1000/5분으로 (2026-09-21 완료).
      한도는 **IP 단위**이고 학교 와이파이는 공인 IP 를 공유한다. Supabase 는 이 한도를 초당 흐름(≈3.3회/초)
      + 순간 허용량으로 적용한다 → 한 IP 에서 몇 초 안에 50명 이상이 동시에 누르면 일부가 잠깐 막힌다
      (실측: 동시 60명 중 50명 성공, 0.35초 간격 60명은 전원 성공). 막히면 "몇 초 뒤 다시"로 안내된다.
- [x] **인증 코드 8자리 + 10분 만료** — 코드 확인 한도를 올린 만큼 찍어 맞히기 방어를 보완 (2026-09-21 완료).
- [x] **계정 선점 방지** — 이메일 확인 전 계정의 비밀번호를 DB 트리거가 지운다 (실서버에서 공격 재현 → 차단 확인).
- [ ] **Phase 8 적용** — `schema.sql` 을 SQL Editor 에서 다시 실행 (익명 이름·프로필·여러 대화). 안 하면 새 화면이 프로필을 못 읽는다.
- [ ] **비밀번호 규칙** — Authentication > Providers > Email: Minimum password length **8**,
      Password requirements **Letters and digits**. (앱도 같은 규칙을 검사하지만 서버 설정이 권위)
- [ ] **푸시 알림 키** — `.env` 의 `PUBLIC_VAPID_KEY`·`VAPID_PRIVATE_KEY`(Secret)·`VAPID_SUBJECT` 를 Cloudflare Variables and Secrets 에도.
      없으면 알림만 조용히 꺼진다(대화는 정상). 키를 바꾸면 모든 기기의 알림 구독이 무효가 된다.
- [ ] **외부 SMTP 연결** — 기본 메일 서버는 시간당 몇 통뿐. SMTP 를 연결해야 발송 한도를 올릴 수 있다.
- [ ] **메일 템플릿** — Magic Link · Confirm signup 둘 다 `{{ .Token }}` 만 (링크 없이).
- [ ] **pg_cron** — `select jobname from cron.job;` 에 simbun-sweep / simbun-purge / simbun-purge-evidence 3개.
- [ ] 운영진 지정 (`private.staff`), 배포용 `ADMIN_SESSION_SECRET` 새로 생성.
- [ ] 개발용 테스트 계정 삭제.
- [ ] 학생회·담당 선생님 승인, 개인정보 처리방침 게시.

## 개발용 테스트 계정

**대시보드의 Add user 로 비밀번호 계정을 만들지 말 것.** 계정 선점 방지 트리거 때문에 비밀번호가 지워진다
(Supabase 가 Auto Confirm 을 '미확인 생성 → 확인' 순서로 처리하기 때문). 대신:

```bash
node scripts/dev-user.mjs simbun-test3@cnsa.hs.kr 비밀번호 m      # 성별까지 주면 온보딩 완료 상태로
```

테스트 스크립트가 중간에 죽어 남긴 계정 확인·정리: `node scripts/cleanup-test-users.mjs [--delete]`

## 명령어

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run check` | 타입 검사 |
| `npm run test:schema` | PGlite 로 스키마·트리거·RLS 검증 (Supabase 불필요) |
| `npm run test:chat` | 채팅 클라이언트 로직 — 가짜 전송 계층으로 경쟁 상황 재현 |
| `npm run test:e2e` | 실서버 Realtime E2E. 일회용 계정 3개 생성→검증→삭제. 서버 키가 앱과 **같은 프로젝트**여야 실행됨 |
| `npm run test:match` | 실서버 매칭 동시성 스트레스 (기본 20명 동시 폴링 → 중복 배정·선호 위반 검사 → 삭제) |
| `npm run test:toast` | 알림 — Svelte 브라우저 모드로 컴파일해 $state proxy 관련 버그까지 검증 |
| `npm run test:platform` | 설치 안내 — 실제 UA 로 iOS/안드로이드·카카오톡 등 인앱 브라우저 판별 검증 |
| `npm run test:push` | 푸시 알림 암호화(RFC 8291)·VAPID 서명(RFC 8292) — 받는 브라우저 입장에서 복호화·검증 |
| `node scripts/vapid-keys.mjs` | 푸시 알림용 VAPID 키를 만들어 `.env` 에 추가 (이미 있으면 그대로) |
| `npm run test:admin` | 운영자 세션 쿠키 — 위조·변조·만료·키 교체가 거부되는지 |
| `node scripts/generate-icons.mjs` | PWA 아이콘 재생성 — 원본은 `branding/icon-source.webp` (헤드리스 Chrome 사용) |

> `npm run test:schema` 는 PGlite 단일 커넥션이라 **동시 트랜잭션을 재현하지 못한다.**
> 매칭 advisory lock 과 연장 투표 경쟁은 `supabase start`(로컬 Docker Postgres)에서
> 따로 검증해야 한다.

## 개발용 훅

- `/dev/chat?s=chat|vote|waiting|pending|ended` — 대화방 화면 미리보기 (Supabase 불필요, 개발 모드 전용)
- `?gate` — 개발 모드에서 PWA 설치 게이트 화면을 강제로 띄운다
  (평소 DEV 에서는 게이트가 꺼져 있다)

## 진행 상황

- [x] **Phase 1 — 인증 + 신원 분리**
      `private` 스키마, `profiles`, `app_settings`, 도메인 강제 트리거(INSERT + UPDATE OF email),
      디자인 토큰, PWA 설치 게이트, OTP 로그인, 온보딩
- [x] **Phase 2 — 채팅 코어** — 스키마·RLS·Realtime 클라이언트·대화방 화면. 테스트 방은 SQL Editor 에서
      `select private.dev_open_room('a@cnsa.hs.kr','b@cnsa.hs.kr', 60);`
- [x] **Phase 3 — 타임박스** — pending→active 입장 확인, 연장 투표(무제한), 만료 판정(서버 기준), 나가기,
      1분 스위퍼 + 24시간 purge(pg_cron). 짧은 타이머로 테스트하려면 `dev_open_room(a, b, 2)`
- [x] **Phase 4 — 랜덤 매칭** — request_match 폴링(대기자는 웹소켓 없음), 선호 성별·차단·7일 쿨다운·공정성,
      백그라운드 시 자동 이탈, 상대 이탈 45초 감지 후 넘기기
- [x] **Phase 5 — 안전장치** — 신고(대화 사본 보존 + 자동 차단), 차단, 30일 내 서로 다른 신고자 3명 → 자동 정지,
      메시지 도배 제한(토큰 버킷), 넘기기 연타 제한, 신고 증거 180일 보존
- [x] **Phase 6 — 운영자 대시보드** (`/admin`) — 신고 큐·상세·조치, 신원 열람(기록 필수), 운영 설정·킬 스위치, 활동 기록
- [x] **Phase 8 — 계정·프로필·여러 대화** — 첫 가입은 인증 코드, 이후 학교 이메일 + 비밀번호 로그인,
      계정마다 고유 익명 이름(바꿀 수 없음), 소개·관심사·MBTI 프로필, 온라인 표시(heartbeat),
      대화 동시 최대 5개(운영 설정) + 대화 목록 화면, 대화방에서 상대 프로필 보기
- [x] **Phase 9 — 푸시 알림** — 처음 한 번 권한 안내, 상대가 앱을 안 보고 있을 때만 발송(서버 판단),
      본문 종단 암호화, 같은 메시지 한 번만, 로그아웃 시 기기 구독 삭제, 알림 누르면 그 대화로
- [ ] Phase 7 — Durable Object 전송 계층 + 학술탐구 실험
