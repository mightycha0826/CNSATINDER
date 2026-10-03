import { fetchMailbox, type Box, type Folder, type MailItem } from './api';
import { refreshUnread } from './unread.svelte';
import { accountIsCurrent, accountToken, currentAccountId, onAccountChange } from '../accountScope';
import { errMsg } from '../errors';

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
	busy: { received: false, sent: false } as Record<Box, boolean>,
	loading: { received: false, sent: false } as Record<Box, boolean>,
	error: { received: null, sent: null } as Record<Box, string | null>,
	/** 내 편지 폴더 (Phase 47) — 편지함 첫 쪽과 같이 온다. 폴더에 넣은 편지는 received · sent 에 없다 */
	folders: [] as Folder[]
});

/**
 * 우체통에서 나오는 장면을 이미 보여 준 안 읽은 편지 (Phase 71) — 앱을 켠 동안 한 번만.
 * 편지함에 다시 들어올 때마다 같은 편지가 또 떨어지지 않게 (화면을 그리는 데 쓰지 않아 반응형이 아니다)
 */
export const ANNOUNCED = new Set<number>();

/** 방금 편지를 보냈다 (Phase 72) — 편지함으로 돌아오면 우체통 위에 "+✉" · 책상 더미에 그 편지가 내려앉는다 (한 번 쓰고 끈다) */
export const POSTED = { pending: false };

/**
 * 우체통을 눌러 편지를 꺼낸다 (Phase 79) — 편지함이 누른 순간의 우체통 자리 · 크기 · 안에 든 편지 수를 적어 두면
 * 편지 화면이 같은 자리에 같은 우체통을 그려 이어 받는다 (화면 넘김 없이 그대로 → 우체통이 두 번 덜컹 → 투입구에서 편지가 나온다).
 * 이동을 시작하지 않은 채 2초가 지났거나 한 번 가져가면 끝 (화면을 그리는 데 쓰지 않아 반응형이 아니다)
 */
type Knock = { w: number; top: number; wallH: number; count: number };
export const KNOCK = { at: 0, hand: null as Knock | null, navigation: null as Promise<void> | null };
export const knockFresh = () => KNOCK.hand != null && (KNOCK.navigation !== null || performance.now() - KNOCK.at < 2000);
/** 현재 이동이 느려도 우체통 위치를 유지한다. 완료·실패한 이동의 정보는 남기지 않는다. */
export function holdKnock(navigation: Promise<void>) {
	KNOCK.navigation = navigation;
	void navigation.catch(() => {}).finally(() => {
		if (KNOCK.navigation !== navigation) return;
		KNOCK.navigation = null;
		KNOCK.hand = null;
	});
}
/**
 * 알림에서 편지로 (Phase 80) — 편지 한 통(/letters/m/번호)을 가리키는 알림은 편지함으로 보내 우체통에서 꺼내게 한다
 * (편지함이 ?take=번호 를 보면 우체통을 보여 준 뒤 스스로 눌러 — 두 번 덜컹 → 투입구에서 편지). 서비스워커(static/sw.js)도 같은 규칙
 */
export const viaMailbox = (url: string) => {
	const m = /^\/letters\/m\/(\d+)$/.exec(url);
	return m ? `/letters?take=${m[1]}` : url;
};
export function takeKnock(): Knock | null {
	const h = knockFresh() ? KNOCK.hand : null;
	KNOCK.hand = null;
	return h;
}

const requests: Record<Box, number> = { received: 0, sent: 0 };
const failedMore: Record<Box, boolean> = { received: false, sent: false };
onAccountChange(() => {
	BOX.received = [];
	BOX.sent = [];
	BOX.folders = [];
	BOX.loaded = { received: false, sent: false };
	BOX.more = { received: false, sent: false };
	BOX.busy = { received: false, sent: false };
	BOX.loading = { received: false, sent: false };
	BOX.error = { received: null, sent: null };
	failedMore.received = false;
	failedMore.sent = false;
	requests.received++;
	requests.sent++;
	ANNOUNCED.clear();
	POSTED.pending = false;
	KNOCK.at = 0;
	KNOCK.hand = null;
	KNOCK.navigation = null;
});

