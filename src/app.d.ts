declare global {
	namespace App {
		interface Locals {
			/** Phase 6: /admin 서버 가드가 채운다. 학생 앱 경로에서는 항상 null. */
			staff: { id: string; role: 'moderator' | 'admin' } | null;
		}
		/** 얕은 기록 항목 (pushState) — guard = 탭 첫 화면의 "뒤로가기 한 번 더" 표식 ((app)/+layout.svelte) */
		interface PageState {
			guard?: boolean;
		}
		/** Cloudflare Workers — 응답 뒤에도 작업(푸시 발송)을 마저 하기 위해 */
		interface Platform {
			context?: { waitUntil(p: Promise<unknown>): void };
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
