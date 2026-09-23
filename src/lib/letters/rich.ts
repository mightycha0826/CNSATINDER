/**
 * 편지 서식 — 본문은 순수 텍스트 그대로(body), 서식은 옆에 범위 목록으로(fmt) 둔다.
 *
 *   fmt = { m: [[시작, 끝, 종류], ...], a: [[줄 번호, 'center' | 'right'], ...] }
 *   위치는 글자(code point) 단위 — 서버 char_length 와 같은 셈. 끝은 포함하지 않는다.
 *
 * ★ 보안: 화면에는 HTML 을 그대로 넣지 않는다. 종류는 아래 표에 있는 것만 인정하고, 색·크기 값은
 *   fmt 에서 오는 게 아니라 이 파일의 표에서 꺼낸다. 서버(private.letter_fmt_ok)도 같은 목록만 받는다.
 */
export type Align = 'left' | 'center' | 'right';
export type LetterFmt = { m?: [number, number, string][]; a?: [number, 'center' | 'right'][] };

/** 형광펜 — 반투명이라 다크 모드에서도 글자가 읽힌다 */
export const HIGHLIGHT = {
	yellow: 'rgba(255, 213, 0, 0.45)',
	green: 'rgba(52, 199, 89, 0.35)',
	blue: 'rgba(0, 144, 255, 0.3)',
	pink: 'rgba(255, 64, 129, 0.3)',
	orange: 'rgba(255, 140, 0, 0.38)'
} as const;

/** 글자색 — 밝은/어두운 배경 모두에서 읽히는 중간 톤 */
export const COLOR = {
	red: '#e5484d',
	orange: '#f76b15',
	green: '#30a46c',
	blue: '#0090ff',
	purple: '#8e4ec6',
	gray: '#8b8d98'
} as const;

export const SIZE = { sm: '0.85em', lg: '1.25em', xl: '1.6em' } as const;

export const HIGHLIGHT_LABEL: Record<keyof typeof HIGHLIGHT, string> = {
	yellow: '노랑', green: '초록', blue: '파랑', pink: '분홍', orange: '주황'
};
export const COLOR_LABEL: Record<keyof typeof COLOR, string> = {
	red: '빨강', orange: '주황', green: '초록', blue: '파랑', purple: '보라', gray: '회색'
};
export const SIZE_LABEL: Record<keyof typeof SIZE | 'md', string> = { sm: '작게', md: '보통', lg: '크게', xl: '아주 크게' };

const KEY = /^(b|i|u|s|h:(yellow|green|blue|pink|orange)|c:(red|orange|green|blue|purple|gray)|z:(sm|lg|xl))$/;
const nameOf = <T extends Record<string, string>>(table: T, value: unknown) =>
	(Object.keys(table) as (keyof T)[]).find((k) => table[k] === value);

// ── 편집기(Tiptap) 문서 → body + fmt ─────────────────────────────────
type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type?: string; text?: string; marks?: Mark[]; attrs?: Record<string, unknown>; content?: Node[] };

function markKeys(marks: Mark[] = []): string[] {
	const out: string[] = [];
	for (const m of marks) {
		if (m.type === 'bold') out.push('b');
		else if (m.type === 'italic') out.push('i');
		else if (m.type === 'underline') out.push('u');
		else if (m.type === 'strike') out.push('s');
		else if (m.type === 'highlight') {
			const n = nameOf(HIGHLIGHT, m.attrs?.color);
			if (n) out.push(`h:${n}`);
		} else if (m.type === 'textStyle') {
			const c = nameOf(COLOR, m.attrs?.color);
			if (c) out.push(`c:${c}`);
			const z = nameOf(SIZE, m.attrs?.fontSize);
			if (z) out.push(`z:${z}`);
		}
	}
	return out;
}

/**
 * 문단 = 한 줄. 이어진 같은 서식은 한 범위로 합친다.
 * 앞뒤 공백·빈 줄은 잘라 내고(서버 btrim 과 어긋나지 않게) 범위·줄 번호를 그만큼 당긴다.
 */
