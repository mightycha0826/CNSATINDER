import { json, type RequestHandler } from '@sveltejs/kit';
import { adminRpc, userFromClaims } from '$lib/server/supabaseAdmin';
import { deliver, vapidKeys, type PushPayload } from '$lib/server/pushSend';
import { bearerToken, jsonObject, positiveId } from '$lib/server/request';

/**
 * POST /api/push   Authorization: Bearer <보낸 사람 access token>
 *   { message_id }         채팅 메시지를 보낸 직후
 *   { reaction_message_id } 채팅 메시지에 공감을 단 직후
 *   { dm_msg_id }          이름 편지를 보내거나 답장한 직후
 *
 *   ① 토큰으로 보낸 사람을 확인 (클라가 주장하는 id 를 믿지 않는다)
 *      getClaims — 서명 키가 비대칭이면 인증 서버에 묻지 않고 여기서 바로 확인한다 (알림이 한 박자 빨라진다, Phase 35).
 *      대칭 키 프로젝트면 알아서 인증 서버에 묻는다 (getUser 와 같다).
 *   ② DB 함수가 "진짜 그 사람이 쓴 글인지 · 받는 사람이 그 대화를 보고 있지 않은지 · 처음인지" 판단하고
 *      받을 기기와 문구를 돌려준다 (채팅: push_payload / 편지: dm_push_payload / 공감: reaction_push_payload)
 *   ③ 받는 사람의 기기마다 암호화해서 보낸다 (lib/server/pushSend). 사라진 기기는 지운다.
 * 응답은 기다리지 않아도 된다 — 알림이 실패해도 글 전송에는 영향이 없다.
 */
/** 요청 본문의 키 → 발송 판단 DB 함수 · 앱 안 알림 모양 */
const KINDS = [
	{ field: 'message_id', rpc: 'push_payload', param: 'p_message', actor: 'p_sender', kind: 'chat' },
	{ field: 'reaction_message_id', rpc: 'reaction_push_payload', param: 'p_message', actor: 'p_actor', kind: 'reaction' },
	{ field: 'dm_msg_id', rpc: 'dm_push_payload', param: 'p_msg', actor: 'p_actor', kind: 'letter' }
] as const;

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!vapidKeys()) return json({ skip: 'not_configured' });

	const token = bearerToken(request);
	const body = await jsonObject(request);
	const kind = KINDS.find((k) => positiveId(body[k.field]));
	if (!token || !kind) return json({ error: 'bad_request' }, { status: 400 });

	const uid = await userFromClaims(token);
	if (!uid) return json({ error: 'unauthorized' }, { status: 401 });

	// 누가 보냈는지는 클라가 아니라 토큰에서 — DB 함수가 "진짜 그 사람의 글·공감인지"를 다시 확인한다
	const p = await adminRpc<PushPayload>(kind.rpc, { [kind.param]: body[kind.field], [kind.actor]: uid });
	if ('skip' in p) return json(p);

	return json(await deliver({ ...p, kind: kind.kind }, platform));
};
