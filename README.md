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
8. **익명편지 본문은 공개, 신원 연결 고리는 비공개.** `letters`/`letter_comments` 는 누구나 읽지만 식별 컬럼이 없고,
   실제 계정은 `letter_participants`(자기 행만 읽힘)에만 있다. 편지 이름은 "편지 1개 × 계정 1개"마다 새로 뽑고
   (공백이 들어간 "형용사 명사" — 채팅 닉네임 공간과 겹치지 않음), 계정 고정 닉네임은 쓰지 않는다.
9. **학생끼리의 익명성은 구조로, 관리자 열람은 기록으로.** 관리자(admin)는 대화 내용·편지 작성자·이메일을 볼 수 있지만
   전부 service_role 전용 `admin_*` RPC 를 거치고 `private.audit_log` 에 남는다. 학생 쪽 RPC·RLS 경계(1~8)는 그대로다.

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
3. 브라우저에서 `/admin` → 학교 이메일 + 비밀번호로 로그인 (가입·인증 코드 경로 없음 — 운영진은 이미 있는 계정을 위 SQL 로 지정)

- **실시간 현황**(`/admin/live`): 전체 사용자와 지금 상태(대화 중 · 매칭 대기 · 접속 중 · 오프라인), 10초마다 자동 갱신.
  어느 대화인지(열기 링크)는 관리자만. 상태만 보는 것이라 새로고침마다 기록하지 않고, 학번·이름은 페이지를 열 때 한 번 기록된다.
- **공지사항**(`/admin/notices`): 올리면 학생 앱 종 아이콘에 빨간 점이 뜨고, 학생이 공지 화면을 열면 꺼진다.
  올리기·내리기는 관리자만 (운영진은 목록만). 운영 설정의 "홈 배너"는 채팅 홈 맨 위 한 줄로 따로 남아 있다.
- **moderator(운영진)**: 신고 처리, 경고, 7일 이하 정지, 사용자 검색(익명 이름·ID)·상세, 서비스 열고 닫기
- **admin(관리자)**: 위 전부 + 영구 정지·영구정지 해제, 이메일 열람·이메일 검색, **모든 대화 열람**(`/admin/rooms`),
  **모든 편지·댓글 작성자 확인**(`/admin/posts/[번호]`), 운영 수치 변경
- 역할 검사는 서버 라우트(`$lib/server/adminAuth.ts`)와 DB 함수(`private.require_staff`) 양쪽에서 한다.
  (신고 처리·글 내리기·운영 설정까지 전부 — 운영진은 설정 중 서비스 열고 닫기만)
- 확인창이 있는 조치(제재·이메일 확인·글 내리기·서비스 닫기)는 `$lib/admin/confirm.ts` 의 `confirmed()` 를 쓴다.
  `onsubmit` 에서 `preventDefault()` 로 막으면 SvelteKit `enhance` 가 그대로 요청을 보내므로 쓰지 말 것.
- 예상 못 한 서버 오류는 화면에 `서버 오류 (번호)` 로 뜬다. 같은 번호로 Cloudflare Workers 로그에서 원인을 찾는다.
- 운영자 로그인은 저장하지 않는 임시 Supabase 클라이언트로 한다 — 같은 기기의 학생 앱 로그인을 건드리지 않는다.
- 목록·상세에는 이메일이 없다. "이메일 확인"·대화 열기·편지 작성자 확인·이메일 검색은 **누가 언제 했는지 활동 기록에 남는다.**
- 운영진 명단에서 지우면 로그인 쿠키가 살아 있어도 다음 요청부터 차단된다.
- `ADMIN_SESSION_SECRET` 을 바꾸면 운영진 전원이 즉시 로그아웃된다 (비상시).
- **학번-이름 명렬표**: 관리자에게는 운영자 화면의 익명 이름 옆에 `(학번 이름)`, "이메일 확인" 옆에 실명이 보인다.
  운영진(moderator)에게는 보이지 않는다. 화면을 열 때마다 "신원 열람"으로 활동 기록에 남는다.
  `node scripts/import-roster.mjs <학번,이름 CSV>` 로 반영 — 여러 학년을 한 파일에 섞어도 되고(학년은 학번 첫 자리),
  엑셀 CSV(CP949)·CSV UTF-8 둘 다 읽는다. `--dry-run` 으로 학년별 인원만 먼저 확인할 수 있다.
  원본 xlsx/csv 는 절대 커밋하지 않는다 — `.gitignore` 에 `*roster*` 패턴으로 막아둠.

## 배포 전 체크리스트

