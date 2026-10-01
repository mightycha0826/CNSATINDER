import { ROOT, CHROME, OUT, answerDialogs } from './_env.mjs';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { spawn, stopProcess } from './_process.mjs';
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
let letterDelay = 0;
let letterRequests = 0;

const RPC = {
	admin_staff_role: () => ROLE,
	admin_staff_touch: () => ({ role: ROLE, perms: ({ moderator: ['live', 'moderate', 'service', 'inquiry', 'audit'], developer: ['live', 'settings', 'service', 'inquiry', 'audit'], beta: ['live'] })[ROLE] ?? [], team: [] }),
	admin_student_labels: (a) => {
		labelCalls.push(a.p_users);
		if (ROLE !== 'admin') throw { status: 400, body: { message: 'admin_only' } };
		return { [A]: '29999 홍길동', [B]: '19998' };
	},
	admin_find_users: () => [A, B].map((id, i) => ({ id, nickname: ['푸른고래', '작은별'][i], status: 'active', suspended_until: null, strikes: 0, verified: true, onboarded: true, created_at: t, online: false, last_seen: null, staff_role: null, reports_received: 0 })),
	admin_user: (a) => ({ profile: { id: a.p_user, nickname: a.p_user === A ? '푸른고래' : '작은별', bio: '', interests: [], mbti: null, gender: 'm', want: 'f', status: 'active', suspended_until: null, strikes: 0, verified: true, onboarded: true, created_at: t }, online: false, last_seen: null, staff_role: null, counts: { rooms: 1, open_rooms: 1, letters: 1, comments: 0, reports_filed: 0, reports_dismissed: 0 }, chat_reports: [], letter_reports: [], history: [] }),
	admin_user_rooms: (a) => [{ id: ROOM, status: 'active', created_at: t, closed_at: null, close_reason: null, live: true, alias: '여우', partner_id: a.p_user === A ? B : A, partner_nickname: a.p_user === A ? '작은별' : '푸른고래', message_count: 2 }],
	admin_log_identity_view: () => null,
	admin_roster_name: () => '조회한 실명',
	admin_user_letters: async () => {
		letterRequests++;
		if (letterDelay) await new Promise((r) => setTimeout(r, letterDelay));
		return [{ letter_id: 7, alias: '사용자A의 편지이름', is_author: true, status: 'open', created_at: t, preview: '사용자A의 편지내용', my_comments: 0 }];
	},
	admin_rooms: () => [{ id: ROOM, status: 'active', created_at: t, closed_at: null, close_reason: null, round: 1, live: true, members: [{ seat: 1, user_id: A, nickname: '푸른고래' }, { seat: 2, user_id: B, nickname: '작은별' }], message_count: 2 }],
	admin_room: () => ({ room: { id: ROOM, status: 'active', round: 1, created_at: t, armed_at: t, expires_at: t, closed_at: null, close_reason: null, live: true }, members: [{ seat: 1, user_id: A, open: true, alias: '여우', nickname: '푸른고래', status: 'active' }, { seat: 2, user_id: B, open: true, alias: '곰', nickname: '작은별', status: 'active' }], messages: [] }),
	admin_letter_post: () => ({ letter: { id: 7, body: '안녕', status: 'open', reply_status: 'assigned', created_at: t }, participants: [{ no: 1, alias: '맑은 하늘', is_author: true, user_id: A, nickname: '푸른고래', status: 'active' }, { no: 2, alias: '고요한 숲', is_author: false, user_id: B, nickname: '작은별', status: 'active' }], reader: { user_id: B, expires_at: t, fulfilled_at: null, nickname: '작은별' }, comments: [{ id: 1, parent_id: null, author_no: 2, body: '반가워', status: 'visible', created_at: t }] })
};

const sb = http.createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', async () => {
		const fn = req.url.match(/^\/rest\/v1\/rpc\/([a-z_]+)/)?.[1];
		const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
		if (req.url.startsWith('/auth/v1/admin/users/')) return send(200, { id: A, email: '29999@cnsa.hs.kr', aud: 'authenticated', role: 'authenticated' });
		if (!fn || !RPC[fn]) return send(404, { message: `no mock ${req.url}` });
		try { send(200, await RPC[fn](body ? JSON.parse(body) : {})); } catch (e) { send(e.status ?? 500, e.body ?? { message: String(e) }); }
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
	if (ROLE === 'admin') {
		await page.goto(`http://localhost:${PORT}/admin/users/${A}`);
		await answerDialogs(page, () => true);
		await page.getByRole('button', { name: '이메일 확인', exact: true }).click();
		await page.locator('.email').waitFor();
		await page.getByRole('button', { name: '편지 · 댓글 보기', exact: true }).click();
		await page.getByText('사용자A의 편지이름', { exact: true }).waitFor();
		await page.locator('.pn input[name=title]').fill('사용자A 공지초안');
		await page.locator(`a[href="/admin/users/${B}"]`).click();
		await page.waitForURL(`**/admin/users/${B}`);
		check('★ 사용자 전환 시 이전 이메일·편지·공지초안을 비운다', await page.locator('.email').count() === 0 && await page.getByText('사용자A의 편지이름', { exact: true }).count() === 0 && await page.locator('.pn input[name=title]').inputValue() === '');

		await page.locator(`a[href="/admin/users/${A}"]`).click();
		await page.waitForURL(`**/admin/users/${A}`);
		letterDelay = 1000;
		const before = letterRequests;
		await page.getByRole('button', { name: '편지 · 댓글 보기', exact: true }).click();
		for (let i = 0; i < 30 && letterRequests === before; i++) await new Promise((r) => setTimeout(r, 20));
		if (letterRequests === before) throw new Error('편지 열람 요청이 시작되지 않았다');
		await page.locator(`a[href="/admin/users/${B}"]`).click();
		await page.waitForURL(`**/admin/users/${B}`);
		await page.waitForTimeout(1300);
		check('★ 이전 사용자 열람의 늦은 결과도 현재 사용자에게 붙이지 않는다', await page.getByText('사용자A의 편지이름', { exact: true }).count() === 0 && await page.getByRole('button', { name: '편지 · 댓글 보기', exact: true }).count() === 1);
	}
} finally {
	await browser.close();
	stopProcess(vite);
	sb.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
