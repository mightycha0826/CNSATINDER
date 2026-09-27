import { json, type RequestHandler } from '@sveltejs/kit';
import { adminRpc, supabaseAdmin } from '$lib/server/supabaseAdmin';
import { deliver, vapidKeys, type PushNote } from '$lib/server/pushSend';

/**
 * POST /api/push   Authorization: Bearer <보낸 사람 access token>
 *   { message_id }         채팅 메시지를 보낸 직후
 *   { letter_comment_id }  익명편지에 댓글을 단 직후
 *   { reaction_message_id } 채팅 메시지에 공감을 단 직후
 *   { dm_msg_id }          이름 편지를 보내거나 답장한 직후
 *
 *   ① 토큰으로 보낸 사람을 확인 (클라가 주장하는 id 를 믿지 않는다)
 *      getClaims — 서명 키가 비대칭이면 인증 서버에 묻지 않고 여기서 바로 확인한다 (알림이 한 박자 빨라진다, Phase 35).
 *      대칭 키 프로젝트면 알아서 인증 서버에 묻는다 (getUser 와 같다).
 *   ② DB 함수가 "진짜 그 사람이 쓴 글인지 · 받는 사람이 그 대화를 보고 있지 않은지 · 처음인지" 판단하고
 *      받을 기기와 문구를 돌려준다 (채팅: push_payload / 편지: letter_notify · dm_push_payload / 공감: reaction_push_payload)
 *   ③ 받는 사람의 기기마다 암호화해서 보낸다 (lib/server/pushSend). 사라진 기기는 지운다.
 * 응답은 기다리지 않아도 된다 — 알림이 실패해도 글 전송에는 영향이 없다.
 */
type Payload = { skip: string } | Omit<PushNote, 'kind'>;

const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** 요청 본문의 키 → 발송 판단 DB 함수 · 앱 안 알림 모양 */
const KINDS = [
	{ field: 'message_id', rpc: 'push_payload', param: 'p_message', actor: 'p_sender', kind: 'chat' },
	{ field: 'letter_comment_id', rpc: 'letter_notify', param: 'p_comment', actor: 'p_actor', kind: 'letter' },
	{ field: 'reaction_message_id', rpc: 'reaction_push_payload', param: 'p_message', actor: 'p_actor', kind: 'reaction' },
	{ field: 'dm_msg_id', rpc: 'dm_push_payload', param: 'p_msg', actor: 'p_actor', kind: 'letter' }
] as const;

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!vapidKeys()) return json({ skip: 'not_configured' });

	const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
	const kind = KINDS.find((k) => isId(body[k.field]));
	if (!token || !kind) return json({ error: 'bad_request' }, { status: 400 });

	const { data: claims, error } = await supabaseAdmin().auth.getClaims(token);
	const uid = !error && claims?.claims.role === 'authenticated' ? claims.claims.sub : null;
	if (!uid) return json({ error: 'unauthorized' }, { status: 401 });

	// 누가 보냈는지는 클라가 아니라 토큰에서 — DB 함수가 "진짜 그 사람의 글·공감인지"를 다시 확인한다
	const p = await adminRpc<Payload>(kind.rpc, { [kind.param]: body[kind.field], [kind.actor]: uid });
	if ('skip' in p) return json(p);

	return json(await deliver({ ...p, kind: kind.kind }, platform));
};
