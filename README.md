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
8. **이름 편지는 받는 사람만 이름이 보이고, 보낸 사람은 익명.** (Phase 23) 이름은 명렬표에서 자동으로 붙어 학생이 고칠 수 없고
   (명렬표에 없는 학생만 한 번 적는다 — 명렬표 이름은 쓸 수 없음), 검색에는 이름·학년만 나온다 (설정 > 편지 받기 끄면 안 나옴).
   편지 표 `private.dm_threads`/`dm_msgs` 는 RPC 로만 읽히고, 받는 사람에게 보낸 사람은 편지마다 새로 뽑은 익명 이름뿐이다.
   옛 공개 편지(`letters`/`letter_comments`)는 DB 에 남아 있지만 화면에서는 내렸다.
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
- [x] **Phase 8 ~ 20 · 운영자 점검 DB 반영** — 2026-09-25 Supabase 커넥터로 실DB(LOVE)에 16~20 패치를 적용하고
      최신 `schema.sql` 의 함수·열·트리거가 모두 있는지 대조했다 (8~15 · 운영자 점검은 이미 들어가 있었음, 명렬표 1,093명).
      AI 검토 · AI 대화는 여전히 꺼진 상태 — 켜기 전 아래 Phase 19 안내대로.
- [x] **Phase 8 적용** — `schema.sql` 을 SQL Editor 에서 다시 실행 (익명 이름·프로필·여러 대화). 안 하면 새 화면이 프로필을 못 읽는다.
- [x] **Phase 11 적용** — `schema.sql` 을 다시 실행 (관리자 권한 확장 RPC). 안 하면 사용자·전체 대화 화면이 오류.
- [x] **Phase 10 적용** — `schema.sql` 을 다시 실행 (익명편지 테이블·RPC). 안 하면 익명편지 탭이 비어 보인다.
- [x] **Phase 12 적용** — `schema.sql` 을 다시 실행 (학번-이름 명렬표 RPC). 이어서
      `node scripts/import-roster.mjs <1~3학년 합친 CSV>` 로 명단 반영.
- [x] **Phase 13 적용** — `schema.sql` 을 다시 실행 (실시간 현황 RPC). 안 하면 `/admin/live` 가 오류.
- [x] **Phase 14 적용** — `schema.sql` 을 다시 실행 (편지 서식 `letters.fmt`·`post_letter(text, jsonb)`). 안 하면 편지 올리기가 실패한다.
- [x] **Phase 15 적용** — `schema.sql` 을 다시 실행 (편지 하트 `private.letter_likes`·`set_letter_like`). 안 하면 편지 목록·상세가 오류.
- [x] **Phase 16 적용** — `schema.sql` 을 다시 실행 (공지사항 `private.notices`·`my_notices`). 안 하면 종 아이콘에 점이 뜨지 않고 `/admin/notices` 가 오류.
- [x] **Phase 17 적용** — `schema.sql` 을 다시 실행 (메시지 공감 `public.message_reactions`·`react_message`·공감 알림 `reaction_push_payload`, Realtime 발행 포함).
- [x] **Phase 18 적용** — `schema.sql` 을 다시 실행 (답장 `messages.reply_to`·`msg_reply_check`). 안 해도 채팅은 되고 답장만 안 된다.
- [x] **Phase 19 적용** — `schema.sql` 을 다시 실행 (검열봇 규칙 필터 · AI 검토 대기열 · AI 대화 한도). 실행하는 즉시 신상정보·금칙어 차단이
      채팅·편지·댓글에 적용된다. AI 두 기능은 꺼진 채로 시작 — **개인정보 처리방침에 "Cloudflare Workers AI 로 글을 검토"를 적은 뒤**
      운영 설정에서 켠다. 배포에 `wrangler.jsonc` 의 `"ai"` 바인딩이 들어가 있어야 한다 (API 키 불필요).
      안 하면 공감을 눌러도 되돌아간다 (대화 자체는 정상).
