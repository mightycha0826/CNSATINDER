import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 푸시 알림용 VAPID 키 한 쌍을 만든다.
 *
 *   node scripts/vapid-keys.mjs          → .env 에 없으면 추가 (이미 있으면 그대로 둔다)
 *
 * ★ 키를 바꾸면 기존 알림 구독이 전부 무효가 된다 — 한 번 만들고 계속 쓴다.
 * ★ 개인키는 화면에 출력하지 않는다. .env 에서 복사해 Cloudflare 의 Secret 으로 넣는다.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const ENV = root + '.env';

const b64u = (b) => Buffer.from(b).toString('base64url');

const text = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';
if (/^PUBLIC_VAPID_KEY=.+/m.test(text)) {
	console.log('.env 에 이미 VAPID 키가 있습니다. 바꾸지 않습니다.');
	process.exit(0);
}

const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
const priv = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d;

appendFileSync(
	ENV,
	`${text.endsWith('\n') || !text ? '' : '\n'}\n# 푸시 알림 (scripts/vapid-keys.mjs 로 생성 — 바꾸면 기존 구독이 전부 무효)\n` +
		`PUBLIC_VAPID_KEY=${pub}\nVAPID_PRIVATE_KEY=${priv}\nVAPID_SUBJECT=https://cnsatinder.mightycha0826.workers.dev\n`
);
console.log('.env 에 PUBLIC_VAPID_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT 를 추가했습니다.');
console.log('Cloudflare Worker > Settings > Variables and Secrets 에도 같은 세 값을 넣어 주세요.');
