import { ROOT, CHROME, OUT } from './_env.mjs';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

/** 운영자 화면 5곳에 "(학번 이름)"이 붙는지 — 가짜 Supabase(RPC) 서버 + 서명 쿠키로 실제 SSR 화면을 띄운다 */
const SP = OUT;
const ROLE = process.env.ROLE ?? 'admin';
const SECRET = 'e2e-secret-'.padEnd(48, 'z');
const SB = 'http://127.0.0.1:54399';
const PORT = 5198;
const STAFF = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROOM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const t = new Date().toISOString();
const labelCalls = [];

const RPC = {
	admin_staff_role: () => ROLE,
	admin_student_labels: (a) => {
		labelCalls.push(a.p_users);
		if (ROLE !== 'admin') throw { status: 400, body: { message: 'admin_only' } };
		return { [A]: '29999 홍길동', [B]: '19998' };
	},
	admin_find_users: () => [A, B].map((id, i) => ({ id, nickname: ['푸른고래', '작은별'][i], status: 'active', suspended_until: null, strikes: 0, verified: true, onboarded: true, created_at: t, online: false, last_seen: null, staff_role: null, reports_received: 0 })),
	admin_user: () => ({ profile: { id: A, nickname: '푸른고래', bio: '', interests: [], mbti: null, gender: 'm', want: 'f', status: 'active', suspended_until: null, strikes: 0, verified: true, onboarded: true, created_at: t }, online: false, last_seen: null, staff_role: null, counts: { rooms: 1, open_rooms: 1, letters: 0, comments: 0, reports_filed: 0, reports_dismissed: 0 }, chat_reports: [], letter_reports: [], history: [] }),
	admin_user_rooms: () => [{ id: ROOM, status: 'active', created_at: t, closed_at: null, close_reason: null, live: true, alias: '여우', partner_id: B, partner_nickname: '작은별', message_count: 2 }],
	admin_rooms: () => [{ id: ROOM, status: 'active', created_at: t, closed_at: null, close_reason: null, round: 1, live: true, members: [{ seat: 1, user_id: A, nickname: '푸른고래' }, { seat: 2, user_id: B, nickname: '작은별' }], message_count: 2 }],
	admin_room: () => ({ room: { id: ROOM, status: 'active', round: 1, created_at: t, armed_at: t, expires_at: t, closed_at: null, close_reason: null, live: true }, members: [{ seat: 1, user_id: A, open: true, alias: '여우', nickname: '푸른고래', status: 'active' }, { seat: 2, user_id: B, open: true, alias: '곰', nickname: '작은별', status: 'active' }], messages: [] }),
	admin_letter_post: () => ({ letter: { id: 7, body: '안녕', status: 'open', reply_status: 'assigned', created_at: t }, participants: [{ no: 1, alias: '맑은 하늘', is_author: true, user_id: A, nickname: '푸른고래', status: 'active' }, { no: 2, alias: '고요한 숲', is_author: false, user_id: B, nickname: '작은별', status: 'active' }], reader: { user_id: B, expires_at: t, fulfilled_at: null, nickname: '작은별' }, comments: [{ id: 1, parent_id: null, author_no: 2, body: '반가워', status: 'visible', created_at: t }] })
};

const sb = http.createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		const fn = req.url.match(/^\/rest\/v1\/rpc\/([a-z_]+)/)?.[1];
		const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
		if (!fn || !RPC[fn]) return send(404, { message: `no mock ${req.url}` });
		try { send(200, RPC[fn](body ? JSON.parse(body) : {})); } catch (e) { send(e.status ?? 500, e.body ?? { message: String(e) }); }
	});
}).listen(54399);

const env = { ...process.env, SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'service-key-xxxxxxxxxxxx', PUBLIC_SUPABASE_URL: SB, PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest', ADMIN_SESSION_SECRET: SECRET };
const vite = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let viteOut = '';
vite.stdout.on('data', (d) => (viteOut += d));
vite.stderr.on('data', (d) => (viteOut += d));
for (let i = 0; i < 60 && !viteOut.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };

const payload = `${STAFF}.${Math.floor(Date.now() / 1000) + 3600}`;
const cookie = `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
const browser = await chromium.launch({ executablePath: CHROME });
try {
	const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
	await ctx.addCookies([{ name: 'simbun_admin', value: cookie, domain: 'localhost', path: '/admin', httpOnly: true, sameSite: 'Strict' }]);
	const page = await ctx.newPage();
	const errs = [];
	page.on('pageerror', (e) => errs.push(String(e)));
	const pages = [
		['users', '/admin/users', ['푸른고래(29999 홍길동)', '작은별(19998)']],
		['user', `/admin/users/${A}`, ['푸른고래(29999 홍길동)', '작은별(19998)']],
		['rooms', '/admin/rooms', ['푸른고래(29999 홍길동)', '작은별(19998)']],
		['room', `/admin/rooms/${ROOM}`, ['푸른고래(29999 홍길동) →', '작은별(19998) →']],
		['post', '/admin/posts/7', ['푸른고래(29999 홍길동) →', '작은별(19998) →']]
	];
	console.log(`\n[${ROLE}]`);
	for (const [name, path, want] of pages) {
		const r = await page.goto(`http://localhost:${PORT}${path}`);
		if (r.status() === 200) await page.waitForLoadState('networkidle');
		const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
		await page.screenshot({ path: `${SP}/admin-${ROLE}-${name}.png`, fullPage: true });
		if (ROLE === 'admin') {
			check(`${path} — 200`, r.status() === 200 && !page.url().includes('login'), `${r.status()} ${page.url()}`);
			for (const w of want) check(`${path} — "${w}"`, text.replace(/ \(/g, '(').includes(w), text.slice(0, 300));
		} else {
			const ok = r.status() === 200 && !page.url().includes('login');
			if (ok) check(`${path} — 운영진에겐 괄호 없음`, !text.includes('29999') && !text.includes('홍길동'), text.slice(0, 200));
			else check(`${path} — 관리자 전용 화면은 403`, r.status() === 403, String(r.status()));
		}
	}
	check('페이지 오류 없음', errs.length === 0, errs.join(' / '));
	if (ROLE === 'admin') check('학번·이름 조회는 페이지당 1번', labelCalls.length === pages.length, String(labelCalls.length));
	else check('★ 운영진은 학번·이름 RPC 를 아예 부르지 않는다', labelCalls.length === 0, String(labelCalls.length));
} finally {
	await browser.close();
	vite.kill();
	sb.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
