import type { AiMessage } from './aiFold';

/**
 * AI 대화 상대 — 매칭을 기다리는 동안. 프롬프트와 대화 기록 정리.
 * 기록은 클라가 들고 있다가 매번 보낸다 (DB 에 대화 내용을 남기지 않기 위해). 그래서 서버가 길이·모양을 다시 자른다.
 */
const SYSTEM = `너는 학교 익명 채팅 앱 CNSATINDER 의 "AI 대화 친구"다. 상대는 고등학생이고, 사람 대화 상대를 찾는 동안 너와 이야기한다.
지킬 것:
- 너는 AI다. 사람이나 학생인 척하지 않는다. 누구냐고 물으면 AI라고 분명히 말한다.
- 이름·학번·반·전화번호·SNS·사는 곳 같은 신상을 묻지도 말하지도 않는다. 상대가 말하려 하면 이 앱에서는 신상을 나누지 않는다고 부드럽게 알려 준다.
- 연애·성적인 이야기, 폭력·위험한 행동, 술·담배, 혐오 표현은 하지 않는다. 그쪽으로 가면 자연스럽게 다른 이야기로 돌린다.
- 상대가 죽고 싶다거나 자해를 이야기하면 진지하고 따뜻하게 들어 주고, 믿을 수 있는 어른(선생님·보호자)과 이야기해 보라고 권하고, 자살예방 상담전화 109(24시간)와 청소년상담 1388을 알려 준다.
- 숙제나 시험 답을 대신 써 주지 않는다. 대신 같이 생각해 볼 수는 있다.
- 친근한 존댓말로, 한 번에 1~3문장으로 짧게 답한다. 가끔 질문을 하나 던져 대화를 이어 간다.`;

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** 클라가 보낸 기록을 믿지 않고 다시 자른다 — 최근 12개, 한 말에 500자, 마지막은 반드시 사용자 */
export function cleanHistory(raw: unknown): ChatTurn[] | null {
	if (!Array.isArray(raw)) return null;
	const turns = raw
		.filter((m): m is ChatTurn => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
		.map((m) => ({ role: m.role, content: m.content.trim().slice(0, 500) }))
		.filter((m) => m.content)
		.slice(-12);
	return turns.length && turns.at(-1)!.role === 'user' ? turns : null;
}

/**
 * 모델에 보낼 대화 — Gemma 의 대화 틀은 "사용자 → AI → 사용자 …" 로 번갈아 가고 사용자로 시작해야 한다.
 *  · 화면 첫 줄은 AI 의 인사(assistant)라서, 앞쪽의 AI 말은 지시문 뒤에 "먼저 이렇게 인사했다"로 옮긴다
 *  · 같은 쪽 말이 이어지면(보내기 실패 뒤 다시 보내기 등) 한 말로 합친다
 */
export function chatPrompt(turns: ChatTurn[]): AiMessage[] {
	const lead: string[] = [];
	let i = 0;
	while (i < turns.length && turns[i].role === 'assistant') lead.push(turns[i++].content);
	const merged: ChatTurn[] = [];
	for (const t of turns.slice(i)) {
		const last = merged.at(-1);
		if (last && last.role === t.role) last.content += `\n${t.content}`;
		else merged.push({ ...t });
	}
	const system = lead.length ? `${SYSTEM}\n\n(대화는 네가 먼저 이렇게 인사하며 시작했다: "${lead.join(' ')}")` : SYSTEM;
	return [{ role: 'system', content: system }, ...merged];
}

/** AI 답도 한 번 더 — 전화번호 · @아이디 모양이 섞여 나오면 그 부분을 가린다 */
export function tidyReply(text: string): string {
	return text
		.replace(/01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}/g, '(번호 가림)')
		.replace(/@[A-Za-z0-9_.]{3,}/g, '(아이디 가림)')
		.slice(0, 600);
}

export const fakeReply = (msgs: AiMessage[]) => `AI 답: ${msgs.at(-1)?.content ?? ''}`;
