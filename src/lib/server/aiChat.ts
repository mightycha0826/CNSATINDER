import type { AiMessage } from './aiFold';

/**
 * 대화 봇 (Phase 43 — 예전 AI 대화 상대) — 찾기 20초가 지나도 상대가 없을 때. 프롬프트와 대화 기록 정리.
 * 기록은 클라가 들고 있다가 매번 보낸다 (DB 에 대화 내용을 남기지 않기 위해). 그래서 서버가 길이·모양을 다시 자른다.
 *
 * 말투는 익명 채팅의 또래처럼 짧고 편하게, 하지만 ★ 사람인 척은 하지 않는다 — 화면에 "봇" 표시가 있고,
 * 물으면 봇이라고 답한다 (이용자가 학생이고, AI 기본법이 생성형 AI 서비스임을 알리게 한다).
 */
const SYSTEM = `너는 학교 익명 채팅 앱 랜디(Landy)의 "대화 봇"이다. 새 대화 상대를 찾다가 아직 못 만난 고등학생과, 사람을 찾을 때까지 가볍게 이야기한다. 화면에는 네 이름 옆에 "봇" 표시가 있다.
말투 — 익명 채팅에서 처음 만난 또래처럼:
- 아주 짧게. 한 번에 한두 문장, 많아야 세 줄. 줄을 바꾸면 말풍선이 나뉜다.
- 편한 존댓말(~요)로 시작하고, 상대가 반말을 쓰면 반말로 맞춘다. ㅋㅋ · ㅎㅎ · ㅠㅠ 는 자연스럽게 쓰고 이모지는 거의 안 쓴다.
- 맞장구치고, 네 생각이나 취향도 조금 말하고, 가끔 되묻는다. 매번 질문으로 끝내지 않는다.
- 상담원이나 비서처럼 말하지 않는다("도와드릴게요", "좋은 질문이에요" 같은 말). 목록 · 굵은 글씨 · 따옴표 같은 꾸밈을 쓰지 않는다.
지킬 것:
- 봇이냐, AI냐, 사람이냐고 물으면 거짓말하지 않고 봇이라고 가볍게 말한 뒤 대화를 이어 간다. 스스로 사람이나 학생이라고 말하지 않는다.
- 너의 학년 · 반 · 나이 · 학교 · 사는 곳 같은 신상을 지어내지 않는다.
- 상대의 이름 · 학번 · 반 · 전화번호 · SNS · 사는 곳을 묻지 않는다. 상대가 말하려 하면 여기서는 신상을 나누지 않는다고 부드럽게 넘긴다.
- 연애 · 성적인 이야기, 만나자는 약속, 폭력 · 위험한 행동, 술 · 담배, 혐오 표현은 하지 않는다. 그쪽으로 가면 자연스럽게 다른 얘기로 돌린다.
- 상대가 죽고 싶다거나 자해를 이야기하면 장난 없이 진지하고 따뜻하게 들어 주고, 믿을 수 있는 어른(선생님 · 보호자)과 이야기해 보라고 권하고, 자살예방 상담전화 109(24시간)와 청소년상담 1388을 알려 준다.
- 숙제나 시험 답을 대신 써 주지 않는다.`;

type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** 클라가 보낸 기록을 믿지 않고 다시 자른다 — 최근 20개(봇은 말풍선을 나눠 보내서), 한 말에 500자, 마지막은 반드시 사용자 */
export function cleanHistory(raw: unknown): ChatTurn[] | null {
	if (!Array.isArray(raw) || raw.length > 20) return null;
	const turns = raw
		.filter((m): m is ChatTurn => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
		.map((m) => ({ role: m.role, content: m.content.trim().slice(0, 500) }))
		.filter((m) => m.content)
		.slice(-20);
	return turns.length && turns.at(-1)!.role === 'user' ? turns : null;
}

/**
 * 모델에 보낼 대화 — Gemma 의 대화 틀은 "사용자 → AI → 사용자 …" 로 번갈아 가고 사용자로 시작해야 한다.
 *  · 대화는 봇의 인사(assistant)로 시작하므로, 앞쪽의 봇 말은 지시문 뒤에 "네가 먼저 한 말"로 옮긴다
 *  · 같은 쪽 말이 이어지면(봇의 말풍선 여러 개 · 사용자가 연달아 보낸 말) 한 말로 합친다
 */
export function chatPrompt(turns: ChatTurn[]): AiMessage[] {
	let i = 0;
	// 첫 assistant도 이용자가 지정한 기록이다. 시스템 지시문으로 올리지 않고 제외한다.
	while (i < turns.length && turns[i].role === 'assistant') i++;
	const merged: ChatTurn[] = [];
	for (const t of turns.slice(i)) {
		const last = merged.at(-1);
		if (last && last.role === t.role) last.content += `\n${t.content}`;
		else merged.push({ ...t });
	}
	return [{ role: 'system', content: SYSTEM }, ...merged];
}

/**
 * 규칙 필터(ai_chat_turn)에 넣을 글 — 모델에 전달하는 클라이언트 기록 전부.
 * assistant 역할도 클라이언트가 지정하므로 함께 검사한다. cleanHistory의 20개 × 500자와 구분 줄 19개,
 * 최대 10019자를 DB에서도 받는다. 필터만 짧게 잘라 모델에 보내는 뒷부분을 놓치지 않는다.
 */
export function conversationText(turns: ChatTurn[]): string {
	return turns.map((t) => t.content).join('\n');
}

/** AI 답도 한 번 더 — 전화번호 · @아이디 모양이 섞여 나오면 그 부분을 가린다 */
export function tidyReply(text: string): string {
	return text
		.replace(/01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}/g, '(번호 가림)')
		.replace(/@[A-Za-z0-9_.]{3,}/g, '(아이디 가림)')
		.slice(0, 600);
}

export const fakeReply = (msgs: AiMessage[]) => `봇 답: ${msgs.at(-1)?.content ?? ''}`;
