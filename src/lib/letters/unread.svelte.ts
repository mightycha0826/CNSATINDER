import { fetchInbox, type DmItem } from './api';

/**
 * 안 읽은 편지 수 — 하단 탭 "익명편지" 위의 빨간 점.
 * 탭 화면이 목록을 새로 읽으면 여기도 같이 바뀌고, 그 밖에는 앱이 보이는 동안 가끔(2분) 확인한다.
 */
export const DM = $state({ unread: 0 });

export const countUnread = (threads: DmItem[]) => threads.reduce((n, t) => n + t.unread, 0);

export async function refreshUnread() {
	try {
		DM.unread = countUnread((await fetchInbox()).threads);
	} catch {
		/* DB 가 이름 편지 전이거나 네트워크 — 점을 그대로 둔다 */
	}
}