/** 첫 페이지와 더보기의 응답·실패·계정 경계를 한 곳에서 처리한다. */
async function loadPage(box: Box, append: boolean) {
	if (!currentAccountId() || (append && (BOX.busy[box] || BOX.loading[box]))) return;
	const before = append ? BOX[box].at(-1)?.id : undefined;
	if (append && before === undefined) return;
	const token = accountToken();
	const sequence = append ? requests[box] : ++requests[box];
	const current = () => accountIsCurrent(token) && sequence === requests[box];
	BOX.busy[box] = append;
	if (!append) BOX.loading[box] = true;
	BOX.error[box] = null;
	try {
		const { letters, folders } = await fetchMailbox(box, before);
		if (!current()) return;
		const existing = new Set(append ? BOX[box].map((item) => item.id) : []);
		BOX[box] = append ? [...BOX[box], ...letters.filter((item) => !existing.has(item.id))] : letters;
		BOX.more[box] = letters.length === PAGE;
		failedMore[box] = false;
		if (!append && folders) BOX.folders = folders;
	} catch (error) {
		if (current()) {
			BOX.error[box] = errMsg(error);
			failedMore[box] = append;
		}
	} finally {
		if (current()) {
			BOX.busy[box] = false;
			if (!append) {
				BOX.loaded[box] = true;
				BOX.loading[box] = false;
			}
		}
	}
}

export const loadBox = (box: Box) => loadPage(box, false);

export function refreshMailbox() {
	void reloadMailbox();
}
/** refreshMailbox 와 같다 — 다 읽으면 풀리는 약속을 돌려준다 (편지함이 방금 보낸 편지를 더미에 내려앉힐 때) */
export async function reloadMailbox() {
	await Promise.all([loadBox('received'), loadBox('sent'), refreshUnread()]);
}

/** 화면을 보고 있는 동안의 주기 확인 — 새로 올 수 있는 건 받은 편지뿐 (안 읽은 수는 받은 편지와 함께 앱 틀이 따로 센다) */
export function pollMailbox() {
	void loadBox('received');
}

export const loadMore = (box: Box) => loadPage(box, true);

/** 실패한 요청부터 다시 시도한다 — 더보기 실패는 이미 불러온 쪽을 유지한다. */
export const retryBox = (box: Box) => (failedMore[box] ? loadMore(box) : loadBox(box));

/** 버리기 · 차단 · 신고로 편지 줄기를 지웠을 때 — 목록에서 바로 빼고 새로 읽는다 */
export function dropThread(threadId: number) {
	const affected = (['received', 'sent'] as const).filter((box) => BOX[box].some((item) => item.thread_id === threadId));
	BOX.received = BOX.received.filter((x) => x.thread_id !== threadId);
	BOX.sent = BOX.sent.filter((x) => x.thread_id !== threadId);
	void Promise.all([...(affected.length ? affected : ['received', 'sent'] as const).map((box) => loadBox(box)), refreshUnread(true)]);
}

/** 폴더에 넣었다 · 폴더를 바꿨다 · 지웠다(Phase 69) — 목록에서 바로 빼고(폴더에 간 편지는 보관함 목록에 없다) 새로 읽어 폴더 수를 맞춘다 */
export function filed(ids: number[]) {
	const gone = new Set(ids);
	const affected = (['received', 'sent'] as const).filter((box) => BOX[box].some((item) => gone.has(item.id)));
	BOX.received = BOX.received.filter((x) => !gone.has(x.id));
	BOX.sent = BOX.sent.filter((x) => !gone.has(x.id));
	// 폴더 카운트는 첫 페이지 응답에 함께 온다. 이미 열린 편지를 옮겨서 unread는 바뀌지 않는다.
	void Promise.all((affected.length ? affected : ['received'] as const).map((box) => loadBox(box)));
}

/** 편지를 열었다 — 목록에서도 바로 "열어 봄"으로 (서버는 dm_open 이 이미 기록했다) */
export function markOpened(id: number) {
	const it = BOX.received.find((x) => x.id === id);
	if (it) it.opened = true;
}
