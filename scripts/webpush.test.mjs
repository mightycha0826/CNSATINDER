import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Web Push 암호화·서명 테스트 — "받는 브라우저" 역할을 직접 해서 복호화해 본다.
 *
 *   npm run test:push
 *
 * 실제 푸시 서버(구글·애플)로는 보내지 않는다. 암호화(RFC 8291)와 VAPID 서명(RFC 8292)이
 * 규격대로면 브라우저는 그대로 풀 수 있다 — 여기서 같은 절차로 풀리는지 확인한다.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}scripts/.webpush.tmp.mjs`;
writeFileSync(out, stripTypeScriptTypes(readFileSync(`${root}src/lib/server/webpush.ts`, 'utf8')));

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
};
const enc = new TextEncoder();
const dec = new TextDecoder();

try {
	const W = await import(pathToFileURL(out).href);
	const { b64u, unb64u } = W;

	// 받는 쪽(브라우저) 키 — pushManager.subscribe() 가 만드는 것과 같은 종류
	const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
	const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
	const authSecret = crypto.getRandomValues(new Uint8Array(16));
	const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: b64u(uaPub), auth: b64u(authSecret) };

	async function hkdf(salt, ikm, info, len) {
		const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
		return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
	}
	/** RFC 8291 복호화 — 브라우저가 하는 일 */
	async function decrypt(body) {
		const salt = body.slice(0, 16);
		const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
		const idlen = body[20];
		const asPub = body.slice(21, 21 + idlen);
		const cipher = body.slice(21 + idlen);
		const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
		const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
		const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPub, ...asPub]);
		const ikm = await hkdf(authSecret, ecdh, info, 32);
		const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
		const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
		const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
		const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
		return { rs, idlen, delim: plain[plain.length - 1], text: dec.decode(plain.slice(0, -1)) };
	}

	console.log('\n[1] 본문 암호화 (RFC 8291)');
	const payload = JSON.stringify({ title: '촉촉한수달', body: '안녕하세요! 한글과 이모지 😀 도 그대로', room: 'r1' });
	const body = await W.encryptPayload(sub, payload);
	const d = await decrypt(body);
	check('★ 받는 쪽 키로 복호화하면 원문이 그대로 나온다', d.text === payload, d.text);
	check('레코드 크기 4096, 키 길이 65, 마지막 레코드 표시(0x02)', d.rs === 4096 && d.idlen === 65 && d.delim === 2);
	check('암호문에 원문이 보이지 않는다', !dec.decode(body).includes('촉촉한수달'));
	const body2 = await W.encryptPayload(sub, payload);
	check('같은 내용도 매번 다른 암호문 (임시 키·salt)', b64u(body) !== b64u(body2));

	let tampered = false;
	try {
		const t = new Uint8Array(body);
		t[t.length - 5] ^= 1;
		await decrypt(t);
	} catch {
		tampered = true;
	}
	check('중간에 한 비트라도 바뀌면 복호화 실패 (변조 탐지)', tampered);

	let wrongKey = false;
	try {
		const other = crypto.getRandomValues(new Uint8Array(16));
		const b = await W.encryptPayload({ p256dh: sub.p256dh, auth: b64u(other) }, payload);
		await decrypt(b);
	} catch {
		wrongKey = true;
	}
	check('다른 기기의 auth 비밀로 만든 암호문은 이 기기에서 풀리지 않는다', wrongKey);

	console.log('\n[2] VAPID 서명 (RFC 8292)');
	const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
	const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
	const vapid = {
		publicKey: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)),
		privateKey: jwk.d,
		subject: 'mailto:admin@example.com'
	};
	const now = Date.now();
	const auth = await W.vapidAuth(sub.endpoint, vapid, now);
	const m = auth.match(/^vapid t=([^,]+), k=(.+)$/);
	check('헤더 형식: vapid t=<JWT>, k=<공개키>', !!m && m[2] === vapid.publicKey);
	const [h, c, s] = m[1].split('.');
	const claims = JSON.parse(dec.decode(unb64u(c)));
	check('aud = 푸시 서버 origin', claims.aud === 'https://fcm.googleapis.com');
	check('exp 는 24시간 이내', claims.exp > now / 1000 && claims.exp <= now / 1000 + 24 * 3600);
	check('sub = 연락처', claims.sub === vapid.subject);
	check('alg = ES256', JSON.parse(dec.decode(unb64u(h))).alg === 'ES256');
	const ok = await crypto.subtle.verify(
		{ name: 'ECDSA', hash: 'SHA-256' },
		kp.publicKey,
		unb64u(s),
		enc.encode(`${h}.${c}`)
	);
	check('★ 공개키로 서명이 검증된다 (푸시 서버가 하는 검사)', ok);
	check('서명은 r||s 64바이트', unb64u(s).length === 64);
} catch (e) {
	fail++;
	console.error(e);
} finally {
	rmSync(out, { force: true });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
