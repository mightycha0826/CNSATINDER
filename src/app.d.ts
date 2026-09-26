declare global {
	namespace App {
		interface Locals {
			/** Phase 6: /admin 서버 가드가 채운다. 학생 앱 경로에서는 항상 null. */
			staff: { id: string; role: 'moderator' | 'admin' } | null;
		}
		/** 얕은 기록 항목 (pushState) — guard = 탭 첫 화면의 "뒤로가기 한 번 더" 표식 ((app)/+layout.svelte) */
		interface PageState {
			guard?: boolean;
			/** 방금 매칭돼서 들어가는 대화방 — 연결 화면을 한 번 보여 준다 (chat/[id]) */
			matched?: boolean;
			/** 홈 위에 AI 대화 상대가 열려 있다 — 뒤로가기로 닫힌다 ((app)/+page.svelte) */
			ai?: boolean;
			/** 편지 쓰기 — 검색에서 고른 받는 사람 (letters/new). 새로고침하면 사라져 다시 고르게 한다 */
			to?: { id: string; name: string; grade: number | null; checked: boolean };
		}
		/** Cloudflare Workers — 응답 뒤에도 작업(푸시 발송)을 마저 하기 위해 · Workers AI 바인딩(wrangler.jsonc "ai") */
		interface Platform {
			context?: { waitUntil(p: Promise<unknown>): void };
			env?: { AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> } };
		}
	}

	interface Window {
		/** beforeinstallprompt 이벤트를 보관 (PWA 설치 게이트) */
		__installEvt?: BeforeInstallPromptEvent;
	}

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}
}

export {};
