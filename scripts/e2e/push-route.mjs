import { ROOT, CHROME, OUT } from './_env.mjs';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
// /api/push 에 { reaction_message_id } — 토큰 확인 → reaction_push_payload → 받는 기기로 암호화 발송
const PORT = 5195, SB = 'http://127.0.0.1:54398', PUSH = 'http://127.0.0.1:54397';
const b64u = (b) => Buffer.from(b).toString('base64url');
const vk = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const VPUB = b64u(await crypto.subtle.exportKey('raw', vk.publicKey)), VPRIV = (await crypto.subtle.exportKey('jwk', vk.privateKey)).d;
const sk = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const sub = { endpoint: `${PUSH}/dev1`, p256dh: b64u(await crypto.subtle.exportKey('raw', sk.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
const USER = '3f1c2b4a-1111-4222-8333-944455556666';
const rpcCalls = [], pushes = [];
http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
	const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (req.url.startsWith('/auth/v1/user')) return req.headers.authorization === 'Bearer good-token' ? send(200, { id: USER, aud: 'authenticated', role: 'authenticated' }) : send(401, { msg: 'bad jwt' });
	const fn = req.url.match(/rpc\/([a-z_]+)/)?.[1]; rpcCalls.push([fn, JSON.parse(b || '{}')]);
	if (fn === 'reaction_push_payload') return send(200, { title: '새벽수달', body: '❤️ 공감: 실리카겔 좋아하세요?', room_id: 'room-1', subs: [sub] });
	send(200, null);
}); }).listen(54398);
http.createServer((req, res) => { const ch = []; req.on('data', (c) => ch.push(c)); req.on('end', () => { pushes.push({ url: req.url, headers: req.headers, bytes: Buffer.concat(ch).length }); res.writeHead(201); res.end(); }); }).listen(54397);
const env = { ...process.env, SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'service-key-xxxxxxxxxxxx', PUBLIC_SUPABASE_URL: SB, PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest', PUBLIC_VAPID_KEY: VPUB, VAPID_PRIVATE_KEY: VPRIV, VAPID_SUBJECT: 'mailto:test@example.com' };
const vite = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; vite.stdout.on('data', (d) => (out += d));
for (let i = 0; i < 60 && !out.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const post = (body, token = 'good-token') => fetch(`http://localhost:${PORT}/api/push`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, origin: `http://localhost:${PORT}` }, body: JSON.stringify(body) });
try {
	const r = await post({ reaction_message_id: 42 });
	const j = await r.json();
	check('200 · 발송', r.status === 200 && (j.sent === 1 || j.queued === 1), JSON.stringify(j));
	const c = rpcCalls.find((x) => x[0] === 'reaction_push_payload');
	check('★ 공감한 사람은 토큰에서 (클라 주장 아님)', c && c[1].p_message === 42 && c[1].p_actor === USER, JSON.stringify(c));
	await new Promise((r) => setTimeout(r, 300));
	check('받는 기기로 암호화된 알림 1건', pushes.length === 1 && pushes[0].url === '/dev1' && pushes[0].headers['content-encoding'] === 'aes128gcm' && pushes[0].bytes > 100, JSON.stringify(pushes.map((p) => p.headers['content-encoding'])));
	check('VAPID 서명 헤더', /^vapid t=.+, k=/.test(pushes[0]?.headers.authorization ?? ''), pushes[0]?.headers.authorization);
	check('잘못된 토큰 → 401', (await post({ reaction_message_id: 42 }, 'bad')).status === 401);
	check('잘못된 id → 400', (await post({ reaction_message_id: 'x' })).status === 400);
	const before = rpcCalls.length;
	await post({ message_id: 7 });
	check('기존 채팅 메시지 알림 경로는 그대로 (push_payload)', rpcCalls.slice(before).some((x) => x[0] === 'push_payload'));
} finally { vite.kill(); try { execSync("pkill -f 'vite dev --port 5195'"); } catch {} }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
