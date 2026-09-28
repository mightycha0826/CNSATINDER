import { S } from '$lib/state.svelte';
import type { LetterFmt } from './rich';

/**
 * 편지 자동 초안 (docs/UX-GUIDELINES.md G5.5) — 쓰던 편지를 이 기기에 잠깐 둔다.
 * 뒤로 갔다 다시 들어와도 · 앱이 꺼졌다 켜져도 이어 쓴다. 떠날 때 묻지 않는 대신이다 (G5.6).
 *
 *  · 계정별 · 대상별 — 새 편지는 받는 사람(`to:<id>`), 답장은 그 편지(`re:<id>`)
 *  · 24시간이 지나면 버린다
 *  · 보내면 그 초안을, 로그아웃하면 전부 지운다 (같은 기기의 다음 계정에 보이면 안 된다, G14.4)
 * 서버에는 가지 않는다 (요청 예산 G13). localStorage 가 막힌 브라우저(사생활 보호 모드)에서는 조용히 아무 일도 안 한다.
 */
export type Draft = { body: string; fmt: LetterFmt | null; nick: string; at: number };

const PREFIX = 'letter-draft-v1:';
const TTL = 24 * 3600_000;

const keyOf = (scope: string) => {
	const uid = S.session?.user.id;
	return uid ? `${PREFIX}${uid}:${scope}` : null;
};

export function loadDraft(scope: string): Draft | null {
	const k = keyOf(scope);
	if (!k) return null;
	try {
		const raw = localStorage.getItem(k);
		if (!raw) return null;
		const d = JSON.parse(raw) as Draft;
		if (typeof d?.body !== 'string' || !(Date.now() - d.at < TTL)) {
			localStorage.removeItem(k);
			return null;
		}
		return { body: d.body, fmt: d.fmt ?? null, nick: typeof d.nick === 'string' ? d.nick : '', at: d.at };
	} catch {
		return null;
	}
}

/** 본문이 비었으면 지운다 */
export function saveDraft(scope: string, d: Omit<Draft, 'at'>) {
	const k = keyOf(scope);
	if (!k) return;
	try {
		if (!d.body.trim()) localStorage.removeItem(k);
		else localStorage.setItem(k, JSON.stringify({ ...d, at: Date.now() }));
	} catch {
		/* 저장 공간이 막혔다 — 초안 없이 쓴다 */
	}
}

export function dropDraft(scope: string) {
	const k = keyOf(scope);
	if (!k) return;
	try {
		localStorage.removeItem(k);
	} catch {
		/* 막힘 */
	}
}

/** 로그아웃 — 이 기기의 모든 편지 초안 */
export function clearDrafts() {
	try {
		for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
	} catch {
		/* 막힘 */
	}
}