- [x] **Phase 24 적용** — 2026-09-26 Supabase 커넥터로 실DB 에 적용 (이름 편지 서식 `dm_msgs.fmt` · `dm_send(uuid, text, jsonb)`).
      안 하면 편지 보내기가 실패한다.
- [x] **Phase 23 적용** — 2026-09-26 Supabase 커넥터로 실DB 에 적용 (이름 편지 · 이름 확인). 새 DB 는 `schema.sql` 을 다시 실행.
      안 하면 익명편지 탭의 검색·목록이 오류.
- [x] **Phase 22 적용** — 2026-09-25 Supabase 커넥터로 실DB 에 적용 (보안 점검). 남은 일: 대시보드에서 유출 비밀번호 차단 켜기 (`SECURITY.md`).
- [x] **Phase 21 적용** — 2026-09-25 Supabase 커넥터로 실DB 에 적용 (`profiles.allow_rematch` · `request_match`). 새 DB 는 `schema.sql` 을 다시 실행.
- [x] **Phase 20 적용** — `schema.sql` 을 다시 실행 (대화 백업 `admin_export_messages`). 백업을 쓸 거면 개인정보 처리방침에
      "지워지기 전 관리자가 파일로 보관할 수 있음"을 적고 학교 승인을 받는다 (학생 화면 문구는 이미 바꿔 둠).
