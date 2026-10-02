import { json, type RequestHandler } from '@sveltejs/kit';
import { AiUnavailable, runAi } from '$lib/server/ai';
import { chatPrompt, cleanHistory, conversationText, fakeReply, tidyReply } from '$lib/server/aiChat';
import { adminRpc, userFromBearer } from '$lib/server/supabaseAdmin';
import { jsonObject } from '$lib/server/request';

/**
 * POST /api/ai-chat   Authorization: Bearer <access token>   — 대화 봇 (Phase 43, lib/bot)
 *   { chat_id, messages: [{ role: 'user' | 'assistant', content }] }   끝은 사용자의 새 말 (연달아 보낸 여러 말일 수 있다)
 *
 * ① 토큰으로 사용자 확인 ② DB(ai_chat_turn)가 "그 사람의 대화인지 · 시간 · 턴 한도 · 신상정보(모델에 전달하는 기록 전부)"를 보고 턴을 센다
 * ③ Workers AI 로 답을 받아 돌려준다. 대화 내용은 어디에도 저장하지 않는다.
 */
type Turn = { status: string; code?: string; turns?: number; max_turns?: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: RequestHandler = async ({ request, platform }) => {
	const uid = await userFromBearer(request).catch(() => null);
	if (!uid) return json({ error: 'unauthorized' }, { status: 401 });
	const body = await jsonObject(request);
	const turns = cleanHistory(body.messages);
	if (typeof body.chat_id !== 'string' || !UUID.test(body.chat_id) || !turns) {
		return json({ error: 'bad_request' }, { status: 400 });
	}

	const t = await adminRpc<Turn>('ai_chat_turn', { p_chat: body.chat_id, p_user: uid, p_text: conversationText(turns) });
	if (t.status !== 'ok') return json(t);

	try {
		const reply = await runAi(platform?.env?.AI, chatPrompt(turns), { maxTokens: 160, temperature: 0.8, fake: fakeReply });
		return json({ status: 'ok', reply: tidyReply(reply), turns: t.turns, max_turns: t.max_turns });
	} catch (e) {
		if (e instanceof AiUnavailable) {
			console.error('[ai-chat] Workers AI 실패:', e.message); // Cloudflare 대시보드 > Workers > 로그에서 보인다
			return json({ status: 'ai_unavailable' }, { status: 503 });
		}
		throw e;
	}
};
