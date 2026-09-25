import { ROOT, CHROME } from './_env.mjs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
// 요청 수 지키기 — 앱을 열 때 부팅 요청이 한 번씩만, 탭을 오가도 공지를 다시 부르지 않기, 찾는 중 폴링 간격
// (가짜 Supabase 를 브라우저 가로채기로 · 나가는 요청을 전부 센다)
const PORT = 5182;
const env = { ...process.env, PUBLIC_SUPABASE_URL: 'https://fake-proj.supabase.co', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest' };
const vite = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let out = ''; vite.stdout.on('data', (d) => (out += d));
for (let i = 0; i < 120 && !out.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const uid = '3f1c2b4a-1111-4222-8333-944455556666';
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: now + 36000, iat: now, email: 'x@cnsa.hs.kr' })}.sig`;
const session = { access_token: jwt, token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'rt',
	user: { id: uid, aud: 'authenticated', role: 'authenticated', email: '29999@cnsa.hs.kr', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const ROOM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();
const log = [];
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('websocket', (ws) => log.push(['WS', new URL(ws.url()).pathname]));
await page.route('https://fake-proj.supabase.co/**', async (route) => {
	const req = route.request(); const u = new URL(req.url());
	log.push([req.method(), u.pathname.replace('/rest/v1/', '')]);
	const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
	const p = u.pathname;
	if (p === '/auth/v1/token') return json(session);
	if (p.startsWith('/auth/v1/')) return json({});
	if (p.endsWith('rpc/my_account')) return json({ has_password: true });
	if (p.endsWith('rpc/my_rooms')) return json({ rooms: [{ room_id: ROOM, status: 'active', my_seat: 1, partner_alias: '새벽수달', expires_at: iso(600), round: 1, joined: true, partner_online: true, last_body: '안녕', last_seat: 2, last_at: iso(), unread: 0 }], server_now: iso() });
	if (p.endsWith('rpc/letter_feed')) return json({ letters: [], server_now: iso() });
	if (p.endsWith('rpc/my_notices')) return json({ notices: [], last_seen: 0 });
	if (p.endsWith('rpc/request_match')) return json({ status: 'waiting', reason: 'empty', poll_ms: 4000 });
	const snap = { room_id: ROOM, status: 'active', my_seat: 1, my_alias: '말랑복숭아', partner_alias: '새벽수달', expires_at: iso(3600), round: 1, max_rounds: 0, extend_minutes: 10, vote_window_sec: 90, my_vote: null, partner_vote: null, partner_joined: true, partner_online: true, their_read_id: null, close_reason: null, server_now: iso() };
	if (/rpc\/(ack_room|room_snapshot|close_if_expired)/.test(p)) return json(snap);
	if (p === '/rest/v1/profiles') return json({ id: uid, nickname: '푸른고래', bio: '', interests: [], mbti: null, gender: 'm', want: 'f', status: 'active', suspended_until: null, verified: true, onboarded: true });
	if (p === '/rest/v1/app_settings') return json({ is_open: true, notice: '', room_minutes: 10, extend_minutes: 10, vote_window_sec: 90, join_grace_sec: 30, max_rounds: 0, heartbeat_sec: 15, presence_ttl_sec: 45, msg_max_len: 500, max_open_rooms: 5, letter_max_len: 1000, comment_max_len: 300, ai_moderation: false, ai_chat: false });
	if (p === '/rest/v1/messages') return json(req.url().includes('limit=1') ? [] : []);
	if (p.startsWith('/rest/v1/rpc/')) return json(null);
	return json([]);
});
await page.addInitScript(() => { try { localStorage.setItem('push-asked-v1', '1'); } catch {} });
await page.goto(`http://localhost:${PORT}/login`);
await page.getByPlaceholder('학교 이메일 앞부분').fill('29999');
await page.getByPlaceholder('비밀번호').fill('abcd1234');
await page.getByRole('button', { name: '로그인', exact: true }).click();
await page.waitForURL(`http://localhost:${PORT}/`, { timeout: 10000 }).catch(() => {});
await page.locator('button.bell').waitFor({ timeout: 10000 });
await page.waitForTimeout(3000);
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const count = (path, from = 0) => log.slice(from).filter(([, p]) => p === path).length;
try {
	console.log('[앱을 열 때]');
	for (const p of ['rpc/ensure_self', 'profiles', 'app_settings', 'rpc/my_account'])
		check(`★ ${p} 는 한 번만 (예전엔 두 번)`, count(p) === 1, String(count(p)));
	await page.reload();
	await page.locator('button.bell').waitFor();
	await page.waitForTimeout(2500);
	for (const p of ['rpc/ensure_self', 'profiles', 'app_settings', 'rpc/my_account'])
		check(`새로고침해도 한 번씩 더 (${p})`, count(p) === 2, String(count(p)));

	console.log('[탭 오가기]');
	const n0 = count('rpc/my_notices');
	for (let i = 0; i < 3; i++) {
		await page.locator('a[href="/letters"]').first().click();
		await page.waitForURL(/\/letters$/);
		await page.waitForTimeout(400);
		await page.locator('a[href="/"]').last().click();
		await page.waitForURL(`http://localhost:${PORT}/`);
		await page.waitForTimeout(400);
	}
	check('★ 1분 안에 탭을 여섯 번 오가도 공지는 다시 부르지 않는다', count('rpc/my_notices') === n0, `${n0} → ${count('rpc/my_notices')}`);

	console.log('[찾는 중]');
	const m0 = log.length;
	await page.getByRole('button', { name: '새 대화 찾기' }).click();
	await page.waitForTimeout(12_500);
	const polls = count('rpc/request_match', m0);
	check('처음 30초는 4초 간격 (12초에 3~5번)', polls >= 3 && polls <= 5, String(polls));
} catch (e) { fail++; console.error(e); }
finally {
	await browser.close();
	try { process.kill(-vite.pid); } catch {}
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
