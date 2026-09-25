// Workers AI 에 보낼 대화 모양 — 서버 전용이지만 SvelteKit 모듈을 쓰지 않아 단위 테스트에서 바로 불러온다
export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };
/** wrangler.jsonc 의 "ai" 바인딩 (platform.env.AI) */
export type AiBinding = { run(model: string, input: Record<string, unknown>): Promise<unknown> };
/** 모델 하나 — extra 는 그 모델에만 붙이는 값 (예: Gemma 4 의 생각하기 끄기) */
export type ModelSpec = { id: string; extra?: Record<string, unknown> };

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

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
/** 모델 자체를 못 쓰는 오류 (권한 5018 · 없는 모델 5007 · 폐기) — system 접기로는 안 되니 다음 모델로 */
const MODEL_GONE = /5018|5007|not allowed|deprecat|no such model|not found/i;

/**
 * 모델 여러 개를 차례로 — 지난번에 된 모델(working)부터. 모델마다 그대로 한 번, system 을 못 받으면 지시문을 접어서 한 번 더.
 * 되면 { ok, model, out }, 다 안 되면 { ok: false, errors }.
 */
export async function callModels(
	ai: AiBinding,
	messages: AiMessage[],
	list: ModelSpec[],
	working: string | null,
	params: Record<string, unknown>
): Promise<{ ok: true; model: string; out: unknown } | { ok: false; errors: string[] }> {
	const order = [...list].sort((a, b) => Number(b.id === working) - Number(a.id === working));
	const folded = foldSystem(messages);
	const errors: string[] = [];
	for (const m of order) {
		for (const msgs of folded ? [messages, folded] : [messages]) {
			try {
				return { ok: true, model: m.id, out: await ai.run(m.id, { messages: msgs, ...params, ...m.extra }) };
			} catch (e) {
				errors.push(`${m.id}: ${errText(e)}`);
				if (MODEL_GONE.test(errText(e))) break;
			}
		}
	}
	return { ok: false, errors };
}