- [x] **운영자 점검 반영** — `schema.sql` 을 다시 실행 (신고 처리·글 내리기·운영 설정 RPC 의 역할 검사, 탈퇴 계정 제재 오류).
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
| `src/lib/ui/` | 학생 앱 공용 화면 조각 — `Sheet`(아래 시트) · `ReportPicker`(신고 사유) · `BackButton` · `TopbarMe`(공지 종 + 설정 톱니) · `Avatar` · `PasswordFields` |
| `src/lib/notices.svelte.ts` | 공지사항 목록 · 안 본 공지(빨간 점) · 본 것으로 저장 |
| `src/lib/pollSeeker.svelte.ts` | "찾는 중" 폴링 상태 기계 — 채팅 `Seeker` 가 물려받는다 |
| `src/lib/nav.ts` | 앱 안의 "뒤로" — 기록을 쌓지 않고 돌아가기(`goBack`), 대화 끝나고 홈에서 바로 찾기(`backToSeek`) |
| `src/lib/visible.ts` | `whileVisible` — 화면이 보이는 동안만 주기적으로 새로 읽기 (대화 목록·피드·편지·실시간 현황) |
| `src/lib/motion.ts` | 기기의 "동작 줄이기" 설정 — JS 스크롤을 부드럽게 할지 (CSS 애니메이션은 `app.css` 에서 한꺼번에 끈다) |
| `src/lib/time.ts` · `restriction.ts` | 상대 시간·`mm:ss` 표시 / 이용 제한 판정 (학생 앱·운영자 화면 공용) |
| `src/lib/chat/` | 채팅방 — `ChatView`(화면) · `room.svelte.ts`(상태·동기화) · `ChatIntro`(맨 위 소개) · `PartnerCard`(상대 프로필) · `ReactionPicker`·`ReactionBadge`·`reactions.ts`(공감) · `ReplyQuote`(답장 인용) · `Starters`(첫마디 도우미) · `MatchScreen`(연결 화면) · `gestures.ts`(길게 누르기·두 번 톡·밀어서 답장) |
| `src/lib/letters/` | 이름 편지 — `api.ts`(검색·받은/보낸 편지·보내기·끝내기·차단·신고 RPC), `unread.svelte.ts`(탭 빨간 점), `LetterEditor.svelte`(서식 편집기) · `rich.ts` · `RichText.svelte`(서식 그리기) |
| `src/lib/tabBack.svelte.ts` | 탭 첫 화면 뒤로가기 — 익명편지·프로필 → 홈, 홈에서 두 번 누르면 종료 |
| `src/lib/chatColor.svelte.ts` | 채팅 색상(내 말풍선) — 설정 화면에서 고르고 이 기기에만 저장 |
| `src/lib/admin/` | 운영자 화면 공용 조각 — 신고 상세 카드(`ReportHeader` · `ReportedCard` · `ReporterCard` · `IdentityCard`), `AccountStatus`, `FormMsg`, `SanctionForm` |
| `src/lib/server/` | 서버 전용 — 운영자 세션·권한, `reports.ts`(채팅·편지 신고 공용 로드·액션), 푸시 (`/api/push` 는 요청 키 → DB 판단 함수 표, 받을 기기는 DB `private.push_target`), `ai.ts`(Workers AI 호출) · `moderation.ts`(검열 판정 프롬프트) · `aiChat.ts`(AI 대화 프롬프트) |
| `src/lib/ai/` · `src/lib/moderation.ts` | AI 대화 상대 화면(`AiChat`, 홈 위에 덮어 띄움) · 글을 올린 뒤 검열봇 부르기(`/api/moderate`) |
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
| `npm run test:aichat` | AI 대화 상대 — 모델에 보내는 대화 모양 (사용자로 시작 · 번갈아 · system 접기), 답 가리기 |
| `npm run test:toast` | 알림 — Svelte 브라우저 모드로 컴파일해 $state proxy 관련 버그까지 검증 |
| `npm run test:platform` | 설치 안내 — 실제 UA 로 iOS/안드로이드·카카오톡 등 인앱 브라우저 판별 검증 |
| `npm run test:push` | 푸시 알림 암호화(RFC 8291)·VAPID 서명(RFC 8292) — 받는 브라우저 입장에서 복호화·검증 |
| `node scripts/vapid-keys.mjs` | 푸시 알림용 VAPID 키를 만들어 `.env` 에 추가 (이미 있으면 그대로) |
| `node scripts/import-roster.mjs <csv> [--dry-run]` | 학번-이름 명렬표를 DB 에 반영 (관리자 화면의 이메일 확인 옆 이름 표시용) |
| `npm run test:admin` | 운영자 세션 쿠키 — 위조·변조·만료·키 교체가 거부되는지 |
| `npm run test:ui [-- 이름…]` | 화면(브라우저) 테스트 20묶음 — `scripts/e2e/`. 가짜 Supabase·`/dev` 미리보기로 돌아 계정 불필요. 이름을 주면 그것만 (`-- react sheet`). 스크린샷은 OS 임시 폴더 `cnsatinder-e2e/` |
| `node scripts/generate-icons.mjs` | PWA 아이콘 재생성 — 원본은 `branding/icon-source.*`(png/webp/jpg 아무거나) (헤드리스 Chrome 사용) |

> **자동 검사 (GitHub Actions, `.github/workflows/ci.yml`)** — main 에 푸시할 때마다 타입 검사 · 단위 테스트 전부 ·
> DB 스키마 · 빌드, 그리고 화면 테스트 전부를 돌린다. 실서버가 필요한 `test:e2e` · `test:match` 는 빼고.
> 결과는 GitHub 저장소의 Actions 탭, 커밋 옆 ✓/✗.

> `npm run test:schema` 는 PGlite 단일 커넥션이라 **동시 트랜잭션을 재현하지 못한다.**
> 매칭 advisory lock 과 연장 투표 경쟁은 `supabase start`(로컬 Docker Postgres)에서
> 따로 검증해야 한다.

## 개발용 훅

- `/dev/chat?s=chat|fresh|vote|waiting|pending|ended` — 대화방 화면 미리보기 (Supabase 불필요, 개발 모드 전용).
  `&matched` 연결 화면, `&incoming` 상대 새 메시지, `&sheet=menu|report|block|profile` 시트
