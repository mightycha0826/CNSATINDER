import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * 운영자 세션 — HMAC 서명 쿠키.
 *
 * 형식: `<user_id>.<만료 epoch초>.<서명>`
 * 서명만으로는 권한을 주지 않는다. hooks.server.ts 가 매 요청마다 private.staff 를 다시 확인하므로
 * 운영진 명단에서 지우면 쿠키가 살아 있어도 즉시 차단된다.
 *
 * Web Crypto 만 사용 — Cloudflare Workers 에서도 그대로 동작한다.
 */
export const ADMIN_COOKIE = 'simbun_admin';
const TTL_SEC = 8 * 60 * 60;

const enc = new TextEncoder();

async function hmacKey() {
	const secret = env.ADMIN_SESSION_SECRET ?? '';
	if (secret.length < 32) throw new Error('ADMIN_SESSION_SECRET(32자 이상)를 설정해 주세요.');
	return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify'
	]);
}

function b64url(buf: ArrayBuffer) {
	let s = '';
	for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
	const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
	const out = new Uint8Array(new ArrayBuffer(bin.length));
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export async function issueSession(cookies: Cookies, userId: string, secure: boolean) {
	const payload = `${userId}.${Math.floor(Date.now() / 1000) + TTL_SEC}`;
	const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload));
	cookies.set(ADMIN_COOKIE, `${payload}.${b64url(sig)}`, {
		path: '/admin',
		httpOnly: true,
		sameSite: 'strict',
		secure,
		maxAge: TTL_SEC
	});
}

export function clearSession(cookies: Cookies) {
	cookies.delete(ADMIN_COOKIE, { path: '/admin' });
}

/** 서명과 만료를 검증하고 user id 를 돌려준다. 실패하면 null. */
export async function readSession(cookies: Cookies): Promise<string | null> {
	const raw = cookies.get(ADMIN_COOKIE);
	if (!raw) return null;
	const parts = raw.split('.');
	if (parts.length !== 3) return null;
	const [uid, exp, sig] = parts;
	if (!/^[0-9a-f-]{36}$/i.test(uid) || !/^\d+$/.test(exp)) return null;
	if (Number(exp) < Date.now() / 1000) return null;
	try {
		// verify 는 상수 시간 비교
		const ok = await crypto.subtle.verify(
			'HMAC',
			await hmacKey(),
			unb64url(sig),
			enc.encode(`${uid}.${exp}`)
		);
		return ok ? uid : null;
	} catch {
		return null;
	}
}
