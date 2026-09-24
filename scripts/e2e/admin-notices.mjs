import { ROOT, CHROME, OUT } from './_env.mjs';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const SP = OUT;
const ROLE = process.env.ROLE ?? 'admin';
const SECRET = 'e2e-secret-'.padEnd(48, 'z'), SB = 'http://127.0.0.1:54399', PORT = 5198, STAFF = '11111111-1111-4111-8111-111111111111';
let seq = 1;
let notices = [{ id: 1, title: '기존 공지', body: '본문', created_at: new Date().toISOString() }];
const calls = [];
const audit = [];
const RPC = {
	admin_staff_role: () => ROLE,
	admin_notices: () => notices.filter((n) => !n.removed).sort((a, b) => b.id - a.id),
	admin_post_notice: (a) => { calls.push(['post', a]); if (ROLE !== 'admin') throw { status: 400, body: { message: 'admin_only' } }; const id = ++seq; notices.push({ id, title: a.p_title, body: a.p_body, created_at: new Date().toISOString() }); audit.push({ id: audit.length + 1, staff_id: STAFF, action: 'post_notice', target_user: null, report_id: null, detail: { notice: id, title: a.p_title }, created_at: new Date().toISOString() }); return id; },
	admin_remove_notice: (a) => { calls.push(['remove', a]); const n = notices.find((x) => x.id === a.p_id && !x.removed); if (!n) throw { status: 400, body: { message: 'notice_not_found' } }; n.removed = true; return null; },
	admin_audit: () => audit
};
const sb = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { const fn = req.url.match(/rpc\/([a-z_]+)/)?.[1]; const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); }; if (!RPC[fn]) return send(404, { message: 'no ' + fn }); try { send(200, RPC[fn](JSON.parse(b || '{}'))); } catch (e) { send(e.status ?? 500, e.body ?? { message: String(e) }); } }); }).listen(54399);
const env = { ...process.env, SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'service-key-xxxxxxxxxxxx', PUBLIC_SUPABASE_URL: SB, PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest', ADMIN_SESSION_SECRET: SECRET };
const vite = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; vite.stdout.on('data', (d) => (out += d));
for (let i = 0; i < 60 && !out.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const payload = `${STAFF}.${Math.floor(Date.now() / 1000) + 3600}`;
const cookie = `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
const browser = await chromium.launch({ executablePath: CHROME });
try {
	const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
	await ctx.addCookies([{ name: 'simbun_admin', value: cookie, domain: 'localhost', path: '/admin', httpOnly: true, sameSite: 'Strict' }]);
	const page = await ctx.newPage();
	const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
	let answer = true; page.on('dialog', (d) => (answer ? d.accept() : d.dismiss()));
	const settle = async () => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(300); };
	console.log(`\n[${ROLE}]`);
	await page.goto(`http://localhost:${PORT}/admin`); await settle();
	await page.locator('header.bar nav a', { hasText: '공지사항' }).click(); await settle();
	check('메뉴 "공지사항" → 목록', page.url().endsWith('/admin/notices') && (await page.getByText('기존 공지').count()) === 1);
	if (ROLE === 'admin') {
		await page.getByPlaceholder('제목 (80자까지)').fill('  ');
		await page.getByPlaceholder(/내용/).fill('x');
		answer = true; await page.getByRole('button', { name: '공지 올리기' }).click(); await settle();
		check('빈 제목 → 안 올라감', calls.filter((c) => c[0] === 'post').length === 0);
		await page.getByPlaceholder('제목 (80자까지)').fill('축제 안내');
		await page.getByPlaceholder(/내용/).fill('금요일 오후\n운동장');
		answer = false; await page.getByRole('button', { name: '공지 올리기' }).click(); await settle();
		check('★ 확인창 취소 → 안 올라감', calls.filter((c) => c[0] === 'post').length === 0);
		answer = true; await page.getByRole('button', { name: '공지 올리기' }).click(); await settle();
		check('올리기 → 서버에 제목·내용', JSON.stringify(calls.at(-1)?.[1]).includes('축제 안내') && calls.at(-1)[1].p_body === '금요일 오후\n운동장');
		check('목록에 새 공지가 맨 위', (await page.locator('.list li').first().innerText()).includes('축제 안내'));
		check('완료 안내 + 입력칸 비움', (await page.locator('.a-ok').innerText()).includes('공지 올림') && (await page.getByPlaceholder('제목 (80자까지)').inputValue()) === '');
		await page.screenshot({ path: `${SP}/admin-notices.png`, fullPage: true });
		answer = false; await page.locator('.list li', { hasText: '기존 공지' }).getByRole('button', { name: '내리기' }).click(); await settle();
		check('★ 내리기 취소 → 그대로', calls.filter((c) => c[0] === 'remove').length === 0 && (await page.getByText('기존 공지').count()) === 1);
		answer = true; await page.locator('.list li', { hasText: '기존 공지' }).getByRole('button', { name: '내리기' }).click(); await settle();
		check('내리기 → 목록에서 빠짐', (await page.getByText('기존 공지').count()) === 0 && calls.at(-1)?.[1].p_id === 1);
		await page.locator('header.bar nav a', { hasText: '활동 기록' }).click(); await settle();
		check('활동 기록: "공지 올림 · 제목"', /공지 올림[\s\S]*"축제 안내"/.test(await page.locator('main').innerText()));
	} else {
		check('운영진: 올리기 폼 없음 · 안내', (await page.locator('form.post').count()) === 0 && (await page.getByText('관리자만 올리고 내릴 수').count()) === 1);
		check('운영진: 내리기 버튼 없음', (await page.getByRole('button', { name: '내리기' }).count()) === 0);
		const r = await page.request.post(`http://localhost:${PORT}/admin/notices?/post`, { form: { title: '몰래', body: '' }, headers: { origin: `http://localhost:${PORT}`, 'x-sveltekit-action': 'true' } });
		check('★ 운영진이 직접 요청해도 서버가 막음', calls.length === 0 && (await r.text()).includes('관리자만'), String(r.status()));
	}
	check('페이지 오류 없음', errs.length === 0, errs.join(' / '));
} finally {
	await browser.close(); vite.kill(); sb.close();
	try { execSync("pkill -f 'node_modules/.bin/vite dev --port 5198'"); } catch {}
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
