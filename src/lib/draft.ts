import { S } from '$lib/state.svelte';

/**
 * 자동 초안 (docs/UX-GUIDELINES.md G5.5) — 쓰던 긴 글(편지 · 프로필 소개)을 이 기기에 잠깐 둔다.
 * 뒤로 갔다 다시 들어와도 · 앱이 꺼졌다 켜져도 이어 쓴다. 떠날 때 묻지 않는 대신이다 (G5.6).
 *
 *  · 계정별 — 열쇠에 사용자 id 가 들어간다. 로그인 전에는 아무것도 저장하지 않는다
 *  · 24시간이 지나면 버린다
 *  · 보내거나 저장하면 그 초안을, 로그아웃하면 전부 지운다 (같은 기기의 다음 계정에 보이면 안 된다, G14.4)
 * 서버에는 가지 않는다 (요청 예산 G13). localStorage 가 막힌 브라우저(사생활 보호 모드)에서는 조용히 아무 일도 안 한다.
 *
 *   const letters = draftStore('letter', isLetter, (d) => !d.body.trim());
 *   letters.load('to:<id>') · letters.save('to:<id>', d) · letters.drop('to:<id>')
 */
const PREFIX = 'draft-v1:';
const TTL = 24 * 3600_000;

export type DraftStore<T> = {
	/** 없거나 · 24시간이 지났거나 · 모양이 이상하면 null (그런 것은 지운다) */
	load(scope: string): T | null;
	/** empty(d) 면 지운다 */
	save(scope: string, d: T): void;
	drop(scope: string): void;
};

export function draftStore<T>(name: string, valid: (x: unknown) => x is T, empty: (d: T) => boolean): DraftStore<T> {
	const keyOf = (scope: string) => {
		const uid = S.session?.user.id;
		return uid ? `${PREFIX}${uid}:${name}:${scope}` : null;
	};
	const drop = (scope: string) => {
		const k = keyOf(scope);
		if (!k) return;
		try {
			localStorage.removeItem(k);
		} catch {
			/* 막힘 */
		}
	};
	return {
		load(scope) {
			const k = keyOf(scope);
			if (!k) return null;
			try {
				const raw = localStorage.getItem(k);
				if (!raw) return null;
				const { at, d } = JSON.parse(raw) as { at?: number; d?: unknown };
				if (typeof at === 'number' && Date.now() - at < TTL && valid(d)) return d;
				localStorage.removeItem(k);
			} catch {
				/* 막힘 · 깨진 값 */
			}
			return null;
		},
		save(scope, d) {
			const k = keyOf(scope);
			if (!k) return;
			if (empty(d)) return drop(scope);
			try {
				localStorage.setItem(k, JSON.stringify({ at: Date.now(), d }));
			} catch {
				/* 저장 공간이 막혔다 — 초안 없이 쓴다 */
			}
		},
		drop
	};
}

/** 로그아웃 — 이 기기의 모든 초안 (옛 편지 초안 열쇠 letter-draft-v1: 도 함께) */
export function clearDrafts() {
	try {
		for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k.startsWith('letter-draft-v1:')) localStorage.removeItem(k);
	} catch {
		/* 막힘 */
	}
}
