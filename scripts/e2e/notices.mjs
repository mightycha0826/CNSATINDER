import { ROOT, CHROME, OUT } from './_env.mjs';
import { chromium } from 'playwright-core';
// 학생 앱 공지사항 — 종 아이콘 · 빨간 점 · /notices (가짜 Supabase 를 브라우저 요청 가로채기로)
const SP = OUT;
const BASE = 'http://localhost:5199';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const uid = '3f1c2b4a-1111-4222-8333-944455556666';
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now, email: 'x@cnsa.hs.kr' })}.sig`;
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'rt',
	user: { id: uid, aud: 'authenticated', role: 'authenticated', email: '29999@cnsa.hs.kr', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();

let notices = [
	{ id: 2, title: '시험 기간 운영 안내', body: '시험 기간에는 밤 10시에 닫아요.\n둘째 줄', created_at: ago(30) },
	{ id: 1, title: '처음 공지', body: '', created_at: ago(60 * 30) }
];
let lastSeen = 1;
const marks = [];

const browser = await chromium.launch({ executablePath: CHROME });
try {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
	await page.route('https://fake-proj.supabase.co/**', async (route) => {
		const req = route.request(); const u = new URL(req.url());
		const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
		if (u.pathname === '/auth/v1/token') return json(session);
		if (u.pathname.startsWith('/auth/v1/')) return json({});
		if (u.pathname === '/rest/v1/rpc/my_account') return json({ has_password: true });
		if (u.pathname === '/rest/v1/rpc/my_rooms') return json({ rooms: [], server_now: new Date().toISOString() });
		if (u.pathname === '/rest/v1/rpc/letter_feed') return json({ letters: [], server_now: new Date().toISOString() });
		if (u.pathname === '/rest/v1/rpc/my_notices') return json({ notices, last_seen: lastSeen });
		if (u.pathname === '/rest/v1/rpc/mark_notices_seen') { const p = req.postDataJSON().p_id; marks.push(p); lastSeen = Math.max(lastSeen, p); return json(lastSeen); }
		if (u.pathname === '/rest/v1/profiles') return json({ id: uid, nickname: '푸른고래', bio: '', interests: [], mbti: null, gender: 'm', want: 'f', status: 'active', suspended_until: null, verified: true, onboarded: true });
		if (u.pathname === '/rest/v1/app_settings') return json({ is_open: true, notice: '', room_minutes: 10, extend_minutes: 10, vote_window_sec: 30, join_grace_sec: 30, max_rounds: 99, heartbeat_sec: 30, presence_ttl_sec: 70, msg_max_len: 500, max_open_rooms: 5, letter_max_len: 1000, comment_max_len: 300 });
		if (u.pathname.startsWith('/rest/v1/rpc/')) return json(null);
		return json([]);
	});
	await page.addInitScript(() => { try { localStorage.setItem('push-asked-v1', '1'); } catch {} });

	await page.goto(`${BASE}/login`);
	await page.getByPlaceholder('학교 이메일 앞부분').fill('29999');
	await page.getByPlaceholder('비밀번호').fill('abcd1234');
	await page.getByRole('button', { name: '로그인', exact: true }).click();
	await page.waitForURL(`${BASE}/`, { timeout: 8000 }).catch(() => {});
	const bell = page.locator('button.bell');
	await bell.waitFor({ timeout: 8000 });
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${SP}/notice-1-home.png` });

	console.log('[홈]');
	const box = async (sel) => page.locator(sel).first().boundingBox();
	const b = await box('button.bell'), me = await box('button.me');
	check('종은 프로필 왼쪽', b && me && b.x + b.width <= me.x, JSON.stringify({ b, me }));
	check('★ 안 본 공지 → 종 오른쪽 위 빨간 점', (await page.locator('button.bell .dot').count()) === 1);
	const dot = await box('button.bell .dot');
	check('점 위치: 종의 오른쪽 위', dot && dot.x + dot.width / 2 > b.x + b.width / 2 && dot.y + dot.height / 2 < b.y + b.height / 2, JSON.stringify({ dot, b }));
	check('점 색은 빨강', (await page.locator('button.bell .dot').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(255, 48, 64)');

	console.log('[공지 화면]');
	await bell.click();
	await page.waitForURL('**/notices');
	await page.getByText('시험 기간 운영 안내').waitFor();
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${SP}/notice-2-list.png` });
	const items = await page.locator('li').allInnerTexts();
	check('최신 공지가 위', items[0]?.includes('시험 기간 운영 안내') && items[1]?.includes('처음 공지'), items.join(' | '));
	check('처음 보는 공지에만 "새"', (await page.locator('li').nth(0).locator('.new').count()) === 1 && (await page.locator('li').nth(1).locator('.new').count()) === 0);
	check('줄바꿈 유지', (await page.locator('li .body').first().innerText()).includes('\n'));
	check('★ 열면 맨 위 공지까지 봤다고 저장', marks.at(-1) === 2, JSON.stringify(marks));
	check('시간 표시', /30분 전/.test(items[0]), items[0]);

	await page.locator('button.back').click();
	await page.waitForURL(`${BASE}/`);
	await page.waitForTimeout(500);
	check('★ 돌아오면 빨간 점 꺼짐', (await page.locator('button.bell .dot').count()) === 0);

	console.log('[새 공지]');
	notices = [{ id: 3, title: '새로 올린 공지', body: '내용', created_at: ago(0) }, ...notices];
	await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
	await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
	await page.waitForTimeout(800);
	check('★ 새 공지가 오면 다시 빨간 점 (앱으로 돌아오면 바로 확인)', (await page.locator('button.bell .dot').count()) === 1);

	await page.locator('a.tab', { hasText: '익명편지' }).click();
	await page.waitForURL('**/letters');
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${SP}/notice-3-letters.png` });
	check('익명편지 화면에도 종 + 점', (await page.locator('button.bell .dot').count()) === 1);
	await page.locator('button.bell').click();
	await page.waitForURL('**/notices');
	await page.getByText('새로 올린 공지').waitFor();
	await page.waitForTimeout(300);
	check('이번엔 3번만 "새"', (await page.locator('.new').count()) === 1 && (await page.locator('li').nth(0).locator('.new').count()) === 1);
	check('탭바는 숨김', (await page.locator('nav.tabbar').count()) === 0);
	await page.locator('button.back').click();
	await page.waitForTimeout(500);
	check('뒤로 → 익명편지로', page.url().endsWith('/letters'), page.url());

	console.log('[공지 없음]');
	notices = []; lastSeen = 0;
	await page.goto(`${BASE}/notices`);
	await page.getByText('아직 공지가 없어요').waitFor({ timeout: 8000 }).catch(() => {});
	check('빈 화면 안내', await page.getByText('아직 공지가 없어요').isVisible());
	await page.goto(`${BASE}/`); await page.locator('button.bell').waitFor(); await page.waitForTimeout(400);
	check('공지가 없으면 점 없음', (await page.locator('button.bell .dot').count()) === 0);
	check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
} finally { await browser.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
