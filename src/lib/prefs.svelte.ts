/**
 * 이 기기 설정 (Phase 43) — 설정 화면에서 고르고 이 기기에만 저장한다 (localStorage 한 키). 서버에는 보내지 않는다.
 *   text       대화 · 편지 글자 크기 → <html data-text> (app.css 가 --chat-fs · --letter-fs · --rule-h 를 바꾼다)
 *   motion     움직임 줄이기 — 기기 설정과 상관없이 → <html data-motion="reduce"> (app.css · lib/motion.ts)
 *   letterFont 편지지 글씨 — 손글씨(나눔펜) / 반듯한 글씨 → <html data-letter-font="plain"> (app.css .letter-paper)
 *   envelope   봉투를 열고 보내는 장면 (lib/letters/stage.ts) — 끄면 곧바로 편지지
 *   enterSend  Enter 로 보내기 (MessageInput) — 끄면 Enter 는 줄바꿈
 *   inApp      앱을 보는 중 위에서 내려오는 알림 띠 (lib/inapp.svelte.ts)
 *   haptics    진동 (lib/haptics.ts, 안드로이드만)
 * 화면 모드 · 테마 색상은 예전부터 따로 저장한다 (theme.svelte.ts · themeColor.svelte.ts).
 * <html> 에 입히는 셋은 첫 화면이 번쩍이지 않게 app.html 의 짧은 스크립트가 같은 키를 먼저 읽어 입힌다.
 */
type TextSize = 'sm' | 'md' | 'lg' | 'xl';
type LetterFont = 'hand' | 'plain';

export const TEXT_SIZES: { id: TextSize; label: string }[] = [
	{ id: 'sm', label: '작게' },
	{ id: 'md', label: '보통' },
	{ id: 'lg', label: '크게' },
	{ id: 'xl', label: '아주 크게' }
];
export const LETTER_FONTS: { id: LetterFont; label: string }[] = [
	{ id: 'hand', label: '손글씨' },
	{ id: 'plain', label: '반듯한 글씨' }
];

type Prefs = {
	text: TextSize;
	motion: boolean;
	letterFont: LetterFont;
	envelope: boolean;
	enterSend: boolean;
	inApp: boolean;
	haptics: boolean;
};
const DEFAULTS: Prefs = { text: 'md', motion: false, letterFont: 'hand', envelope: true, enterSend: true, inApp: true, haptics: true };
const KEY = 'prefs-v1'; // app.html 과 같은 키
const FLAGS = ['motion', 'envelope', 'enterSend', 'inApp', 'haptics'] as const;

export const PREFS = $state<Prefs>({ ...DEFAULTS });

/** 저장된 값 중 아는 것만 — 모르는 키 · 잘못된 값은 기본으로 */
function clean(raw: unknown): Prefs {
	const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const p = { ...DEFAULTS };
	if (TEXT_SIZES.some((t) => t.id === o.text)) p.text = o.text as TextSize;
	if (LETTER_FONTS.some((f) => f.id === o.letterFont)) p.letterFont = o.letterFont as LetterFont;
	for (const k of FLAGS) if (typeof o[k] === 'boolean') p[k] = o[k];
	return p;
}

function apply(p: Prefs) {
	const d = document.documentElement.dataset;
	if (p.text === 'md') delete d.text;
	else d.text = p.text;
	if (p.motion) d.motion = 'reduce';
	else delete d.motion;
	if (p.letterFont === 'plain') d.letterFont = 'plain';
	else delete d.letterFont;
}

function save() {
	// 기본과 다른 것만 적는다 — 다 기본이면 키를 지운다
	const diff = Object.fromEntries(Object.entries(PREFS).filter(([k, v]) => DEFAULTS[k as keyof Prefs] !== v));
	try {
		if (Object.keys(diff).length) localStorage.setItem(KEY, JSON.stringify(diff));
		else localStorage.removeItem(KEY);
	} catch {
		/* 저장은 못 해도 지금 화면에는 입힌다 */
	}
}

/** 앱을 켤 때 한 번 */
export function loadPrefs() {
	let raw: unknown = null;
	try {
		raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
	} catch {
		/* 저장소를 못 쓰는 환경 · 깨진 값 — 기본 */
	}
	Object.assign(PREFS, clean(raw));
	apply(PREFS);
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
	PREFS[key] = clean({ ...PREFS, [key]: value })[key];
	apply(PREFS);
	save();
}

/** 이 기기 설정 초기화 — 모두 기본으로 */
export function resetPrefs() {
	Object.assign(PREFS, DEFAULTS);
	apply(PREFS);
	save();
}

/** 이 기기에서 진동을 쓸 수 있나 (아이폰에는 Vibration API 가 없다) */
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
