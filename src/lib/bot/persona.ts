/**
 * 대화 봇 (Phase 43) — 말하는 속도 · 첫마디 · 말풍선 나누기. 화면(BotChat)이 쓰고, 단위 테스트가 바로 불러온다
 * (SvelteKit · Svelte 모듈을 쓰지 않는다).
 *
 * 사람과 대화하는 것처럼: 읽고 → 잠깐 생각하고 → "입력 중…" → 짧은 말풍선 한두 개. 첫 인사와 조용할 때 던지는 질문은
 * 정해 둔 말이라 AI 를 부르지 않는다 (Workers AI 무료 몫 · 턴을 아낀다).
 */

/** 찾기를 시작하고 이만큼 지나도 상대가 없으면 봇이 온다 */
export const BOT_AFTER_MS = 20_000;
/** 내가 말을 멈추고 이만큼 조용하면 봇이 답한다 — 연달아 보낸 말은 한 번에 읽고 답한다 */
export const REPLY_AFTER_MS: [number, number] = [1300, 2000];
/** 봇이 인사한 뒤 내가 이만큼 아무 말도 없으면 봇이 먼저 가벼운 질문을 하나 */
export const NUDGE_AFTER_MS = 9000;

// 서버의 익명 이름 낱말(schema.sql public.random_alias)과 같다 — 봇도 같은 모양의 이름
const HEAD = ['말랑', '포근', '새벽', '바삭', '조용', '느긋', '반짝', '시원', '담백', '뭉게', '노란', '파란', '초록', '보라', '하얀', '까만', '붉은', '은은'];
const TAIL = ['복숭아', '고양이', '달팽이', '구름', '수달', '펭귄', '자몽', '토끼', '라떼', '북극곰', '해달', '민트', '오리', '참새', '여우', '고래', '두더지', '감자'];

export const pick = <T>(list: readonly T[], r = Math.random()): T => list[Math.floor(r * list.length) % list.length];
export const rand = (min: number, max: number, r = Math.random()) => min + (max - min) * r;

/** 봇의 익명 이름 — 내 이름과는 겹치지 않게 */
export function randomAlias(avoid?: string | null): string {
	for (;;) {
		const a = pick(HEAD) + pick(TAIL);
		if (a !== avoid) return a;
	}
}

/** 첫 인사 — 말풍선 한두 개 */
export const GREETINGS: readonly string[][] = [
	['안녕하세요'],
	['안녕하세요 ㅎㅎ'],
	['ㅎㅇㅎㅇ'],
	['안녕하세요!', '반가워요'],
	['하이요'],
	['안녕하세요 ㅎㅎ', '뭐 하고 있었어요?']
];

/** 인사하고 조용하면 — 신상을 묻지 않는 가벼운 질문만 (chat/Starters.svelte 와 같은 약속) */
export const NUDGES: readonly string[] = [
	'요즘 뭐 듣는 노래 있어요?',
	'오늘 급식 뭐 나왔어요?',
	'주말엔 보통 뭐 해요?',
	'요즘 빠져 있는 거 있어요?',
	'오늘 하루 어땠어요',
	'민초 좋아해요? ㅋㅋ',
	'요즘 재밌게 본 거 있어요?'
];

/** 턴을 다 썼을 때 — 봇이 먼저 인사하고 나간다 */
export const GOODBYES: readonly string[][] = [
	['아 저 이제 가 봐야 할 것 같아요 ㅠㅠ', '얘기 재밌었어요!'],
	['앗 저 곧 나가야 돼요', '좋은 사람 만나요 ㅎㅎ']
];

/** 글자 수만큼 치는 시간 — 폰으로 치는 속도쯤 (짧아도 0.9초, 길어도 6초) */
export function typeMs(text: string, r = Math.random()): number {
	return Math.round(Math.min(6000, Math.max(900, 450 + [...text].length * rand(90, 140, r))));
}

/**
 * AI 답 → 말풍선들. 줄마다 하나, 많아야 3개 (넘치는 줄은 마지막 말풍선에 붙인다).
 * 모델이 가끔 붙이는 "봇:" 머리 · 따옴표 · 목록 기호 · 굵은 글씨 표시는 떼어 낸다.
 */
export function splitReply(text: string): string[] {
	const lines = text
		.replace(/\*\*/g, '')
		.split(/\n+/)
		.map((l) =>
			l
				.trim()
				.replace(/^(봇|나|AI)\s*[:：]\s*/i, '')
				.replace(/^[-*•]\s+/, '')
				.replace(/^["“'‘](.*)["”'’]$/, '$1')
				.trim()
		)
		.filter(Boolean);
	if (lines.length <= 3) return lines;
	return [...lines.slice(0, 2), lines.slice(2).join(' ')];
}
