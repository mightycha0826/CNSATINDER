import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import { adminRpc } from './supabaseAdmin';
import { sendDelivery, type PushNote } from './pushDelivery';

export type PushPayload = { skip: string } | Omit<PushNote, 'kind'>;
export function vapidKeys() {
	const v = { publicKey: pub.PUBLIC_VAPID_KEY ?? '', privateKey: env.VAPID_PRIVATE_KEY ?? '', subject: env.VAPID_SUBJECT || 'https://cnsatinder.mightycha0826.workers.dev' };
	return v.publicKey && v.privateKey ? v : null;
}
export async function deliver(p: PushNote, platform?: Readonly<Partial<App.Platform>>) {
	const work = sendDelivery(p, adminRpc, vapidKeys(), dev);
	if (platform?.context?.waitUntil) {
		platform.context.waitUntil(work.catch(() => { console.error('[push] delivery failed'); }));
		return { queued: p.subs.length };
	}
	return work;
}
export async function notifyPersonalNotice(id: number, platform?: Readonly<Partial<App.Platform>>) {
	const payload = await adminRpc<PushPayload>('personal_notice_push', { p_id: id }).catch(() => ({ skip: 'error' }));
	if (!('skip' in payload)) await deliver({ ...payload, kind: 'notice' }, platform).catch(() => null);
}
