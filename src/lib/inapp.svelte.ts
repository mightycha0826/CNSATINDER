import { untrack } from 'svelte';
import { PREFS } from './prefs.svelte';

/**
 * 앱 안 알림 (Phase 35) — 앱을 보고 있을 때 새 메시지 · 편지 · 공지가 오면 화면 위에서 내려오는 띠 (카카오톡 · 인스타처럼).
 * 한 번에 한 장 — 새 알림이 오면 그 자리에서 바뀐다. 같은 대화(key)면 내용만 최신으로.
 * 알리는 곳: 대화 목록(INBOX.onNew, 실시간) · 서비스워커(푸시가 왔는데 앱이 화면에 떠 있을 때) · 편지 수(DM.unread)가 늘었을 때.
 * 지금 그 화면(url)을 보고 있으면 띄우지 않는다. 설정 › 알림에서 "앱 안 알림"을 끄면 띄우지 않는다 (Phase 43).
 */
export type InApp = {
	key: string;
	title: string;
	body: string;
	url: string;
	kind: 'chat' | 'letter' | 'notice' | 'reaction';
	/** 같은 key 로 바뀔 때마다 올라간다 — 띠가 다시 살짝 튄다 */
	n: number;
};

export const INAPP = $state({ cur: null as InApp | null });

const SHOW_MS = 4200;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
/** 방금 보여 준 알림 — 같은 알림이 두 곳(실시간 · 푸시)에서 거의 동시에 와도 한 번만 */
const recent = new Map<string, number>();

export function notifyInApp(n: Omit<InApp, 'n'>, dedupeKey = '') {
	untrack(() => {
		if (!PREFS.inApp) return;
		if (typeof location !== 'undefined' && location.pathname === n.url) return;
		if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
		if (dedupeKey) {
			const t = recent.get(dedupeKey);
			if (t && Date.now() - t < 8000) return;
			recent.set(dedupeKey, Date.now());
			if (recent.size > 50) recent.delete(recent.keys().next().value!);
		}
		INAPP.cur = { ...n, n: ++seq };
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => (INAPP.cur = null), SHOW_MS);
	});
}

export function dismissInApp() {
	if (timer) clearTimeout(timer);
	timer = null;
	INAPP.cur = null;
}

/** 손가락이 띠 위에 있는 동안은 사라지지 않게 */
export function holdInApp(on: boolean) {
	if (timer) clearTimeout(timer);
	timer = on ? null : setTimeout(() => (INAPP.cur = null), 2400);
}
