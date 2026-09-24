import { json, type RequestHandler } from '@sveltejs/kit';
import { AiUnavailable, runAi } from '$lib/server/ai';
import { chatPrompt, cleanHistory, fakeReply, tidyReply } from '$lib/server/aiChat';
import { adminRpc, userFromBearer } from '$lib/server/supabaseAdmin';

/**
 * POST /api/ai-chat   Authorization: Bearer <access token>
 *   { chat_id, messages: [{ role: 'user' | 'assistant', content }] }   마지막은 사용자의 새 말
 *
 * ① 토큰으로 사용자 확인 ② DB(ai_chat_turn)가 "그 사람의 대화인지 · 시간 · 턴 한도 · 신상정보"를 보고 턴을 센다
 * ③ Workers AI 로 답을 받아 돌려준다. 대화 내용은 어디에도 저장하지 않는다.
 */
type Turn = { status: string; code?: string; turns?: number; max_turns?: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: RequestHandler = async ({ request, platform }) => {
	const uid = await userFromBearer(request).catch(() => null);
	if (!uid) return json({ error: 'unauthorized' }, { status: 401 });
	const body = ((await request.json().catch(() => null)) ?? {}) as { chat_id?: unknown; messages?: unknown };
	const turns = cleanHistory(body.messages);
	if (typeof body.chat_id !== 'string' || !UUID.test(body.chat_id) || !turns) {
		return json({ error: 'bad_request' }, { status: 400 });
	}

	const t = await adminRpc<Turn>('ai_chat_turn', { p_chat: body.chat_id, p_user: uid, p_text: turns.at(-1)!.content });
	if (t.status !== 'ok') return json(t);

	try {
		const reply = await runAi(platform?.env?.AI, chatPrompt(turns), { maxTokens: 220, temperature: 0.7, fake: fakeReply });
		return json({ status: 'ok', reply: tidyReply(reply), turns: t.turns, max_turns: t.max_turns });
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ status: 'ai_unavailable' }, { status: 503 });
		throw e;
	}
};