- [x] **Auth 요청 한도 올리기** — sign-ins · token verifications · token refreshes 를 1000/5분으로 (2026-09-21 완료).
      한도는 **IP 단위**이고 학교 와이파이는 공인 IP 를 공유한다. Supabase 는 이 한도를 초당 흐름(≈3.3회/초)
      + 순간 허용량으로 적용한다 → 한 IP 에서 몇 초 안에 50명 이상이 동시에 누르면 일부가 잠깐 막힌다
      (실측: 동시 60명 중 50명 성공, 0.35초 간격 60명은 전원 성공). 막히면 "몇 초 뒤 다시"로 안내된다.
- [x] **인증 코드 8자리 + 10분 만료** — 코드 확인 한도를 올린 만큼 찍어 맞히기 방어를 보완 (2026-09-21 완료).
- [x] **계정 선점 방지** — 이메일 확인 전 계정의 비밀번호를 DB 트리거가 지운다 (실서버에서 공격 재현 → 차단 확인).
- [ ] **Phase 8 적용** — `schema.sql` 을 SQL Editor 에서 다시 실행 (익명 이름·프로필·여러 대화). 안 하면 새 화면이 프로필을 못 읽는다.
- [ ] **Phase 11 적용** — `schema.sql` 을 다시 실행 (관리자 권한 확장 RPC). 안 하면 사용자·전체 대화 화면이 오류.
- [ ] **Phase 10 적용** — `schema.sql` 을 다시 실행 (익명편지 테이블·RPC). 안 하면 익명편지 탭이 비어 보인다.
- [ ] **Phase 12 적용** — `schema.sql` 을 다시 실행 (학번-이름 명렬표 RPC). 이어서
      `node scripts/import-roster.mjs <1~3학년 합친 CSV>` 로 명단 반영.
- [ ] **Phase 13 적용** — `schema.sql` 을 다시 실행 (실시간 현황 RPC). 안 하면 `/admin/live` 가 오류.
- [ ] **Phase 14 적용** — `schema.sql` 을 다시 실행 (편지 서식 `letters.fmt`·`post_letter(text, jsonb)`). 안 하면 편지 올리기가 실패한다.
- [ ] **Phase 15 적용** — `schema.sql` 을 다시 실행 (편지 하트 `private.letter_likes`·`set_letter_like`). 안 하면 편지 목록·상세가 오류.
- [ ] **Phase 16 적용** — `schema.sql` 을 다시 실행 (공지사항 `private.notices`·`my_notices`). 안 하면 종 아이콘에 점이 뜨지 않고 `/admin/notices` 가 오류.
- [ ] **Phase 17 적용** — `schema.sql` 을 다시 실행 (메시지 공감 `public.message_reactions`·`react_message`·공감 알림 `reaction_push_payload`, Realtime 발행 포함).
- [ ] **Phase 18 적용** — `schema.sql` 을 다시 실행 (답장 `messages.reply_to`·`msg_reply_check`). 안 해도 채팅은 되고 답장만 안 된다.
      안 하면 공감을 눌러도 되돌아간다 (대화 자체는 정상).
- [ ] **운영자 점검 반영** — `schema.sql` 을 다시 실행 (신고 처리·글 내리기·운영 설정 RPC 의 역할 검사, 탈퇴 계정 제재 오류).
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

## 코드 구조

| 위치 | 내용 |
|---|---|
| `src/lib/state.svelte.ts` | 학생 앱 전역 상태 · 로그인 · 접속 신호 · 에러 문구 |
| `src/lib/ui/` | 학생 앱 공용 화면 조각 — `Sheet`(아래 시트) · `ReportPicker`(신고 사유) · `BackButton` · `TopbarMe`(공지 종 + 프로필) · `Avatar` · `PasswordFields` |
| `src/lib/notices.svelte.ts` | 공지사항 목록 · 안 본 공지(빨간 점) · 본 것으로 저장 |
| `src/lib/pollSeeker.svelte.ts` | "찾는 중" 폴링 상태 기계 — 채팅 `Seeker` 와 편지 `ReplySeeker` 가 물려받는다 |
| `src/lib/nav.ts` | 앱 안의 "뒤로" — 기록을 쌓지 않고 돌아가기(`goBack`), 대화 끝나고 홈에서 바로 찾기(`backToSeek`) |
| `src/lib/visible.ts` | `whileVisible` — 화면이 보이는 동안만 주기적으로 새로 읽기 (대화 목록·피드·편지·실시간 현황) |
| `src/lib/motion.ts` | 기기의 "동작 줄이기" 설정 — JS 스크롤을 부드럽게 할지 (CSS 애니메이션은 `app.css` 에서 한꺼번에 끈다) |
| `src/lib/time.ts` · `restriction.ts` | 상대 시간·`mm:ss` 표시 / 이용 제한 판정 (학생 앱·운영자 화면 공용) |
| `src/lib/chat/` | 채팅방 — `ChatView`(화면) · `room.svelte.ts`(상태·동기화) · `ChatIntro`(맨 위 소개) · `PartnerCard`(상대 프로필) · `ReactionPicker`·`ReactionBadge`·`reactions.ts`(공감) · `ReplyQuote`(답장 인용) · `Starters`(첫마디 도우미) · `MatchScreen`(연결 화면) · `gestures.ts`(길게 누르기·두 번 톡) |
| `src/lib/letters/` | 익명편지 |
| `src/lib/tabBack.svelte.ts` | 탭 첫 화면 뒤로가기 — 익명편지 → 홈, 홈에서 두 번 누르면 종료 |
| `src/lib/admin/` | 운영자 화면 공용 조각 — 신고 상세 카드(`ReportHeader` · `ReportedCard` · `ReporterCard` · `IdentityCard`), `AccountStatus`, `FormMsg`, `SanctionForm` |
| `src/lib/server/` | 서버 전용 — 운영자 세션·권한, `reports.ts`(채팅·편지 신고 공용 로드·액션), 푸시 (`/api/push` 는 요청 키 → DB 판단 함수 표, 받을 기기는 DB `private.push_target`) |
| `src/params/` | 라우트 주소 검사 — `[id=uuid]`, `[id=int]` (모양이 틀린 주소는 곧바로 404) |

