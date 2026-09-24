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
	const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => m.text().startsWith('DBG') && console.log('   ', m.text()));
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
	await page.locator('a.logo').waitFor({ timeout: 8000 });
	await page.waitForTimeout(600);
	const idx = () => page.evaluate(() => navigation.currentEntry.index);
	const toastText = () => page.locator('.toasts').innerText().catch(() => '');
	const back = async () => { await page.evaluate(() => history.back()); await page.waitForTimeout(400); };

	console.log('[로고]');
	const logo = page.locator('a.logo');
	check('로고 = 홈 링크, 끌 수 없음', (await logo.getAttribute('href')) === '/' && (await logo.getAttribute('draggable')) === 'false');
	const lb = await logo.boundingBox();
	await page.mouse.move(lb.x + 3, lb.y + lb.height / 2); await page.mouse.down();
	await page.mouse.move(lb.x + lb.width - 3, lb.y + lb.height / 2, { steps: 6 }); await page.mouse.up();
	check('로고를 드래그해도 글자가 잡히지 않는다', (await page.evaluate(() => getSelection().toString())) === '');
	await page.locator('button.me').click(); await page.waitForURL('**/me');
	await page.locator('button.back').click(); await page.waitForURL(`${BASE}/`); await page.waitForTimeout(500);
	check('내 프로필 → 뒤로 → 홈이 기록 맨 아래 그대로', (await idx()) === 1, String(await idx()));
	await logo.click(); await page.waitForTimeout(300);
	check('홈에서 로고 누르기 → 홈 그대로', new URL(page.url()).pathname === '/');

	console.log('[홈에서 뒤로가기]');
	check('홈: 맨 아래 홈 + 표식 하나', (await idx()) === 1, String(await idx()));
	await back();
	check('★ 뒤로 한 번 → "한 번 더 누르면 종료" 안내, 화면은 홈 그대로', (await toastText()).includes('뒤로가기를 한 번 더 누르면 종료됩니다') && new URL(page.url()).pathname === '/');
	check('★ 이제 기록 맨 아래 → 한 번 더 누르면 앱이 닫힌다', (await idx()) === 0, String(await idx()));
	await page.waitForTimeout(2300);
	check('2초가 지나면 다시 처음 상태 (다시 안내부터)', (await idx()) === 1, String(await idx()));

	console.log('[탭]');
	await page.locator('a.tab', { hasText: '익명편지' }).click(); await page.waitForURL('**/letters'); await page.waitForTimeout(500);
	check('탭 전환은 기록을 쌓지 않는다', (await idx()) === 1, String(await idx()));
	await page.locator('a.tab', { hasText: '채팅' }).click(); await page.waitForURL(`${BASE}/`); await page.waitForTimeout(400);
	await page.locator('a.tab', { hasText: '익명편지' }).click(); await page.waitForURL('**/letters'); await page.waitForTimeout(400);
	check('여러 번 오가도 그대로', (await idx()) === 1, String(await idx()));
	await back(); await page.waitForTimeout(300);
	check('★ 익명편지에서 뒤로 → 채팅 홈', new URL(page.url()).pathname === '/' && (await idx()) === 1, `${page.url()} ${await idx()}`);
	await back();
	check('이어서 뒤로 → 종료 안내', (await toastText()).includes('한 번 더') && (await idx()) === 0);
	await page.waitForTimeout(2300);

	console.log('[다른 화면에서 돌아오기]');
	await page.locator('button.bell').click(); await page.waitForURL('**/notices'); await page.waitForTimeout(300);
	await page.locator('button.back').click(); await page.waitForURL(`${BASE}/`); await page.waitForTimeout(500);
	check('공지 → 뒤로 → 홈, 기록 늘지 않음', (await idx()) === 1, String(await idx()));
	await page.locator('button.bell').click(); await page.waitForURL('**/notices'); await page.waitForTimeout(300);
	await back();
	check('휴대폰 뒤로가기로 돌아와도 같음 (안내 없이 홈)', new URL(page.url()).pathname === '/' && (await idx()) === 1);
	check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
} finally { await browser.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
