import type { InboxRoom } from './inbox.svelte';

/**
 * 배지 (docs/UX-GUIDELINES.md G10) — 정확하게, 보면 지워지게.
 *
 *  · 채팅 탭 · 앱 아이콘이 세는 "답할 대화" = 안 읽은 말이 있거나(unread > 0) 아직 열어 보지 않은 새 대화(끝나지 않은 것)
 *  · 앱 아이콘 = 답할 대화 수 + 안 읽은 편지 수 (G10.4). 공지는 세지 않는다 (하트 점, G10.2)
 *
 * 앱 아이콘 배지(navigator.setAppBadge)는 지원될 때만 — iOS 16.4+ 홈 화면 앱 + 알림 허용, 데스크톱 설치 앱.
 * 안드로이드 크롬은 없다(알림이 곧 배지). 앱이 꺼져 있는 동안은 서비스워커가 이어서 센다 — 앱이 마지막으로 알려 준
 * 숫자(대화 id 들 · 편지 수)에 그 뒤 새로 뜬 알림을 더한다 (static/sw.js). 그래서 여기서 서비스워커에도 알린다.
 */
export const waitingRooms = (rooms: InboxRoom[]) => rooms.filter((r) => r.unread > 0 || (!r.joined && r.status !== 'closed'));

type BadgeNav = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

function tellWorker(msg: Record<string, unknown>) {
	try {
		navigator.serviceWorker?.controller?.postMessage({ type: 'badge', ...msg });
	} catch {
		/* 서비스워커 없음 */
	}
}

let last = '';
/** 지금 기다리는 것 — 바뀌었을 때만 아이콘을 고친다 */
export function syncAppBadge(roomIds: string[], letters: number) {
	const n = roomIds.length + letters;
	const key = `${roomIds.join(',')}|${letters}`;
	if (key === last) return;
	last = key;
	tellWorker({ rooms: roomIds, dm: letters, since: Date.now() });
	const nav = navigator as BadgeNav;
	const p = n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.();
	p?.catch(() => {}); // 알림 권한이 없으면 거절된다 — 조용히
}

/** 로그아웃 — 아이콘 배지를 지우고 서비스워커도 더 세지 않게 */
export function clearAppBadge() {
	last = '';
	tellWorker({ clear: true });
	(navigator as BadgeNav).clearAppBadge?.()?.catch(() => {});
}
