/** 실제 달력 날짜를 확인하고 한국 시각 자정을 UTC로 바꾼다. */
export function exportDay(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const utc = new Date(value + 'T00:00:00Z');
	if (!Number.isFinite(+utc) || utc.toISOString().slice(0, 10) !== value) return null;
	return new Date(+utc - 9 * 3600_000);
}
