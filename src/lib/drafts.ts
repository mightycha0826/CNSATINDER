import { accountIsCurrent, accountToken, currentAccountId, onAccountChange } from './accountScope';

const PREFIX = 'landy-draft-v1:';
const TTL = 24 * 60 * 60 * 1000;
const memory = new Map<string, string>();
const keyOf = (key: string) => currentAccountId() ? `${PREFIX}${currentAccountId()}:${encodeURIComponent(key)}` : null;
function remove(key: string) {
	memory.delete(key);
	try { localStorage.removeItem(key); } catch { /* 메모리 초안은 계속 사용한다 */ }
}
function prune(keepAccount = currentAccountId()) {
	const keys = new Set(memory.keys());
	try { for (let i = 0; i < localStorage.length; i++) keys.add(localStorage.key(i)!); } catch { /* SSR/저장소 차단 */ }
	for (const key of keys) {
		if (!key.startsWith(PREFIX)) continue;
		try {
			const raw = memory.get(key) ?? localStorage.getItem(key);
			const draft = raw ? JSON.parse(raw) : null;
			if (!keepAccount || !key.startsWith(`${PREFIX}${keepAccount}:`) || !draft || draft.expires <= Date.now()) remove(key);
		} catch { remove(key); }
	}
}
onAccountChange(() => prune());

/** 기기 안에만 24시간 보관한다. 계정 전환/로그아웃에서 이전 계정 초안을 제거한다. */
export function readDraft<T>(key: string, valid: (value: unknown) => value is T): T | null {
	prune();
	const id = keyOf(key);
	if (!id) return null;
	try {
		const raw = memory.get(id) ?? localStorage.getItem(id);
		const draft = raw ? JSON.parse(raw) : null;
		return draft?.expires > Date.now() && valid(draft.value) ? draft.value : null;
	} catch { return null; }
}
export function writeDraft(key: string, value: unknown, token = accountToken()) {
	if (!accountIsCurrent(token)) return;
	const id = keyOf(key);
	if (!id) return;
	const raw = JSON.stringify({ expires: Date.now() + TTL, value });
	if (raw.length > 50_000) return;
	memory.set(id, raw);
	try { localStorage.setItem(id, raw); } catch { /* 이 탭에서는 메모리로 복원 */ }
}
export function clearDraft(key: string, token = accountToken()) {
	const id = keyOf(key);
	if (id && accountIsCurrent(token)) remove(id);
}
