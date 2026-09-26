/**
 * 테마 색상 — 앱 전체의 포인트 색 (설정 화면에서 고른다).
 * 로고 · 채운 버튼 · 링크/아이콘 색 · 내 말풍선 · 연결 화면 등 app.css 의 포인트 색 토큰을 한꺼번에 바꾼다
 *   --g-orange/--g-coral/--g-pink(→ --brand), --accent-fill, --accent, --bubble-fill
 * 이 기기에만 저장한다 (localStorage). 상대 화면에는 영향이 없고, 서버에도 보내지 않는다.
 * 흰 글씨가 올라가므로 밝은 색은 넣지 않는다. 회색은 다크 모드의 검은 바탕에서도 보이는 밝기로.
 * 없어진 색(예전의 '베리')을 저장해 둔 기기는 기본 색으로 돌아간다.
 * 예전 이름이 "채팅 색상"이라 저장 키는 그대로 둔다 (이미 고른 색이 유지되게).
 */
export type ThemeColor = {
	id: string;
	label: string;
	/** 그라데이션 세 점 (위/왼쪽 → 아래/오른쪽). 한 가지 색이면 셋 다 같게 */
	stops: [string, string, string];
	/** 글자 · 아이콘용 단색 — 흰 바탕과 검은 바탕 모두에서 읽히는 중간 톤 (기본은 app.css 의 라이트/다크 값) */
	accent: string | null;
};

export const THEME_COLORS: ThemeColor[] = [
	// 파랑만 한 가지 색, 나머지는 서로 겹치지 않는 두세 가지 색 그라데이션
	{ id: 'sunset', label: '기본', stops: ['#f2603f', '#ee4360', '#d92868'], accent: null }, // 주황 → 핑크
	{ id: 'purple', label: '보라', stops: ['#7059f5', '#9b57e6', '#c04fd8'], accent: '#8b5cf6' }, // 보라 → 자주
	{ id: 'ocean', label: '파랑', stops: ['#3b8af6', '#3b8af6', '#3b8af6'], accent: '#3b8af6' }, // 단색
	{ id: 'mint', label: '초록', stops: ['#3aa757', '#14a37f', '#0e8f9c'], accent: '#14a37f' }, // 초록 → 청록
	{ id: 'graphite', label: '회색', stops: ['#7a7a80', '#4a4a4f', '#2c2c2e'], accent: '#8e8e93' } // 밝은 회색 → 먹색
];
const DEFAULT = THEME_COLORS[0].id;
const KEY = 'chat-color-v1';

/** 세로 그라데이션 (말풍선 · 색 동그라미) */
export const fillOf = (c: ThemeColor) => `linear-gradient(180deg, ${c.stops[0]}, ${c.stops[1]} 55%, ${c.stops[2]})`;

export const THEME_COLOR = $state({ id: DEFAULT });

const PROPS = ['--g-orange', '--g-coral', '--g-pink', '--bubble-fill', '--accent-fill', '--accent'];

function apply(id: string) {
	const c = THEME_COLORS.find((x) => x.id === id);
	const root = document.documentElement.style;
	// 기본은 app.css 의 값을 그대로 쓴다 (다크 모드의 밝은 --accent 도 그대로)
	if (!c || c.id === DEFAULT) {
		for (const p of PROPS) root.removeProperty(p);
		return;
	}
	const [a, b, z] = c.stops;
	root.setProperty('--g-orange', a);
	root.setProperty('--g-coral', b);
	root.setProperty('--g-pink', z);
	root.setProperty('--bubble-fill', fillOf(c));
	root.setProperty('--accent-fill', `linear-gradient(110deg, ${a}, ${b} 55%, ${z})`);
	if (c.accent) root.setProperty('--accent', c.accent);
}

/** 앱을 켤 때 한 번 — 저장해 둔 색을 입힌다 */
export function loadThemeColor() {
	let id = DEFAULT;
	try {
		id = localStorage.getItem(KEY) ?? DEFAULT;
	} catch {
		/* 저장소를 못 쓰는 환경 — 기본 색 */
	}
	if (!THEME_COLORS.some((c) => c.id === id)) id = DEFAULT;
	THEME_COLOR.id = id;
	apply(id);
}

export function setThemeColor(id: string) {
	if (!THEME_COLORS.some((c) => c.id === id)) return;
	THEME_COLOR.id = id;
	apply(id);
	try {
		if (id === DEFAULT) localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, id);
	} catch {
		/* 저장은 못 해도 지금 화면에는 입힌다 */
	}
}