- `/dev/ai?s=ok|limit|full|off` — AI 대화 상대 화면 미리보기 (`&turns=2` 턴 한도, `&short` 20초 뒤 끝, `&down` AI 오류)
- `AI_FAKE=1 npm run dev` — Workers AI 대신 정해진 답 (검열: 글에 `[flag:harassment]` 가 있으면 걸림 / 대화: "AI 답: …").
  개발 서버는 원격 바인딩을 붙이지 않는다 — 진짜 AI 는 `npx wrangler login` 뒤 `CF_REMOTE=1 npm run dev`. 모델은 `AI_MODEL` 로 맨 앞에 둘 수 있다 (기본: Gemma 4 26B A4B → GLM 4.7 Flash 순서로, 되는 것을 쓴다)
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
- [x] **Phase 18 — 답장 · 첫마디 · 대화 디자인** — 말풍선 길게 누르기 → "답장", 또는 말풍선을 옆(왼쪽·오른쪽 아무 쪽)으로 밀었다 놓기. 말풍선 위에 원래 메시지를 흐리게 인용,
      누르면 그 메시지로 스크롤 + 반짝. `messages.reply_to` 는 같은 방·시스템 메시지 아닌 것만(`msg_reply_check`), 관리자 열람에도 표시.
      내가 아직 말을 안 했으면 입력창 위에 첫마디 질문 3개(신상 묻는 질문 없음, 겹치는 관심사가 있으면 그 얘기부터, 누르면 채우기만).
      5분 넘게 끊기면 시간 구분선, 매칭 직후 "○○님과 연결됐어요" 화면(1.6초)
- [x] **접근성** — 기기에서 "동작 줄이기"를 켜면 나타나기·튀기·깜빡임 애니메이션과 부드러운 스크롤을 끈다
      (답장 이동 반짝임은 커지지 않고 어두워지기만). 화면 낭독기: 말풍선마다 "나:"/"상대 이름:" 을 숨은 글로,
      상대의 새 메시지는 따로 된 안내 칸(`aria-live`)에서 하나씩 읽는다 — 들어올 때 지난 대화는 읽지 않는다
- [x] **보안 헤더** — 모든 화면에 콘텐츠 보안 정책(CSP, `vite.config.ts`): 스크립트는 SvelteKit nonce 가 붙은 것만,
      연결은 우리 사이트와 `*.supabase.co` 만, 다른 사이트의 틀(iframe) 안에서는 안 열림. 그리고 `X-Frame-Options` ·
      `nosniff` · `Referrer-Policy` · `Permissions-Policy`(카메라·마이크·위치 안 씀) (`hooks.server.ts`).
      ★ Supabase 주소를 사용자 도메인으로 바꾸면 `vite.config.ts` 의 connect-src 에 추가
- [x] **Phase 19 — 검열봇 · AI 대화 상대**
      · 1단 규칙 필터 (무료, 보내기 전): 전화번호 · 학번(학년1~3·반01~12·번호01~39) · "N학년 N반" · SNS 아이디/주소 · 금칙어
        (`private.banned_terms`, 운영 설정에서 관리자가 편집 — 틀린 정규식은 저장 전에 거른다). 채팅·편지·댓글 insert 트리거.
        막힌 채팅은 말풍선을 지우고 글을 입력창에 돌려놓는다
      · 2단 AI 검토 (보낸 뒤): 글이 올라가면 `private.mod_queue` 에 쌓이고, 학생 앱이 `/api/moderate` 를 부르면 서버가 쌓인 순서대로
        Cloudflare Workers AI(Gemma 4 26B A4B, 안 되면 GLM 4.7 Flash)에 판정을 받는다. 걸리면 신고함에 "자동" 표시로(`source = auto`, 신고자 없음) — 판단은 사람이.
        위기 신호(자해·자살)도 분류한다. 자동 신고는 자동 정지 횟수에 세지 않는다. 하루 한도(`ai_mod_daily_cap`)
      · AI 대화 상대: 상대를 찾는 동안 홈에서 "AI 와 얘기하기". 늘 "AI" 표시, 신상정보는 AI 에게도 못 보냄(같은 규칙 필터),
        사람당·앱 전체 하루 한도 · 한 번에 N분 · N턴. 대화 내용은 어디에도 저장하지 않는다(횟수만). 위기 신호엔 109 · 1388 안내
      · Workers AI 무료 몫은 하루 10,000 Neuron(UTC 00:00 = 한국 오전 9시 초기화) — 두 기능이 나눠 쓴다. 기본 한도: 검토 250건 · AI 대화 3번
        (어림값: 검토 1건 ≈ 17 Neuron, AI 대화 30턴 ≈ 1,600 Neuron). 한도를 넘기면 검토는 규칙 필터만, AI 대화는 "오늘 끝" 안내
