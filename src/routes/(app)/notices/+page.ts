import { redirect } from '@sveltejs/kit';

/**
 * 예전 공지사항 목록 (Phase 40 에서 없앰) — 공지 · 개인 공지는 이제 알림(하트)에 다른 알림과 섞여 나온다.
 * 푸시 알림(개인 공지는 /notices 로 온다) · 예전 주소로 들어오면 알림 화면으로 보낸다.
 */
export function load() {
	redirect(307, '/activity');
}
