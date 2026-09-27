import { fetchUnread } from './api';

/**
 * 안 연 편지 수 — 하단 탭 "익명편지" 위의 빨간 점.
 * 편지함 화면이 목록을 새로 읽으면 여기도 같이 바뀌고, 그 밖에는 앱이 보이는 동안 가끔(2분) 확인한다.
 */
export const DM = $state({ unread: 0 });

export async function refreshUnread() {
	try {
		DM.unread = await fetchUnread();
	} catch {
		/* DB 가 편지함 전이거나 네트워크 — 점을 그대로 둔다 */
	}
}

/**
 * 편지함에서 보고 있던 칸 (받은 편지 · 보낸 편지) — 편지를 열었다가 뒤로 와도 그 칸 그대로.
 * 편지를 열면 그 편지 쪽(보낸/받은)으로 맞춘다.
 */
export const LIST = $state({ tab: 'received' as 'received' | 'sent' });