## 명령어

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run check` | 타입 검사 |
| `npm run test:schema` | PGlite 로 스키마·트리거·RLS 검증 (Supabase 불필요) |
| `npm run test:chat` | 채팅 클라이언트 로직 — 가짜 전송 계층으로 경쟁 상황 재현 |
| `npm run test:e2e` | 실서버 Realtime E2E. 일회용 계정 3개 생성→검증→삭제. 서버 키가 앱과 **같은 프로젝트**여야 실행됨 |
| `npm run test:match` | 실서버 매칭 동시성 스트레스 (기본 20명 동시 폴링 → 중복 배정·선호 위반 검사 → 삭제) |
| `npm run test:letters` | 익명편지 피드·답장받기 상태 기계 — 가짜 서버로 새로고침·무한스크롤·백그라운드 정지 검증 |
| `npm run test:toast` | 알림 — Svelte 브라우저 모드로 컴파일해 $state proxy 관련 버그까지 검증 |
| `npm run test:platform` | 설치 안내 — 실제 UA 로 iOS/안드로이드·카카오톡 등 인앱 브라우저 판별 검증 |
| `npm run test:push` | 푸시 알림 암호화(RFC 8291)·VAPID 서명(RFC 8292) — 받는 브라우저 입장에서 복호화·검증 |
| `node scripts/vapid-keys.mjs` | 푸시 알림용 VAPID 키를 만들어 `.env` 에 추가 (이미 있으면 그대로) |
| `node scripts/import-roster.mjs <csv> [--dry-run]` | 학번-이름 명렬표를 DB 에 반영 (관리자 화면의 이메일 확인 옆 이름 표시용) |
| `npm run test:admin` | 운영자 세션 쿠키 — 위조·변조·만료·키 교체가 거부되는지 |
| `node scripts/generate-icons.mjs` | PWA 아이콘 재생성 — 원본은 `branding/icon-source.*`(png/webp/jpg 아무거나) (헤드리스 Chrome 사용) |

> `npm run test:schema` 는 PGlite 단일 커넥션이라 **동시 트랜잭션을 재현하지 못한다.**
> 매칭 advisory lock 과 연장 투표 경쟁은 `supabase start`(로컬 Docker Postgres)에서
> 따로 검증해야 한다.

## 개발용 훅

- `/dev/chat?s=chat|vote|waiting|pending|ended` — 대화방 화면 미리보기 (Supabase 불필요, 개발 모드 전용)
- `/dev/letters?v=feed|detail|task|new` — 익명편지 화면 미리보기 (가짜 서버, 개발 모드 전용)
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
- [x] **Phase 10 — 익명편지** — 하단 탭(익명편지·채팅), 공개 피드 + 댓글·대댓글(2단계), "답장할 편지 받기"로
      편지마다 지정 답장자 1명 배정(큐, for update skip locked, 48시간 마감), 편지마다 새 임시 이름,
      도배 제한(편지 3통/일·댓글·배정), 신고·차단(차단은 채팅과 공유, 재배정 쿨다운은 따로), 댓글 알림, 운영자 편지 신고 큐
- [x] **Phase 11 — 관리자 권한 확장** — 운영진/관리자 역할 분리, 사용자 검색·상세·직접 제재,
      관리자의 전체 대화 열람·편지 작성자 확인(전부 활동 기록), 학생 화면 개인정보 안내 문구 갱신
- [x] **Phase 12 — 학번-이름 명렬표** — 관리자 화면의 익명 이름 옆 `(학번 이름)`·"이메일 확인" 옆 실명
      (CSV 반입 스크립트). 관리자만, 열 때마다 활동 기록
- [x] **Phase 13 — 실시간 현황** — 전체 사용자 + 대화 중·매칭 대기·접속 중·오프라인, 10초 자동 갱신
- [x] **Phase 14 — 편지 서식** — 굵게·기울임·밑줄·취소선·형광펜(5색)·글자색(6색)·크기·정렬·되돌리기 (Tiptap).
      본문은 순수 텍스트 그대로, 서식은 `letters.fmt` 에 범위 목록으로. 화면은 HTML 을 넣지 않고 정해진 표로만 그린다
- [x] **Phase 15 — 편지 하트** — 목록·상세에서 하트 누르기/취소. 개수와 "내가 눌렀는지"만 보이고 누가 눌렀는지는
      `private.letter_likes` 에만 (작성자도 모름). 알림 없음
- [x] **Phase 16 — 공지사항** — 채팅·익명편지 상단 프로필 왼쪽에 종 아이콘, 안 본 공지가 있으면 오른쪽 위 빨간 점.
      어디까지 봤는지는 계정에 저장(`private.notice_reads`). 올리기·내리기는 관리자만(`/admin/notices`), 활동 기록에 남음
- [x] **Phase 17 — 메시지 공감** — ❤️ 😂 😮 😢 👍 🔥. 말풍선 두 번 톡 = ❤️, 길게 누르기(데스크톱 오른쪽 클릭) = 고르기 + 복사.
      자리(seat)마다 하나, 대화 중에만. `messages` 는 그대로 두고 별도 표에 자리로만 남긴다(사용자 식별자 없음).
      취소는 행 삭제가 아니라 emoji = null (Realtime DELETE 는 방 필터·RLS 가 안 걸려서). 관리자 대화 열람에도 보인다.
      상대 메시지에 처음 단 공감은 푸시 알림("❤️ 공감: …") — 메시지 하나 × 사람 하나에 한 번(`private.reaction_push_log`)
- [x] **Phase 18 — 답장 · 첫마디 · 대화 디자인** — 말풍선 길게 누르기 → "답장". 말풍선 위에 원래 메시지를 흐리게 인용,
      누르면 그 메시지로 스크롤 + 반짝. `messages.reply_to` 는 같은 방·시스템 메시지 아닌 것만(`msg_reply_check`), 관리자 열람에도 표시.
      내가 아직 말을 안 했으면 입력창 위에 첫마디 질문 3개(신상 묻는 질문 없음, 겹치는 관심사가 있으면 그 얘기부터, 누르면 채우기만).
      5분 넘게 끊기면 시간 구분선, 매칭 직후 "○○님과 연결됐어요" 화면(1.6초)
- [x] **접근성** — 기기에서 "동작 줄이기"를 켜면 나타나기·튀기·깜빡임 애니메이션과 부드러운 스크롤을 끈다
      (답장 이동 반짝임은 커지지 않고 어두워지기만). 화면 낭독기: 말풍선마다 "나:"/"상대 이름:" 을 숨은 글로,
      상대의 새 메시지는 따로 된 안내 칸(`aria-live`)에서 하나씩 읽는다 — 들어올 때 지난 대화는 읽지 않는다
- [x] **뒤로가기 (설치된 앱)** — 홈(채팅)에서 뒤로 → "뒤로가기를 한 번 더 누르면 종료됩니다", 2초 안에 또 누르면 앱 종료.
      익명편지 탭에서 뒤로 → 채팅 홈. 탭 첫 화면에 얕은 기록(`pushState` guard)을 하나 쌓아 두고 그게 걷히는 순간을 잡는다
      (`(app)/+layout.svelte`). 홈이 기록 맨 아래여야 하므로 탭 전환은 기록을 바꿔 끼우고, 다른 화면에서 홈으로는
      뒤로 간다(`lib/nav.ts` goBack). 상단 로고 = 홈 링크
- [x] **드래그 복사 제한** — 학생 앱의 버튼·안내 문구·제목은 드래그·길게 눌러도 선택되지 않는다(`app.css` 의 `body:not(.admin)`).
      사람이 쓴 글(채팅·편지·댓글·공지·홈 배너·상대 소개)과 입력칸만 `.selectable` 로 예외. 채팅 말풍선은 폰에서 길게 누르기가
      공감이라 복사는 고르기 줄의 "복사", 마우스 기기에서는 드래그로. 운영자 화면은 그대로
- [x] **대화 소개 카드** — 대화 맨 위에 상대의 큰 아바타 · 익명 이름 · MBTI·관심사 한 줄 · "프로필 보기" (인스타 DM 첫 화면)
- [ ] Phase 7 — Durable Object 전송 계층 + 학술탐구 실험
