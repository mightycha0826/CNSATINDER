import { redirect } from '@sveltejs/kit';

/**
 * 예전 편지 주소(/letters/<편지 줄기 번호>) — Phase 32 전 알림 · 기록에 남은 주소. 편지 한 통씩 여는 편지함으로 보낸다.
 */
export function load() {
	redirect(307, '/letters');
}
