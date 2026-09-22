/**
 * "방금 · 3분 · 2시간 · 어제 · 5일 · 9월 3일" — 인스타그램식 짧은 상대 시간.
 * now 는 서버 시계 기준(클라 시각 + skew)으로 넘긴다.
 */
export function ago(iso: string, now: number): string {
	const t = Date.parse(iso);
	const s = Math.max(0, Math.floor((now - t) / 1000));
	if (s < 60) return '방금';
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}분`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}시간`;
	const d = Math.floor(h / 24);
	if (d === 1) return '어제';
	if (d < 7) return `${d}일`;
	return new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

/** 도배 제한 대기 시간 → "3분 뒤" / "2시간 뒤" */
export function waitText(ms: number): string {
	const m = Math.ceil(ms / 60_000);
	if (m < 60) return `${m}분 뒤`;
	return `${Math.ceil(m / 60)}시간 뒤`;
}
