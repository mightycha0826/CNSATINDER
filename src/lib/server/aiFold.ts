// Workers AI 에 보낼 대화 모양 — 서버 전용이지만 SvelteKit 모듈을 쓰지 않아 단위 테스트에서 바로 불러온다
export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Gemma 는 대화 틀에 system 역할이 따로 없다 — 모델이 system 을 거절하면 지시문을 첫 사용자 말 앞에 붙여 한 번 더 보낸다.
 * (system 이 없으면 그대로)
 */
export function foldSystem(messages: AiMessage[]): AiMessage[] | null {
	const sys = messages.filter((m) => m.role === 'system').map((m) => m.content);
	if (!sys.length) return null;
	const rest = messages.filter((m) => m.role !== 'system');
	const i = rest.findIndex((m) => m.role === 'user');
	if (i < 0) return [{ role: 'user', content: sys.join('\n\n') }, ...rest];
	return rest.map((m, j) => (j === i ? { role: 'user', content: `${sys.join('\n\n')}\n\n---\n\n${m.content}` } : m));
}
