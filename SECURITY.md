# 보안 정책 · 점검 기록

CNSATINDER 는 한 학교 학생들이 쓰는 익명 채팅 · 익명편지 앱입니다.
가장 중요하게 지키는 것은 **"누가 누구인지"가 다른 학생에게 드러나지 않는 것**과
**운영진의 신원 열람이 반드시 기록으로 남는 것**입니다.

## 취약점 제보

- 공개 이슈에 올리지 말고 **GitHub 비공개 보안 제보**로 알려 주세요:
  저장소 → Security → *Report a vulnerability*
  (<https://github.com/mightycha0826/CNSATINDER/security/advisories/new>)
- 재현 방법, 영향(누구의 어떤 정보가 드러나는지), 가능하면 요청 예시를 함께 적어 주세요.
- 다른 학생의 계정 · 대화에 실제로 접근해 보는 방식의 시험은 하지 마세요. 본인 계정 두 개로 재현해 주세요.

지원 버전: `main` 브랜치에서 배포된 최신 버전만 고칩니다.

---

## 보안 설계 요약

### 1. 로그인 · 계정
| 무엇 | 어떻게 | 근거 |
|---|---|---|
| 학교 계정만 | 가입 · 이메일 변경 때 DB 트리거가 학교 도메인이 아니면 막는다 | `supabase/schema.sql` `private.enforce_school_domain` |
| 계정 선점 막기 | 이메일 확인 전 계정의 비밀번호를 트리거가 지운다 | `private.strip_unconfirmed_password` |
| 인증 코드 | 8자리 · 10분 만료, 로그인 요청 한도(IP 단위) | README "처음 설정하기" |
| 역할 위조 방지 | `profiles` 는 본인 행만 읽고, 고칠 수 있는 열은 `gender · want · onboarded · allow_rematch` 뿐 (정지 · 인증 상태는 못 바꿈) | `schema.sql` 열 단위 `grant update (…)` |

### 2. 데이터베이스 (Supabase)
- **모든 표에 RLS.** 학생이 직접 읽을 수 있는 건 내 방 · 내 메시지 · 공개 편지처럼 정책이 허락한 행뿐입니다.
- **`private` 스키마는 API 에 노출되지 않습니다** (신고 · 증거 · 운영진 명단 · 명렬표 · 활동 기록 · AI 대기열).
- 쓰기는 거의 전부 **security definer 함수(RPC)** 로만 합니다. 학생이 부를 수 있는 함수 37개는 모두
  `auth.uid()` 또는 `my_seat()`(= 그 방에 내가 있는지)로 호출한 사람을 확인하고, 아니면 `not_member` 등으로 거절합니다.
- 운영 기능(`admin_*` · `mod_*` · 푸시 발송 판단)은 **service_role 만** 실행할 수 있습니다 — 학생 토큰으로는 `permission denied`.
- 상대의 계정 id 는 어떤 응답에도 나오지 않습니다. 방 안에서는 방 번호 · 자리(1/2) · 익명 이름만 씁니다.
- 연타 · 도배 제한: 메시지(토큰 버킷 12개, 초당 1.5개) · 매칭 · 편지 · 댓글마다 DB 가 셉니다.
- 규칙 필터: 전화번호 · 학번 · "N학년 N반" · SNS 아이디 · 금칙어가 들어간 채팅 · 편지 · 댓글은 **DB 가 저장 전에 거절**합니다.

### 3. 운영자 화면 (`/admin`)
- 로그인: 브라우저가 Supabase 로 로그인 → 서버가 **토큰을 Supabase 에 직접 검증** → 운영진 명단 확인 → 서명 쿠키 발급.
- 쿠키: HMAC-SHA256 서명, `HttpOnly` · `SameSite=Strict` · `Secure` · 경로 `/admin` · 8시간 (`src/lib/server/adminSession.ts`).
- **매 요청마다 운영진 명단을 다시 확인**합니다 — 명단에서 빼면 쿠키가 살아 있어도 바로 막힙니다 (`src/hooks.server.ts`).
  `ADMIN_SESSION_SECRET` 을 바꾸면 전원 즉시 로그아웃.
- 역할 분리: 운영진(moderator)은 신고 처리 · 7일 이하 정지까지. 신원(이메일 · 학번 이름) 열람 · 대화 전문 · 설정 · 백업은 관리자만.
  화면(`requireAdmin`)과 DB(`private.require_staff`) **양쪽에서** 검사합니다.
- **신원 열람은 기록이 먼저**: 활동 기록 저장이 실패하면 열람도 하지 않습니다 (`revealIdentity`).
- 대화 백업(CSV)은 관리자만, 받을 때마다 기록, 계정 정보 없이 익명 이름과 내용만, 엑셀 수식 주입 방지.
- 운영자 화면은 `Cache-Control: no-store` · `noindex` · `Referrer-Policy: no-referrer`.

### 4. 웹 · 브라우저
- **CSP**: 스크립트는 SvelteKit nonce 로만, 연결은 우리 사이트와 `*.supabase.co` 로만, `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` (`vite.config.ts`).
  스타일만 `unsafe-inline` 허용(Svelte 전환 효과 · 편지 편집기).
- 헤더: `X-Frame-Options: DENY` · `nosniff` · `Referrer-Policy` · `Permissions-Policy`(카메라 · 마이크 · 위치 끔).
- XSS: 코드 어디에도 `{@html}` · `innerHTML` 이 없습니다 — 사람이 쓴 글은 전부 Svelte 가 이스케이프합니다.
  편지 서식은 정해진 색 · 크기 표에서만 고르고(`src/lib/letters/rich.ts`), DB 도 서식 모양을 검사합니다(`private.letter_fmt_ok`).
- CSRF: SvelteKit 기본 출처 검사 + 운영자 쿠키 `SameSite=Strict`.
- 서비스워커는 같은 출처 주소만 열고, 운영자 화면은 캐시하지 않습니다 (`static/sw.js`).

### 5. 서버 API (Cloudflare Workers)
- `/api/push` · `/api/moderate` · `/api/ai-chat` 은 `Authorization: Bearer` 토큰을 **서버가 Supabase 에 검증**해서 누구인지 정합니다.
  클라이언트가 보낸 사용자 id 는 믿지 않습니다.
- service_role 키는 서버 코드(`src/lib/server/`)에서만 쓰고, 앱과 다른 Supabase 프로젝트 키를 넣으면 시작하지 않습니다.
- 알 수 없는 서버 오류는 화면에 짧은 번호만 보이고 원인은 Workers 로그에만 남습니다.

### 6. 푸시 알림
- 본문은 RFC 8291(aes128gcm)로 암호화 — 구글 · 애플 푸시 서버도 내용을 못 읽습니다. 발신자 인증은 VAPID.
- 알림 문구에 계정 id 가 없습니다. 받는 사람이 앱을 보고 있으면 보내지 않고, 한 메시지에 한 번만 보냅니다.
- **알려진 푸시 서버 주소만** 저장하고(DB) 발송 직전에도 한 번 더 확인합니다(서버) — 2026-09-25 점검에서 추가.

### 7. AI (Cloudflare Workers AI)
- AI 대화 내용은 **어디에도 저장하지 않습니다**(몇 번 썼는지만 셉니다). 검열봇이 보는 글도 결과(걸림/분류/짧은 이유)만 남깁니다.
- 한도: 사람당 · 앱 전체 하루 횟수, 한 번에 시간 · 턴 제한 — DB 가 셉니다. 학생이 보낸 말도 규칙 필터를 거칩니다.
- AI 답에서 전화번호 · @아이디 모양은 가립니다.
- 검열 프롬프트는 검사할 글을 구분선으로 감싸고, 글 안의 구분선 흉내(`<<<` `>>>`)는 바꿔 넣습니다.
- 두 기능 모두 기본은 꺼짐 — 운영 설정에서 켭니다. 글은 Cloudflare 로 보내지므로 개인정보 처리방침에 적어야 합니다.

### 8. 데이터 보존
- 채팅 메시지는 방이 닫히고 24시간 뒤 매일 04:17 에 지워집니다 (pg_cron). 신고된 대화는 증거로 **복사**해 두므로 함께 지워지지 않습니다.
- 처리 끝난 신고 · 푸시 기록 등도 주기적으로 정리합니다.

### 9. 비밀 값
- `.env` · `.env.*` 와 명렬표(`*roster*.csv/xlsx`)는 `.gitignore` 로 커밋되지 않습니다. 저장소 기록에서도 키가 발견되지 않았습니다(2026-09-25 확인).
- 운영에 필요한 값: `SUPABASE_SERVICE_ROLE_KEY` · `ADMIN_SESSION_SECRET`(32자 이상) · `VAPID_PRIVATE_KEY` — Cloudflare 의 Secret 으로만.

---

## 점검 기록 — 2026-09-25

범위: 서버 경로 전부(`src/routes/**/+server.ts`, `+page.server.ts`), 훅, 운영자 인증, 학생이 부를 수 있는 DB 함수,
표 · 열 · 함수 권한(실DB 에서 직접 조회), CSP · 헤더, XSS 경로, 서비스워커, 비밀 값(현재 파일 + git 기록), 의존성(`npm audit`),
Supabase 보안 점검기(Security Advisor).

| # | 발견 | 위험도 | 조치 |
|---|---|---|---|
| 1 | 푸시 구독 주소로 **아무 `https://` 주소**나 저장할 수 있었다 → 서버(Worker)가 학생이 정한 주소로 요청을 보내게 만들 수 있음 | 중간 | **고침** — DB(`save_push_subscription`)와 서버(`isPushEndpoint`) 양쪽에서 구글 · 애플 · 모질라 · 윈도 푸시 서버만 허용. 한 사람 기기 10대까지 |
| 2 | `profiles` · `user_presence` · `app_settings` 에 Supabase 기본 권한(anon · authenticated 에 INSERT · DELETE · TRUNCATE 등)이 남아 있었다. RLS 가 막고 있어 API 로 악용되지는 않지만 RLS 를 거치지 않는 권한(TRUNCATE)까지 열려 있었음 | 낮음 | **고침** — 앱이 실제로 쓰는 권한만 남김 (Phase 22) |
| 3 | 트리거 전용 함수 3개(`handle_new_user` · `msg_rate_limit` · `sync_verified`)를 로그인 안 한 사람도 부를 수 있게 권한이 열려 있었다 (실행하면 오류라 영향은 없음) | 낮음 | **고침** — 실행 권한 회수 |
| 4 | 바깥 표를 쓰지 않는 함수 8개의 `search_path` 가 고정되지 않았다 (Advisor 경고) | 낮음 | **고침** — `search_path = ''` |
| 5 | 검열 프롬프트: 글 안에 구분선(`>>>`)을 넣어 [검사할 글] 밖으로 빠져나가려는 시도 | 낮음 | **고침** — 글 안의 구분선을 바꿔 넣음 |
| 6 | 권한 시험이 Supabase 기본 권한을 흉내 내지 않아 일부 "막힘" 시험이 실제와 달리 통과하고 있었다 | 시험 품질 | **고침** — 시험 DB 에 Supabase 기본 권한을 똑같이 주고 다시 검증 (`supabase/schema.test.mjs` [70]) |
| 7 | 유출된 비밀번호 차단(HaveIBeenPwned) 꺼짐 | 낮음 | **대시보드에서 켜야 함** — Supabase → Authentication → 비밀번호 설정 |
| 8 | 운영진(moderator)도 활동 기록(누가 어떤 계정을 열람했는지, 계정 id 수준)을 볼 수 있다 | 정보 | 유지 — 운영진 간 투명성. 바꾸려면 `/admin/audit` 를 관리자 전용으로 |
| 9 | AI 대화 기록은 학생 기기가 들고 있다가 보낸다 → AI 말을 꾸며 넣어 AI 를 흔들 수 있음 | 정보 | 유지 — 결과는 그 학생 본인 화면에만 보이고 저장되지 않음. 학생 말은 규칙 필터를 거침 |
| 10 | 개발 의존성 `cookie` 0.6 저위험 권고(GHSA-pxg6-pf52-xh8x — 쿠키 이름 · 경로에 이상한 문자) | 낮음 | 영향 없음 — 쿠키 이름 · 경로는 코드에 고정. SvelteKit 업데이트 때 함께 해소. 배포 의존성(`npm audit --omit=dev`)은 0건 |
| 11 | Advisor "RLS 켜짐 · 정책 없음"(22개) · "로그인 사용자가 definer 함수 실행 가능"(37개) | 의도 | 유지 — 정책 없음 = 모두 거절(RPC 로만 접근). 학생용 함수는 위 2절대로 호출자를 확인 |

확인한 것(문제 없음): 운영자 쿠키 서명 · 만료 · 명단 재확인, 관리자 전용 화면의 역할 검사(화면 + DB),
방 · 편지 함수의 호출자 확인(비회원 → `not_member`), 알림 클릭 주소(같은 출처만), `{@html}` 없음, 커밋된 비밀 값 없음.

### 실DB 반영
- `supabase/schema.sql` Phase 22 — 2026-09-25 Supabase 커넥터로 실DB 에 적용, Advisor 에서 `search_path` 8건 · 익명 실행 3건 경고가 사라진 것을 확인.
- 적용 뒤 실제 학생 계정 권한으로 내 프로필 · 설정 · 대화 목록 · 공지 읽기가 되는지 확인(되돌린 트랜잭션 안에서).

## 운영 체크리스트
- [ ] Supabase → Authentication: **유출된 비밀번호 차단 켜기**, 비밀번호 최소 8자 · 영문+숫자
- [ ] `ADMIN_SESSION_SECRET` · `VAPID_PRIVATE_KEY` · service_role 키는 Cloudflare Secret 으로만, 사람이 바뀌면 교체
- [ ] 운영진 명단(`private.staff`)을 학기마다 확인하고 그만둔 사람은 지우기
- [ ] 개인정보 처리방침에 AI(Cloudflare Workers AI) 사용 · 대화 백업 가능성 적기
- [ ] DB 를 바꾸면 Security Advisor 다시 돌리기

## 스스로 확인하는 방법
```bash
npm run test:schema   # RLS · 권한 · 함수 호출자 확인 (Supabase 기본 권한 위에서)
npm run test:push     # 푸시 암호화 · VAPID · 보낼 수 있는 주소
npm run test:aichat   # AI 프롬프트 모양 · 검열 구분선
npm run test:ui -- security   # CSP · 헤더 · 틀(iframe) 막기
npm audit --omit=dev
```