- [x] **Phase 20 — 대화 백업 (CSV)** — 운영자 "전체 대화" 화면에서 날짜(한국 시간)를 골라 서버에서 지워지기 전 대화를 CSV 로.
      관리자만 · 받을 때마다 활동 기록(`export_messages`) · 계정 정보 없이 방 번호 · 방 안 익명 이름 · 시각 · 내용만.
      DB 가 5,000줄씩 CSV 를 만들어 주고 화면이 이어 붙인다 (Workers CPU 한도). 엑셀 수식 주입 방지(= + - @ 앞에 '), 엑셀용 BOM.
      하루 한 번 받으면 빠짐없이 남는다 (지우기는 방이 닫히고 24시간 뒤, 매일 04:17)
- [x] **요청 줄이기 (과부하 대비)** — 화면별로 나가는 요청을 실제로 세어 보고(`npm run test:ui -- requests`) 불필요한 것을 뺐다.
      · 앱을 열 때 부팅 요청(ensure_self · profiles · app_settings · my_account)이 두 번씩 나가던 것 → 한 번 (INITIAL_SESSION 중복)
      · 탭을 오갈 때마다 공지를 다시 부르던 것 → 1분 안이면 건너뜀, 주기 확인 1분 → 5분
      · 상대 찾는 중 4초마다 → 30초 뒤 8초, 2분 뒤 10초 (서버 풀 TTL 15초 안쪽. 새 사람이 들어오면 그쪽이 바로 잡아간다)
      · 대화방 안전망 30초마다 요청 4개 → 45초마다 2개 (공감 전체 · tail sweep 은 재연결 · 화면 복귀 때만)
      · 상대가 같은 방에 있으면 푸시 요청(/api/push)을 보내지 않음 — 서버도 어차피 안 보내지만 Workers 요청 한도(무료 하루 10만)를 쓴다
      · 검열봇 호출은 20초에 한 번, "가져갈 게 없음"이면 2분 쉼 · 대화 목록 안전망 20초 → 30초 · 편지 상세 30초 → 45초
      · 사진 업로드 · 웹폰트가 없고, 큰 편집기(Tiptap)는 편지 쓰기 화면에서만 불러온다
- [x] **뒤로가기 (설치된 앱)** — 홈(채팅)에서 뒤로 → "뒤로가기를 한 번 더 누르면 종료됩니다", 2초 안에 또 누르면 앱 종료.
      익명편지·프로필 탭에서 뒤로 → 채팅 홈. 탭 첫 화면에 얕은 기록(`pushState` guard)을 하나 쌓아 두고 그게 걷히는 순간을 잡는다
      (`(app)/+layout.svelte`). 홈이 기록 맨 아래여야 하므로 탭 전환은 기록을 바꿔 끼우고, 다른 화면에서 홈으로는
      뒤로 간다(`lib/nav.ts` goBack). 상단 로고 = 홈 링크
- [x] **드래그 복사 제한** — 학생 앱의 버튼·안내 문구·제목은 드래그·길게 눌러도 선택되지 않는다(`app.css` 의 `body:not(.admin)`).
      사람이 쓴 글(채팅·편지·댓글·공지·홈 배너·상대 소개)과 입력칸만 `.selectable` 로 예외. 채팅 말풍선은 폰에서 길게 누르기가
      공감이라 복사는 고르기 줄의 "복사", 마우스 기기에서는 드래그로. 운영자 화면은 그대로
- [x] **대화 소개 카드** — 대화 맨 위에 상대의 큰 아바타 · 익명 이름 · MBTI·관심사 한 줄 · "프로필 보기" (인스타 DM 첫 화면)
- [x] **하단 탭 3개 · 설정 · 아이폰 상태바** — 하단 탭 익명편지(왼쪽) · 채팅(가운데) · 프로필(오른쪽).
      상단 오른쪽의 프로필 사진 자리에 설정 톱니. 프로필 = 상대에게 보이는 것(소개 · 관심사 · MBTI)과 이야기하고 싶은 상대,
      설정 = 채팅 색상 · 새 메시지 알림 · 비밀번호 · 계정 상태 · 개인정보 안내 · 로그아웃.
      채팅 색상은 내 말풍선 색 6가지(색 동그라미만, 이름은 화면 낭독기에만). 이 기기에만 저장되고 상대 화면은 그대로.
      아이폰 홈 화면 앱(`black-translucent`)에서 머리글이 상태바(시계·배터리)와 겹치던 것 → 모든 머리글(`.topbar`)이
      `env(safe-area-inset-top)` 만큼 내려온다 (`--safe-top`). 긴 화면에서 머리글이 눌려 줄던 것도 고침(`flex: none`)
- [x] **설정 · 프로필 디자인 (아이폰 설정 앱 참고)** — 회색 바탕 위 둥근 흰 카드, 카드 위 작은 회색 제목 · 아래 설명,
      줄마다 왼쪽 이름 · 오른쪽 값/›/스위치(알림), 줄 사이 선은 왼쪽을 들여서. 머리글은 선 없이 제목 가운데 · 뒤로는 둥근 단추.
      비밀번호는 줄을 누르면 카드 안에서 펼쳐지고, 로그아웃은 빨간 글자 카드. 프로필은 맨 위 큰 아바타 · 이름,
      상대 고르기는 체크 표시 줄. 공용 스타일은 `app.css` 의 `.grouped` · `.g-card` · `.g-row` · `.switch` (다크 모드 색 포함)
- [x] **AI 모델 교체 (Gemma 3 → Gemma 4)** — "AI 연결 확인"에서 `5018: This account is not allowed to access @cf/google/gemma-3-12b-it`.
      Cloudflare 가 2026-05 에 Gemma 3 12B 폐기를 공지하고 대체로 Gemma 4 26B A4B · GLM 4.7 Flash 를 권했다.
      기본 모델을 Gemma 4 로(생각하기 끔 — 켜면 답 글자 수를 생각에 쓴다), 그게 막혀 있으면 GLM 4.7 Flash 로 자동으로 넘어간다
      (`lib/server/aiFold.ts` callModels, 된 모델은 기억). 권한 · 폐기 오류는 system 접기 없이 바로 다음 모델로
- [x] **AI 대화 "지금 답할 수 없어요" 대응** — 모델에 보내는 대화가 화면 첫 줄(AI 인사)부터 시작해 사용자 · AI 가 번갈아 가지 않았다.
      Gemma 대화 틀은 사용자로 시작해 번갈아 가야 하므로, 인사는 지시문 뒤로 옮기고 같은 쪽 말은 합친다(`aiChat.ts` chatPrompt).
      그래도 거절되면 system 지시문을 첫 사용자 말에 붙여 한 번 더 보낸다(`aiFold.ts`). 실패 이유는 Workers 로그에 남기고,
      운영 설정의 **"AI 연결 확인"** 버튼(관리자)이 짧은 질문을 보내 연결됨 / 바인딩 없음 / Cloudflare 오류 원문을 보여 준다
- [x] **Phase 21 — 만났던 사람 다시 만나기** — 설정 > 매칭 스위치 (`profiles.allow_rematch`, 기본 꺼짐).
      꺼져 있으면 지금처럼 최근(`rematch_cooldown_days`, 기본 7일)에 대화한 상대는 다시 안 잡힌다. **둘 다 켰을 때만** 다시 잡히고
      (한쪽이라도 끄면 제외 — 다시 만나기 싫은 쪽의 뜻이 우선), 켜도 처음 보는 사람이 기다리면 그쪽이 먼저. 차단한 사이는 언제나 제외
- [x] **채팅 색상 정리** — 파랑만 단색, 나머지(기본 주황→핑크 · 보라→자주 · 초록→청록 · 회색)는 그라데이션.
      기본과 겹치던 '베리'(핑크→보라)는 뺐다 (저장해 둔 기기는 기본 색으로)
- [x] **Phase 22 — 보안 점검** (`SECURITY.md`) — 푸시 구독은 알려진 푸시 서버 주소만(DB + 서버 두 겹) · 한 사람 10대까지,
      `profiles` · `user_presence` · `app_settings` 의 남는 표 권한 회수, 트리거 함수 실행 권한 회수, 함수 8개 `search_path` 고정,
      검열 프롬프트 구분선 막기. 권한 시험은 Supabase 기본 권한을 흉내 낸 위에서 돈다. 실DB 적용 · Advisor 확인 (2026-09-25)
- [x] **답장 모양 다듬기** — 인용 상자가 답장 말풍선 뒤로 겹쳐 들어가던 것 → 틈을 두고 위에. 입력창 위 "○○에게 답장" 막대의
      세로줄은 설정의 채팅 색상(`--bubble-fill`)을 따른다
- [x] **밀어서 답장** — 채팅 말풍선(또는 그 줄의 빈자리)을 손가락으로 옆으로 밀면 따라오고, 드러난 자리에 답장 화살표. 64px 넘게 밀면 진동 한 번,
      놓으면 그 메시지에 답장. 위아래가 더 크면 스크롤 · 짧게 밀면 취소 · 마우스 드래그는 글자 고르기 그대로(`touch-action: pan-y`)
- [x] **Phase 23 — 이름 편지 (익명편지 리뉴얼)** — 학생 검색 → 그 학생에게 편지 → 둘이 주고받기. 받는 사람은 이름이 보이고
      보낸 사람은 익명 이름. 처음 가입할 때 이름 확인 (명렬표에서 자동, 없으면 한 번 입력 · `private.self_names`), 설정 > 편지 받기(기본 켜짐).
      괴롭힘 막기: 새 편지 하루 몇 통(편지 버킷) · 답 없이 3개까지 · 받는 사람이 끝내면 그 사람은 다시 못 보냄 · 차단(채팅과 공유) ·
      신고 = 자동 차단 + 끝내기 + 누적 정지 · 규칙 필터 · AI 검토. 운영자는 신고된 편지의 보낸 사람을 확인하고(기록 남음) 내릴 수 있다.
      새 편지·답장은 푸시 알림, 익명편지 탭에 안 읽은 빨간 점. 옛 공개 피드·편집기·하트 화면은 뺐다 (데이터는 DB 에 그대로)
- [x] **Phase 24 — 편지 쓰기 편집기** — 새 편지를 쓸 때 서식 도구 막대 (굵게 · 기울임 · 밑줄 · 취소선 · 형광펜 5색 · 글자색 6색 · 크기 · 정렬 · 되돌리기, Tiptap).
      Phase 14 와 같은 방식 — 본문은 순수 텍스트, 서식은 `dm_msgs.fmt` 에 범위 목록으로, DB 가 `letter_fmt_ok` 로 검사. 받는 쪽 말풍선도 표로만 그린다(HTML 없음). 답장은 글자만
- [ ] Phase 7 — Durable Object 전송 계층 + 학술탐구 실험
