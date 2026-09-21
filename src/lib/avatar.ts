/**
 * 익명 아바타 — alias 해시 → 단색 원 + 첫 글자.
 * 방마다 alias 가 바뀌므로 색도 매번 바뀐다. 그 자체가 "매번 새로운 사람"이라는 신호.
 */
export function avatarColor(alias: string) {
	let h = 0;
	for (const ch of alias) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
	return `hsl(${h % 360} 55% 48%)`;
}

export function avatarInitial(alias: string) {
	return [...alias][0] ?? '?';
}
