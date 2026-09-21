declare global {
	namespace App {
		interface Locals {
			/** Phase 6: /admin 서버 가드가 채운다. 학생 앱 경로에서는 항상 null. */
			staff: { id: string; role: 'moderator' | 'admin' } | null;
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
