import { fetchMailbox, type Box, type Folder, type MailItem } from './api';
import { refreshUnread } from './unread.svelte';

/**
 * 편지함 목록 (Phase 35) — 편지함 첫 화면(/letters)과 보관함(/letters/archive)이 같이 쓴다.
 * 앱 안에서 한 번 읽은 목록은 기억해 두고, 화면에 다시 들어오면 기억한 것부터 바로 그린 뒤 뒤에서 새로 읽는다
 * (서버를 기다리는 빈 화면 없이 — 새 목록이 오면 조용히 바뀐다).
 */
export const PAGE = 30;

export const BOX = $state({
	received: [] as MailItem[],
	sent: [] as MailItem[],
	loaded: { received: false, sent: false } as Record<Box, boolean>,
	more: { received: false, sent: false } as Record<Box, boolean>,
	/** 내 편지 폴더 (Phase 47) — 편지함 첫 쪽과 같이 온다. 폴더에 넣은 편지는 received · sent 에 없다 */
	folders: [] as Folder[]
});

export async function loadBox(box: Box) {
	try {
		const r = await fetchMailbox(box);
		BOX[box] = r.letters;
		BOX.more[box] = r.letters.length === PAGE;
		if (r.folders) BOX.folders = r.folders;
	} catch {
		/* 다음 번에 — 기억해 둔 목록을 그대로 보여 준다 */
	} finally {
		BOX.loaded[box] = true;
	}
}

export function refreshMailbox() {
	void loadBox('received');
	void loadBox('sent');
	void refreshUnread();
}

/** 화면을 보고 있는 동안의 주기 확인 — 새로 올 수 있는 건 받은 편지뿐 (안 읽은 수는 받은 편지와 함께 앱 틀이 따로 센다) */
export function pollMailbox() {
	void loadBox('received');
}

export async function loadMore(box: Box) {
	const last = BOX[box].at(-1);
	if (!last) return;
	const r = (await fetchMailbox(box, last.id).catch(() => null))?.letters ?? [];
	BOX[box] = [...BOX[box], ...r];
	BOX.more[box] = r.length === PAGE;
}

/** 버리기 · 차단 · 신고로 편지 줄기를 지웠을 때 — 목록에서 바로 빼고 새로 읽는다 */
export function dropThread(threadId: number) {
	BOX.received = BOX.received.filter((x) => x.thread_id !== threadId);
	BOX.sent = BOX.sent.filter((x) => x.thread_id !== threadId);
	refreshMailbox();
}

/** 폴더에 넣었다 · 폴더를 바꿨다 · 지웠다(Phase 69) — 목록에서 바로 빼고(폴더에 간 편지는 보관함 목록에 없다) 새로 읽어 폴더 수를 맞춘다 */
export function filed(ids: number[]) {
	const gone = new Set(ids);
	BOX.received = BOX.received.filter((x) => !gone.has(x.id));
	BOX.sent = BOX.sent.filter((x) => !gone.has(x.id));
	refreshMailbox();
}

/** 편지를 열었다 — 목록에서도 바로 "열어 봄"으로 (서버는 dm_open 이 이미 기록했다) */
export function markOpened(id: number) {
	const it = BOX.received.find((x) => x.id === id);
	if (it) it.opened = true;
}
