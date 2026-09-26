import { json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import { adminRpc, supabaseAdmin } from '$lib/server/supabaseAdmin';
import { isPushEndpoint, sendPush, type PushSub } from '$lib/server/webpush';

/**
 * POST /api/push   Authorization: Bearer <보낸 사람 access token>
 *   { message_id }         채팅 메시지를 보낸 직후
 *   { letter_comment_id }  익명편지에 댓글을 단 직후
 *   { reaction_message_id } 채팅 메시지에 공감을 단 직후
 *   { dm_msg_id }          이름 편지를 보내거나 답장한 직후
 *
 *   ① 토큰으로 보낸 사람을 확인 (클라가 주장하는 id 를 믿지 않는다)
 *   ② DB 함수가 "진짜 그 사람이 쓴 글인지 · 받는 사람이 앱을 안 보고 있는지 · 처음인지" 판단하고
 *      받을 기기와 문구를 돌려준다 (채팅: push_payload / 편지: letter_notify / 공감: reaction_push_payload)
 *   ③ 받는 사람의 기기마다 암호화해서 보낸다. 사라진 기기는 지운다.
 * 응답은 기다리지 않아도 된다 — 알림이 실패해도 글 전송에는 영향이 없다.
 */
type Payload =
	| { skip: string }
	| { title: string; body: string; room_id?: string; url?: string; tag?: string; subs: PushSub[] };

const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** 요청 본문의 키 → 발송 판단 DB 함수 */
const KINDS = [
	{ field: 'message_id', rpc: 'push_payload', param: 'p_message', actor: 'p_sender' },
	{ field: 'letter_comment_id', rpc: 'letter_notify', param: 'p_comment', actor: 'p_actor' },
	{ field: 'reaction_message_id', rpc: 'reaction_push_payload', param: 'p_message', actor: 'p_actor' },
	{ field: 'dm_msg_id', rpc: 'dm_push_payload', param: 'p_msg', actor: 'p_actor' }
] as const;

export const POST: RequestHandler = async ({ request, platform }) => {
	const vapid = {
		publicKey: pub.PUBLIC_VAPID_KEY ?? '',
		privateKey: env.VAPID_PRIVATE_KEY ?? '',
		subject: env.VAPID_SUBJECT || 'https://cnsatinder.mightycha0826.workers.dev'
	};
	if (!vapid.publicKey || !vapid.privateKey) return json({ skip: 'not_configured' });

	const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
	const kind = KINDS.find((k) => isId(body[k.field]));
	if (!token || !kind) return json({ error: 'bad_request' }, { status: 400 });

	const { data: who } = await supabaseAdmin().auth.getUser(token);
	if (!who.user) return json({ error: 'unauthorized' }, { status: 401 });

	// 누가 보냈는지는 클라가 아니라 토큰에서 — DB 함수가 "진짜 그 사람의 글·공감인지"를 다시 확인한다
	const p = await adminRpc<Payload>(kind.rpc, { [kind.param]: body[kind.field], [kind.actor]: who.user.id });
	if ('skip' in p) return json(p);

	// 알려진 푸시 서버로만 보낸다 (DB 도 같은 목록으로 막는다 — 두 겹). 개발 서버는 테스트용 가짜 푸시 서버를 쓴다
	p.subs = p.subs.filter((s) => dev || isPushEndpoint(s.endpoint));
	if (!p.subs.length) return json({ skip: 'no_device' });

	const work = (async () => {
		// 서비스워커(static/sw.js)가 읽는 모양 — room 이 있으면 채팅방으로, url 이 있으면 그 주소로
		const note = JSON.stringify({ title: p.title, body: p.body, room: p.room_id, url: p.url, tag: p.tag });
		const results = await Promise.allSettled(p.subs.map((s) => sendPush(s, note, vapid)));
		const gone = p.subs.filter((_, i) => {
			const r = results[i];
			return r.status === 'fulfilled' && r.value.gone;
		});
		if (gone.length) await adminRpc('push_prune', { p_endpoints: gone.map((s) => s.endpoint) });
		return results.filter((r) => r.status === 'fulfilled' && r.value.status < 300).length;
	})();

	// Workers: 응답을 먼저 돌려주고 발송은 뒤에서 마저 한다
	if (platform?.context?.waitUntil) {
		platform.context.waitUntil(work.catch(() => {}));
		return json({ queued: p.subs.length });
	}
	return json({ sent: await work.catch(() => 0) });
};
