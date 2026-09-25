/**
 * 채팅 색상 — 내 말풍선 색 (설정 화면에서 고른다).
 * 이 기기에만 저장한다 (localStorage). 상대 화면에는 영향이 없고, 서버에도 보내지 않는다.
 * 화면 전체의 --bubble-fill 을 바꾸므로 대화방 · AI 대화가 같이 따라간다.
 * 흰 글씨가 올라가므로 밝은 색은 넣지 않는다. 회색은 다크 모드의 검은 바탕에서도 보이는 밝기로.
 */
export type ChatColor = { id: string; label: string; fill: string };

export const CHAT_COLORS: ChatColor[] = [
	{ id: 'sunset', label: '기본', fill: 'linear-gradient(180deg, #f2603f, #ee4360 55%, #d92868)' },
	{ id: 'berry', label: '베리', fill: 'linear-gradient(180deg, #e8407c, #a93fd6)' },
	{ id: 'purple', label: '보라', fill: 'linear-gradient(180deg, #8b5cf6, #6427d1)' },
	{ id: 'ocean', label: '파랑', fill: 'linear-gradient(180deg, #3b8af6, #2356d6)' },
	{ id: 'mint', label: '초록', fill: 'linear-gradient(180deg, #14b37d, #0b7c55)' },
	{ id: 'graphite', label: '회색', fill: 'linear-gradient(180deg, #5a5a5e, #353538)' }
];
const DEFAULT = CHAT_COLORS[0].id;
const KEY = 'chat-color-v1';

export const CHAT_COLOR = $state({ id: DEFAULT });

function apply(id: string) {
	const c = CHAT_COLORS.find((x) => x.id === id);
	const root = document.documentElement.style;
	// 기본은 app.css 의 값을 그대로 쓴다
	if (!c || c.id === DEFAULT) root.removeProperty('--bubble-fill');
	else root.setProperty('--bubble-fill', c.fill);
}

/** 앱을 켤 때 한 번 — 저장해 둔 색을 입힌다 */
export function loadChatColor() {
	let id = DEFAULT;
	try {
		id = localStorage.getItem(KEY) ?? DEFAULT;
	} catch {
		/* 저장소를 못 쓰는 환경 — 기본 색 */
	}
	if (!CHAT_COLORS.some((c) => c.id === id)) id = DEFAULT;
	CHAT_COLOR.id = id;
	apply(id);
}

export function setChatColor(id: string) {
	if (!CHAT_COLORS.some((c) => c.id === id)) return;
	CHAT_COLOR.id = id;
	apply(id);
	try {
		if (id === DEFAULT) localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, id);
	} catch {
		/* 저장은 못 해도 지금 화면에는 입힌다 */
	}
}
