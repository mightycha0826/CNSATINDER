/**
 * Web Push 전송 — WebCrypto 만으로 구현 (Cloudflare Workers 에서 동작, node 전용 라이브러리 불필요).
 *
 *   · 본문 암호화: RFC 8291 (aes128gcm) — 푸시 서버(구글·애플)도 내용을 읽을 수 없다
 *   · 발신자 인증: RFC 8292 (VAPID) — ES256 JWT
 *
 * 키 형식 (scripts/vapid-keys.mjs 가 만든다)
 *   PUBLIC_VAPID_KEY  : base64url, 비압축 P-256 공개키 65바이트
 *   VAPID_PRIVATE_KEY : base64url, 개인키 d 32바이트
 */

export type PushSub = { endpoint: string; p256dh: string; auth: string };

/**
 * 알려진 브라우저 푸시 서버 주소인가 — DB(save_push_subscription)와 같은 목록.
 * 구글 FCM(크롬·안드로이드·삼성) · 애플(사파리·아이폰) · 모질라(파이어폭스) · 윈도(엣지).
 * 발송 직전에도 한 번 더 본다 — 서버가 학생이 적은 아무 주소로나 요청을 보내지 않게.
 */
const PUSH_HOST = /^(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/;
export function isPushEndpoint(endpoint: string): boolean {
	try {
		const u = new URL(endpoint);
		return u.protocol === 'https:' && !u.username && !u.password && !u.port && PUSH_HOST.test(u.hostname);
	} catch {
		return false;
	}
}
export type Vapid = { publicKey: string; privateKey: string; subject: string };

const enc = new TextEncoder();

export function b64u(bytes: ArrayBuffer | Uint8Array): string {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = '';
	for (const x of b) s += String.fromCharCode(x);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(s: string): Uint8Array<ArrayBuffer> {
	const t = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
	const out = new Uint8Array(new ArrayBuffer(bin.length));
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, len: number) {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

// ── VAPID ────────────────────────────────────────────────────────────
async function vapidKey(v: Vapid) {
	const pub = unb64u(v.publicKey); // 0x04 || x(32) || y(32)
	return crypto.subtle.importKey(
		'jwk',
		{
			kty: 'EC',
			crv: 'P-256',
			x: b64u(pub.slice(1, 33)),
			y: b64u(pub.slice(33, 65)),
			d: v.privateKey,
			ext: true
		},
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
}

/** Authorization 헤더 값. aud 는 푸시 서버의 origin. */
export async function vapidAuth(endpoint: string, v: Vapid, now = Date.now()) {
	const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const claims = b64u(
		enc.encode(
			JSON.stringify({
				aud: new URL(endpoint).origin,
				exp: Math.floor(now / 1000) + 12 * 3600,
				sub: v.subject
			})
		)
	);
	const input = `${header}.${claims}`;
	// WebCrypto ECDSA 서명은 JWT 가 요구하는 r||s (64바이트) 형식 그대로 나온다
	const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(v), enc.encode(input));
	return `vapid t=${input}.${b64u(sig)}, k=${v.publicKey}`;
}

// ── 본문 암호화 (RFC 8291) ───────────────────────────────────────────
export async function encryptPayload(sub: Pick<PushSub, 'p256dh' | 'auth'>, payload: string, salt?: Uint8Array<ArrayBuffer>) {
	const uaPublic = unb64u(sub.p256dh);
	const authSecret = unb64u(sub.auth);
	salt ??= crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));

	// 매번 새 임시 키 — 같은 내용이어도 암호문이 매번 다르다
	const as = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
	const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
	const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
	const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));

	const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
	const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
	const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

	// 레코드 하나 = 본문 || 0x02 (마지막 레코드 구분자)
	const plain = concat(enc.encode(payload), new Uint8Array([2]));
	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));

	// 헤더: salt(16) || rs(4, 빅엔디언) || idlen(1) || keyid(보낸 쪽 공개키 65)
	const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
	return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** 한 기기로 보낸다. 410/404 = 구독이 사라짐(앱 삭제·권한 해제) → 호출자가 지운다. */
export async function sendPush(sub: PushSub, payload: string, v: Vapid, ttlSec = 3600) {
	const body = await encryptPayload(sub, payload);
	const res = await fetch(sub.endpoint, {
		method: 'POST',
		headers: {
			Authorization: await vapidAuth(sub.endpoint, v),
			'Content-Encoding': 'aes128gcm',
			'Content-Type': 'application/octet-stream',
			TTL: String(ttlSec),
			Urgency: 'high'
		},
		body
	});
	return { status: res.status, gone: res.status === 404 || res.status === 410 };
}
