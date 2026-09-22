import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import { adminRpc, supabaseAdmin } from '$lib/server/supabaseAdmin';
import { sendPush, type PushSub } from '$lib/server/webpush';

/**
 * POST /api/push  { message_id }   Authorization: Bearer <보낸 사람 access token>
 *
 * 메시지를 보낸 앱이 저장에 성공한 직후 부른다.
 *   ① 토큰으로 보낸 사람을 확인 (클라가 주장하는 id 를 믿지 않는다)
 *   ② push_payload() 가 "진짜 그 사람이 보낸 메시지인지 · 받는 사람이 앱을 안 보고 있는지 · 처음인지" 판단
 *   ③ 받는 사람의 기기마다 암호화해서 보낸다. 사라진 기기는 지운다.
 * 응답은 기다리지 않아도 된다 — 알림이 실패해도 메시지 전송에는 영향이 없다.
 */
type Payload =
	| { skip: string }
	| { title: string; body: string; room_id: string; subs: PushSub[] };

export const POST: RequestHandler = async ({ request, platform }) => {
	const vapid = {
		publicKey: pub.PUBLIC_VAPID_KEY ?? '',
		privateKey: env.VAPID_PRIVATE_KEY ?? '',
		subject: env.VAPID_SUBJECT || 'https://cnsatinder.mightycha0826.workers.dev'
	};
	if (!vapid.publicKey || !vapid.privateKey) return json({ skip: 'not_configured' });

	const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	const { message_id } = (await request.json().catch(() => ({}))) as { message_id?: unknown };
	if (!token || typeof message_id !== 'number' || !Number.isSafeInteger(message_id)) {
		return json({ error: 'bad_request' }, { status: 400 });
	}

	const { data: who } = await supabaseAdmin().auth.getUser(token);
	if (!who.user) return json({ error: 'unauthorized' }, { status: 401 });

	const p = await adminRpc<Payload>('push_payload', { p_message: message_id, p_sender: who.user.id });
	if ('skip' in p) return json(p);

	const work = (async () => {
		const note = JSON.stringify({ title: p.title, body: p.body, room: p.room_id });
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
