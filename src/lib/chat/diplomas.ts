/**
 * 학교 디플로마 (Phase 35) — 연장할 때 적는 디플로마는 이 목록에서만 고른다 (서버 private.diplomas 와 같은 목록).
 * 검색: 글자 일부("물리") · 초성("ㅅㅎ" → 수학) · 영문 대소문자 무시("it").
 */
const DIPLOMAS = ['수학', '물리학', '화학', '생명과학', '공학', 'IT', '인문학', '국제어문', '사회과학', '경제경영', '예술', '체육', 'IB'] as const;

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
/** 한글 음절 → 초성, 나머지는 그대로 */
const chosung = (s: string) =>
	Array.from(s)
		.map((ch) => {
			const c = ch.charCodeAt(0) - 0xac00;
			return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
		})
		.join('');
const isCho = (s: string) => /^[ㄱ-ㅎ]+$/.test(s);

export function searchDiplomas(q: string): string[] {
	const k = q.trim().toLowerCase().replace(/\s+/g, '');
	if (!k) return [...DIPLOMAS];
	return DIPLOMAS.filter((d) => {
		const n = d.toLowerCase();
		return n.includes(k) || (isCho(k) && chosung(n).includes(k));
	});
}

export const isDiploma = (v: string) => (DIPLOMAS as readonly string[]).includes(v.trim());
