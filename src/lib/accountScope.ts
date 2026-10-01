/** 사용자별 메모리와 비동기 응답의 수명. 토큰은 같은 계정으로 다시 로그인해도 새로 발급된다. */
let accountId: string | null = null;
let generation = 0;
const resets = new Set<() => void>();

export function onAccountChange(reset: () => void): () => void {
	resets.add(reset);
	return () => resets.delete(reset);
}

export function changeAccount(id: string | null): boolean {
	if (id === accountId) return false;
	accountId = id;
	generation++;
	for (const reset of resets) reset();
	return true;
}

export const currentAccountId = () => accountId;
export const accountToken = () => generation;
export const accountIsCurrent = (token: number) => token === generation;
