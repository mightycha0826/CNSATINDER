import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import { adminRpc } from './supabaseAdmin';
import { isPushEndpoint, sendPush, type PushSub } from './webpush';

/**
 * 푸시 한 건을 받는 사람의 기기마다 보낸다 — /api/push(학생이 글을 쓴 직후)와 운영자 개인 공지가 같이 쓴다.
 * 서비스워커(static/sw.js)가 읽는 모양: { kind, title, body, room, id, at, url, tag }
 *   kind = 앱이 화면에 떠 있을 때 앱 안 알림을 어떻게 그릴지 · id/at = 늦게 온 알림이 새 알림을 덮지 않게
 * 사라진 기기(404/410)는 지운다. Workers 면 응답을 먼저 돌려주고 발송은 뒤에서 (waitUntil).
 */
export type PushNote = {
	kind: 'chat' | 'reaction' | 'letter' | 'notice';
	title: string;
	body: string;
	room_id?: string;
	id?: number;
	at?: string;
	url?: string;
	tag?: string;
	subs: PushSub[];
};

export function vapidKeys() {
	const v = {
		publicKey: pub.PUBLIC_VAPID_KEY ?? '',
		privateKey: env.VAPID_PRIVATE_KEY ?? '',
		subject: env.VAPID_SUBJECT || 'https://cnsatinder.mightycha0826.workers.dev'
	};
	return v.publicKey && v.privateKey ? v : null;
}

export async function deliver(p: PushNote, platform?: Readonly<Partial<App.Platform>>) {
	const vapid = vapidKeys();
	if (!vapid) return { skip: 'not_configured' };
	// 알려진 푸시 서버로만 보낸다 (DB 도 같은 목록으로 막는다 — 두 겹). 개발 서버는 테스트용 가짜 푸시 서버를 쓴다
	const subs = p.subs.filter((s) => dev || isPushEndpoint(s.endpoint));
	if (!subs.length) return { skip: 'no_device' };

	const work = (async () => {
		const note = JSON.stringify({ kind: p.kind, title: p.title, body: p.body, room: p.room_id, id: p.id, at: p.at, url: p.url, tag: p.tag });
		const results = await Promise.allSettled(subs.map((s) => sendPush(s, note, vapid)));
		const gone = subs.filter((_, i) => {
			const r = results[i];
			return r.status === 'fulfilled' && r.value.gone;
		});
		if (gone.length) await adminRpc('push_prune', { p_endpoints: gone.map((s) => s.endpoint) });
		return results.filter((r) => r.status === 'fulfilled' && r.value.status < 300).length;
	})();

	if (platform?.context?.waitUntil) {
		platform.context.waitUntil(work.catch(() => {}));
		return { queued: subs.length };
	}
	return { sent: await work.catch(() => 0) };
}