export function fromDoc(doc: Node): { body: string; fmt: LetterFmt | null } {
	const chars: string[] = [];
	const ranges: [number, number, string][] = [];
	const open = new Map<string, [number, number]>();
	const aligns: [number, 'center' | 'right'][] = [];
	const closeAll = () => {
		for (const [k, r] of open) ranges.push([r[0], r[1], k]);
		open.clear();
	};

	(doc.content ?? []).forEach((p, line) => {
		if (line > 0) {
			closeAll();
			chars.push('\n');
		}
		const al = p.attrs?.textAlign;
		if (al === 'center' || al === 'right') aligns.push([line, al]);
		for (const n of p.content ?? []) {
			if (n.type !== 'text' || !n.text) continue;
			const start = chars.length;
			chars.push(...Array.from(n.text));
			const end = chars.length;
			const keys = new Set(markKeys(n.marks));
			for (const [k, r] of open) {
				if (!keys.has(k)) {
					ranges.push([r[0], r[1], k]);
					open.delete(k);
				}
			}
			for (const k of keys) {
				const r = open.get(k);
				if (r && r[1] === start) r[1] = end;
				else open.set(k, [start, end]);
			}
		}
	});
	closeAll();

	let lead = 0;
	while (lead < chars.length && /\s/.test(chars[lead])) lead++;
	let tail = chars.length;
	while (tail > lead && /\s/.test(chars[tail - 1])) tail--;
	const kept = chars.slice(lead, tail);
	const body = kept.join('');
	const n = kept.length;
	const dropLines = chars.slice(0, lead).filter((c) => c === '\n').length;
	const lines = kept.filter((c) => c === '\n').length + 1;

	const m = ranges
		.map(([s, e, k]) => [Math.max(0, s - lead), Math.min(n, e - lead), k] as [number, number, string])
		.filter(([s, e]) => s < e)
		.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
	const a = aligns
		.map(([l, al]) => [l - dropLines, al] as [number, 'center' | 'right'])
		.filter(([l]) => l >= 0 && l < lines);

	const fmt: LetterFmt = {};
	if (m.length) fmt.m = m;
	if (a.length) fmt.a = a;
	return { body, fmt: m.length || a.length ? fmt : null };
}

// ── body + fmt → 화면에 그릴 줄 목록 ─────────────────────────────────
export type Run = { text: string; cls: string; style: string };
export type Line = { align: Align; runs: Run[] };

/** fmt 가 이상해도(잘린 미리보기, 옛 데이터) 모르는 종류·범위 밖은 조용히 버린다 */
export function toLines(body: string, fmt: LetterFmt | null | undefined): Line[] {
	const cps = Array.from(body);
	const n = cps.length;
	const marks = (Array.isArray(fmt?.m) ? fmt.m : [])
		.filter((x) => Array.isArray(x) && Number.isInteger(x[0]) && Number.isInteger(x[1]) && KEY.test(String(x[2])))
		.map(([s, e, k]) => [Math.max(0, s), Math.min(n, e), k] as [number, number, string])
		.filter(([s, e]) => s < e);
	const align = new Map<number, Align>();
	for (const x of Array.isArray(fmt?.a) ? fmt.a : []) {
		if (Array.isArray(x) && Number.isInteger(x[0]) && (x[1] === 'center' || x[1] === 'right')) align.set(x[0], x[1]);
	}

	const cuts = new Set([0, n]);
	for (const [s, e] of marks) cuts.add(s).add(e);
	cps.forEach((c, i) => c === '\n' && cuts.add(i).add(i + 1));
	const points = [...cuts].sort((x, y) => x - y);

	const lines: Line[] = [{ align: align.get(0) ?? 'left', runs: [] }];
	for (let j = 0; j + 1 < points.length; j++) {
		const [a, b] = [points[j], points[j + 1]];
		const text = cps.slice(a, b).join('');
		if (text === '\n') {
			lines.push({ align: align.get(lines.length) ?? 'left', runs: [] });
			continue;
		}
		const keys = marks.filter(([s, e]) => s <= a && e >= b).map(([, , k]) => k);
		lines.at(-1)!.runs.push(styleOf(text, keys));
	}
	return lines;
}

function styleOf(text: string, keys: string[]): Run {
	const cls: string[] = [];
	const style: string[] = [];
	const deco: string[] = [];
	for (const k of keys) {
		if (k === 'b') cls.push('rt-b');
		else if (k === 'i') cls.push('rt-i');
		else if (k === 'u') deco.push('underline');
		else if (k === 's') deco.push('line-through');
		else if (k.startsWith('h:')) style.push(`background-color:${HIGHLIGHT[k.slice(2) as keyof typeof HIGHLIGHT]}`);
		else if (k.startsWith('c:')) style.push(`color:${COLOR[k.slice(2) as keyof typeof COLOR]}`);
		else if (k.startsWith('z:')) style.push(`font-size:${SIZE[k.slice(2) as keyof typeof SIZE]}`);
	}
	if (deco.length) style.push(`text-decoration-line:${[...new Set(deco)].join(' ')}`);
	return { text, cls: cls.join(' '), style: style.join(';') };
}
