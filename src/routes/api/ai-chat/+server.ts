import { json, type RequestHandler } from '@sveltejs/kit';
import { AiUnavailable, runAi } from '$lib/server/ai';
import { chatPrompt, cleanHistory, conversationText, fakeReply, tidyReply } from '$lib/server/aiChat';
import { adminRpc, userFromBearer } from '$lib/server/supabaseAdmin';
import { jsonObject } from '$lib/server/request';
import { rateLimit } from '$lib/server/apiRate';

/**
 * POST /api/ai-chat   Authorization: Bearer <access token>   — 대화 봇 (Phase 43, lib/bot)
 *   { chat_id, request_id, messages: [{ role: 'user' | 'assistant', content }] }   끝은 사용자의 새 말
 *
 * 토큰·호출 제한을 확인하고 DB가 자격·시간·턴·입력을 승인한다. 같은 요청의 응답은 15분 캐시하고 입력 원문은 저장하지 않는다.
 */
type Turn = { status: string; code?: string; turns?: number; max_turns?: number; lease?: string; cached?: boolean; reply?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: RequestHandler = async ({ request, platform }) => {
	const uid = await userFromBearer(request).catch(() => null);
	if (!uid) return json({ error: 'unauthorized' }, { status: 401 });
	const limited = await rateLimit(uid, 'ai-chat');
	if (limited) return limited;
	const body = await jsonObject(request);
	const turns = cleanHistory(body.messages);
	if (typeof body.chat_id !== 'string' || !UUID.test(body.chat_id) || typeof body.request_id !== 'string' || !UUID.test(body.request_id) || !turns) {
		return json({ error: 'bad_request' }, { status: 400 });
	}

	const t = await adminRpc<Turn>('ai_chat_claim', { p_chat: body.chat_id, p_user: uid, p_request: body.request_id, p_text: conversationText(turns) });
	if (t.status !== 'ok' || t.cached) return json(t);
	if (!t.lease) return json({ status: 'ai_unavailable' }, { status: 503 });

	try {
		const reply = await runAi(platform?.env?.AI, chatPrompt(turns), { maxTokens: 160, temperature: 0.8, fake: fakeReply });
		const clean = tidyReply(reply);
		const saved = await adminRpc<boolean>('ai_chat_finish', { p_chat: body.chat_id, p_request: body.request_id, p_lease: t.lease, p_reply: clean });
		if (!saved) return json({ status: 'pending' }, { status: 202 });
		return json({ status: 'ok', reply: clean, turns: t.turns, max_turns: t.max_turns });
	} catch (e) {
		await adminRpc('ai_chat_finish', { p_chat: body.chat_id, p_request: body.request_id, p_lease: t.lease, p_reply: null }).catch(() => {
			console.error('[ai-chat] turn completion failed');
		});
		if (e instanceof AiUnavailable) {
			console.error('[ai-chat] Workers AI unavailable');
			return json({ status: 'ai_unavailable' }, { status: 503 });
		}
		throw e;
	}
};
