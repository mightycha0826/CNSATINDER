import { ROOT, CHROME } from './_env.mjs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
// 사용 흐름이 말없이 끊기지 않는지 (Phase 39 · docs/UX-GUIDELINES.md) — 가짜 Supabase 를 브라우저 가로채기로
//  · 로그인 직후 "계정 정보를 불러오지 못함"이 번쩍이지 않는다
//  · 찾는 중 AI 대화를 닫아도, 끝난 대화에서 "새 대화 찾기"로 와도 찾기가 이어진다
//  · 대화방을 열다 네트워크가 끊기면 쫓아내지 않고 그 자리에서 "다시 시도"
//  · 공지 하나를 열면 그 공지까지만 본 것으로
//  · 겹친 창(시트 · AI 대화)은 뒤로가기로 닫힌다 · 알림으로 깊은 화면에 곧장 들어와도 뒤로가기는 홈으로
const PORT = Number(process.env.E2E_PORT) || 5183;
const BASE = `http://localhost:${PORT}`;
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
const LIVE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ENDED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FLAKY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();
const room = (id, alias) => ({ room_id: id, status: 'active', my_seat: 1, partner_alias: alias, expires_at: iso(600), round: 1, joined: true, partner_online: true, last_body: '안녕', last_seat: 2, last_at: iso(), unread: 0 });
const snap = (id, alias, closed = false) => ({ room_id: id, status: closed ? 'closed' : 'active', my_seat: 1, my_alias: '말랑복숭아', partner_alias: alias, expires_at: iso(closed ? -5 : 3600), round: 1, max_rounds: 0, extend_minutes: 10, vote_window_sec: 90, my_vote: null, partner_vote: null, partner_joined: true, partner_online: true, their_read_id: null, close_reason: closed ? 'expired' : null, server_now: iso() });

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const browser = await chromium.launch({ executablePath: CHROME });

/** 새 창 하나 — 가짜 서버 + 요청 기록. opts 로 시나리오별 응답을 바꾼다 */
async function open(opts = {}) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const page = await ctx.newPage();
	const log = [];
	const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
	const st = { flakyFails: opts.flakyFails ?? 0, marks: [], unread: opts.unread, dm: opts.dm };
	await ctx.route('https://fake-proj.supabase.co/**', async (route) => { // 창 전체 (알림으로 새 창을 여는 시나리오)
		const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
		log.push(p.replace('/rest/v1/', ''));
		const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
		const body = () => { try { return req.postDataJSON() ?? {}; } catch { return {}; } };
		if (p === '/auth/v1/token') return json(session);
		if (p.startsWith('/auth/v1/')) return json({});
		if (p.endsWith('rpc/my_account')) return json({ has_password: true });
		if (st.offline && /rpc\/(dm_mailbox|my_notices|my_rooms)$/.test(p)) return route.abort('internetdisconnected');
		if (p.endsWith('rpc/my_rooms')) return json({ rooms: [{ ...room(LIVE, '새벽수달'), unread: st.unread ?? 0 }, room(ENDED, '끝난고래'), room(FLAKY, '느린거북')], server_now: iso() });
		if (p.endsWith('rpc/dm_unread')) return json(st.dm ?? 0);
		if (p.endsWith('rpc/dm_mailbox')) return json({ letters: [] });
		if (p.endsWith('rpc/update_my_profile')) { st.saved = body(); return json(null); }
		if (p.endsWith('rpc/letter_feed')) return json({ letters: [], server_now: iso() });
		if (p.endsWith('rpc/my_notices')) return json({ notices: [{ id: 3, title: '세 번째 공지', body: '본문', created_at: iso(-60) }, { id: 2, title: '두 번째 공지', body: '본문', created_at: iso(-3600) }], last_seen: 1 });
		if (p.endsWith('rpc/mark_notices_seen')) { st.marks.push(body().p_id); return json(body().p_id); }
		if (p.endsWith('rpc/request_match')) return json({ status: 'waiting', reason: 'empty', poll_ms: 4000 });
		if (p.endsWith('rpc/ai_chat_start')) return json({ status: 'ok', id: 'ai-1', expires_at: iso(600), turns: 0, max_turns: 20, left_today: 3, server_now: iso() });
		if (/rpc\/(ack_room|room_snapshot|close_if_expired|room_view)/.test(p)) {
			const id = body().p_room;
			if (id === FLAKY && st.flakyFails > 0) { st.flakyFails--; return route.abort('internetdisconnected'); }
			if (id === ENDED) return json(snap(ENDED, '끝난고래', true));
			if (id === FLAKY) return json(snap(FLAKY, '느린거북'));
			return json(snap(LIVE, '새벽수달'));
		}
		if (p === '/rest/v1/profiles') {
			if (opts.slowProfile) await new Promise((r) => setTimeout(r, opts.slowProfile));
			return json({ id: uid, nickname: '푸른고래', bio: st.saved?.p_bio ?? '', interests: st.saved?.p_interests ?? [], mbti: st.saved?.p_mbti || null, gender: 'm', want: 'f', status: 'active', suspended_until: null, verified: true, onboarded: true });
		}
		if (p === '/rest/v1/app_settings') return json({ is_open: true, notice: '', room_minutes: 10, extend_minutes: 10, vote_window_sec: 90, join_grace_sec: 60, max_rounds: 0, heartbeat_sec: 15, presence_ttl_sec: 45, msg_max_len: 500, max_open_rooms: 5, letter_max_len: 1000, comment_max_len: 300, ai_moderation: false, ai_chat: true, ai_chat_per_user: 3 });
		if (p.startsWith('/rest/v1/rpc/')) return json(null);
		return json([]);
	});
	await ctx.addInitScript(() => {
		try { localStorage.setItem('push-asked-v1', '1'); } catch {}
		// 앱 아이콘 배지 — 부른 값을 적어 둔다 (G10.4)
		window.__badge = [];
		navigator.setAppBadge = (n) => (window.__badge.push(n ?? 'dot'), Promise.resolve());
		navigator.clearAppBadge = () => (window.__badge.push(0), Promise.resolve());
	});
	const count = (path, from = 0) => log.slice(from).filter((x) => x === path).length;
	return { ctx, page, log, errs, st, count };
}

async function login(page, watch) {
	await page.goto(`${BASE}/login`);
	await page.getByPlaceholder('학교 이메일 앞부분').fill('29999');
	await page.getByPlaceholder('비밀번호').fill('abcd1234');
	await page.getByRole('button', { name: '로그인', exact: true }).click();
	if (watch) await watch();
	await page.locator('button.heart').waitFor({ timeout: 15000 });
	await page.waitForTimeout(800);
}

try {
	console.log('[로그인 직후]');
	{
		const { ctx, page } = await open({ slowProfile: 1500 });
		let flashed = false;
		await login(page, async () => {
			for (let i = 0; i < 40; i++) {
				if ((await page.locator('body').innerText().catch(() => '')).includes('계정 정보를 불러오지 못함')) flashed = true;
				await page.waitForTimeout(60);
			}
		});
		check('★ 프로필을 불러오는 동안 "계정 정보를 불러오지 못함"이 번쩍이지 않는다', !flashed);
		await ctx.close();
	}

	console.log('[찾는 중 AI 대화를 닫아도]');
	{
		const { ctx, page, log, count, errs } = await open();
		await login(page);
		await page.getByRole('button', { name: '새 대화 찾기' }).click();
		await page.waitForTimeout(600);
		await page.getByRole('button', { name: /AI 와 얘기하기/ }).click();
		await page.getByRole('dialog', { name: 'AI 와 대화' }).waitFor();
		await page.waitForTimeout(800);
		await page.getByRole('button', { name: 'AI 대화 닫기' }).click();
		const m0 = log.length;
		await page.waitForTimeout(9000);
		check('★ 닫은 뒤에도 계속 찾는다 (request_match 가 이어진다)', count('rpc/request_match', m0) >= 2, String(count('rpc/request_match', m0)));
		check('★ 그만 찾기(stop_seeking)를 보내지 않는다', count('rpc/stop_seeking') === 0, String(count('rpc/stop_seeking')));
		check('찾는 중 표시가 남아 있다 ("그만" 버튼)', await page.getByRole('button', { name: '그만' }).isVisible());
		check('페이지 오류 없음', errs.length === 0, errs.join(' | '));
		await ctx.close();
	}

	console.log('[끝난 대화 → 새 대화 찾기]');
	{
		const { ctx, page, log, count, errs } = await open();
		await login(page);
		await page.getByRole('button', { name: /끝난고래/ }).click();
		await page.waitForURL(`${BASE}/chat/${ENDED}`);
		// ★ 대화방 화면의 "새 대화 찾기" (화면이 넘어가는 동안 홈의 같은 이름 버튼을 누르지 않게)
		const again = page.locator('.ended').getByRole('button', { name: '새 대화 찾기' });
		await again.waitFor({ timeout: 10000 });
		await page.waitForTimeout(400);
		const m0 = log.length;
		await again.click();
		await page.waitForURL(`${BASE}/`);
		await page.waitForTimeout(9000);
		check('★ 홈으로 와서 계속 찾는다', count('rpc/request_match', m0) >= 2, `${count('rpc/request_match', m0)} · ${log.slice(m0).join(' ')}`);
		check('★ 그만 찾기(stop_seeking)를 보내지 않는다', count('rpc/stop_seeking', m0) === 0, String(count('rpc/stop_seeking', m0)));
		check('찾는 중 표시 ("그만" 버튼)', await page.getByRole('button', { name: '그만' }).isVisible(), page.url());
		check('페이지 오류 없음', errs.length === 0, errs.join(' | '));
		await ctx.close();
	}

	console.log('[대화방을 열다 네트워크가 끊기면]');
	{
		const { ctx, page, errs } = await open({ flakyFails: 1 });
		await login(page);
		await page.getByRole('button', { name: /느린거북/ }).click();
		await page.waitForTimeout(1500);
		check('★ 쫓아내지 않는다 (주소가 그대로)', page.url().endsWith(`/chat/${FLAKY}`), page.url());
		const retry = page.getByRole('button', { name: '다시 시도' });
		check('★ 그 자리에 "다시 시도"', await retry.isVisible().catch(() => false));
		await retry.click().catch(() => {});
		await page.waitForTimeout(1500);
		check('다시 시도하면 대화가 열린다', (await page.getByRole('region', { name: '대화 내용' }).count()) === 1 && !(await retry.isVisible().catch(() => false)));
		check('페이지 오류 없음', errs.length === 0, errs.join(' | '));
		await ctx.close();
	}

	console.log('[겹친 창과 뒤로가기 (G5.1)]');
	{
		const { ctx, page, errs } = await open();
		await page.goto(`${BASE}/dev/chat?s=ended`);
		await page.goto(`${BASE}/dev/chat?s=chat`);
		const more = page.getByRole('button', { name: '메뉴' });
		await more.waitFor({ timeout: 20000 });
		await page.waitForTimeout(600);
		const sheet = page.locator('.sheet');
		await more.click();
		await sheet.waitFor();
		check('시트가 열리면 기록 한 칸 (ov)', (await page.evaluate(() => history.state?.['sveltekit:states']?.ov?.length ?? 0)) === 1);
		await page.goBack();
		await page.waitForTimeout(500);
		check('★ 뒤로가기 → 시트만 닫힌다 (대화방 그대로)', (await sheet.count()) === 0 && page.url().includes('s=chat'), page.url());
		await more.click();
		await sheet.waitFor();
		await page.locator('.sheet .item', { hasText: '취소' }).click();
		await page.waitForTimeout(600);
		check('취소 버튼으로 닫아도 시트 칸이 걷힌다', (await page.evaluate(() => history.state?.['sveltekit:states']?.ov?.length ?? 0)) === 0);
		await more.click();
		await sheet.waitFor();
		await page.waitForTimeout(400);
		const g = await page.locator('.sheet .grab').boundingBox();
		await page.mouse.move(g.x + g.width / 2, g.y + 8);
		await page.mouse.down();
		for (let i = 1; i <= 8; i++) await page.mouse.move(g.x + g.width / 2, g.y + 8 + i * 16);
		await page.mouse.up();
		await page.waitForTimeout(600);
		check('★ 손잡이를 아래로 끌면 닫힌다', (await sheet.count()) === 0);
		check('끌어 닫아도 시트 칸이 걷힌다', (await page.evaluate(() => history.state?.['sveltekit:states']?.ov?.length ?? 0)) === 0);
		await more.click();
		await sheet.waitFor();
		await page.waitForTimeout(300);
		await page.mouse.move(g.x + g.width / 2, g.y + 8);
		await page.mouse.down();
		for (let i = 1; i <= 4; i++) { await page.mouse.move(g.x + g.width / 2, g.y + 8 + i * 8); await page.waitForTimeout(60); } // 천천히 (튕기면 닫힌다)
		await page.mouse.up();
		await page.waitForTimeout(600);
		check('조금만 끌면 제자리로', (await sheet.count()) === 1);
		await page.locator('.sheet .item', { hasText: '취소' }).click();
		await page.waitForTimeout(600);
		await page.goBack();
		await page.waitForTimeout(1200);
		check('★ 시트를 닫은 뒤 뒤로가기는 앞 화면으로 (칸이 남지 않았다)', page.url().includes('s=ended'), page.url());
		check('페이지 오류 없음', errs.length === 0, errs.join(' | '));
		await ctx.close();
	}

	console.log('[찾는 중 AI 대화를 뒤로가기로 닫아도]');
	{
		const { ctx, page, log, count } = await open();
		await login(page);
		await page.getByRole('button', { name: '새 대화 찾기' }).click();
		await page.waitForTimeout(600);
		await page.getByRole('button', { name: /AI 와 얘기하기/ }).click();
		await page.getByRole('dialog', { name: 'AI 와 대화' }).waitFor();
		await page.waitForTimeout(800);
		await page.goBack();
		await page.waitForTimeout(600);
		check('★ 뒤로가기로 AI 창이 닫힌다 (홈 그대로)', (await page.getByRole('dialog', { name: 'AI 와 대화' }).count()) === 0 && page.url() === `${BASE}/`, page.url());
		const m0 = log.length;
		await page.waitForTimeout(8500);
		check('★ 계속 찾는다', count('rpc/request_match', m0) >= 2 && count('rpc/stop_seeking') === 0, `${count('rpc/request_match', m0)} / stop ${count('rpc/stop_seeking')}`);
		await ctx.close();
	}

	console.log('[공지 하나 열기]');
	{
		const { ctx, page, st } = await open();
		await login(page);
		await page.goto(`${BASE}/notices/2`);
		await page.getByRole('heading', { name: '두 번째 공지' }).waitFor({ timeout: 10000 });
		await page.waitForTimeout(800);
		check('★ 연 공지(2번)까지 본 것으로 저장', st.marks.includes(2), JSON.stringify(st.marks));
		check('더 새 공지(3번)는 본 것으로 치지 않는다', !st.marks.includes(3), JSON.stringify(st.marks));
		await ctx.close();
	}

	console.log('[알림으로 깊은 화면에 곧장 (G5.7)]');
	{
		const { ctx, page } = await open();
		await login(page);
		// 알림을 누르면 서비스워커가 새 창을 연다 — 기록이 한 칸뿐인 창 (newPage 는 about:blank 칸이 먼저 있어 window.open 으로)
		const fresh = async () => (await Promise.all([ctx.waitForEvent('page'), page.evaluate((u) => void window.open(u), `${BASE}/notices/2`)]))[0];
		const win = await fresh();
		await win.getByRole('heading', { name: '두 번째 공지' }).waitFor({ timeout: 10000 });
		await win.waitForTimeout(600);
		check('깊은 화면 위에 뒤로가기 칸 하나 (deep)', (await win.evaluate(() => [history.length, !!history.state?.['sveltekit:states']?.deep])).join() === '2,true');
		await win.mouse.click(200, 400); // 크롬은 누른 적 없는 화면에서 쌓인 칸을 건너뛴다
		await win.goBack();
		await win.locator('button.heart').waitFor({ timeout: 8000 });
		await win.waitForTimeout(400);
		check('★ 뒤로가기 → 홈 (앱이 닫히지 않는다) · 홈이 기록의 맨 아래', new URL(win.url()).pathname === '/' && (await win.evaluate(() => history.length)) === 2, `${win.url()} ${await win.evaluate(() => history.length)}`);
		// 화면의 ← 도 같다
		const win2 = await fresh();
		await win2.getByRole('heading', { name: '두 번째 공지' }).waitFor({ timeout: 10000 });
		await win2.waitForTimeout(600);
		await win2.locator('button.back').click();
		await win2.locator('button.heart').waitFor({ timeout: 8000 });
		check('★ 화면의 ← → 홈', new URL(win2.url()).pathname === '/');
		// 앱 안에서 들어온 깊은 화면에는 쌓지 않는다
		await page.goto(`${BASE}/notices/2`);
		await page.getByRole('heading', { name: '두 번째 공지' }).waitFor({ timeout: 10000 });
		await page.waitForTimeout(400);
		check('기록이 있으면 (앱 안에서 왔으면) deep 칸을 쌓지 않는다', !(await page.evaluate(() => history.state?.['sveltekit:states']?.deep)));
		await ctx.close();
	}

	console.log('[배지 (G10)]');
	{
		const { ctx, page, st } = await open({ unread: 3, dm: 2 });
		await login(page);
		await page.waitForTimeout(600);
		const num = page.locator('.tab-num');
		check('★ 채팅 탭 = 답할 대화 수 (안 읽은 말 3개가 있는 방 하나 → 1)', (await num.innerText()) === '1' && (await num.getAttribute('aria-label')) === '답할 대화 1개');
		check('★ 앱 아이콘 = 답할 대화 1 + 안 읽은 편지 2', (await page.evaluate(() => window.__badge.at(-1))) === 3, JSON.stringify(await page.evaluate(() => window.__badge)));
		// 보면 지워진다 — 서버가 0 으로 돌려주고 목록을 다시 읽으면
		st.unread = 0; st.dm = 0;
		await page.goto(`${BASE}/letters`); await page.waitForTimeout(500);
		await page.goto(`${BASE}/`); await page.locator('button.heart').waitFor(); await page.waitForTimeout(900);
		check('다 읽으면 채팅 탭 숫자가 사라지고 아이콘 배지도 지운다', (await num.count()) === 0 && (await page.evaluate(() => window.__badge.at(-1))) === 0, JSON.stringify(await page.evaluate(() => window.__badge)));
		await ctx.close();
	}

	console.log('[프로필 소개 자동 초안 (G5.5)]');
	{
		const { ctx, page, st } = await open();
		await login(page);
		await page.goto(`${BASE}/me`);
		const bio = page.getByRole('textbox', { name: '소개' });
		await bio.waitFor();
		await bio.fill('밴드 음악 좋아해요');
		await page.getByRole('button', { name: 'ENFP' }).click();
		await page.goto(`${BASE}/letters`); await page.waitForTimeout(400); // 저장하지 않고 다른 탭으로
		await page.goto(`${BASE}/me`); await bio.waitFor(); await page.waitForTimeout(400);
		check('★ 저장하지 않고 떠났다 와도 고치던 소개 · MBTI 가 그대로', (await bio.inputValue()) === '밴드 음악 좋아해요' && (await page.getByRole('button', { name: 'ENFP' }).getAttribute('class')).includes('on'));
		check('"저장하지 않은 소개를 이어서 고쳐요" 안내 · 저장 버튼 켜짐', (await page.locator('.toast').allInnerTexts()).some((t) => t.includes('이어서 고쳐요')) && (await page.getByRole('button', { name: '저장', exact: true }).isEnabled()));
		await page.getByRole('button', { name: '저장', exact: true }).click(); await page.waitForTimeout(500);
		check('★ 저장하면 초안을 지운다', st.saved?.p_bio === '밴드 음악 좋아해요' && (await page.evaluate(() => !Object.keys(localStorage).some((k) => k.includes(':profile:')))));
		await ctx.close();
	}

	console.log('[불러오지 못함 (G4)]');
	{
		const { ctx, page, st } = await open();
		await login(page);
		st.offline = true;
		await page.goto(`${BASE}/letters`);
		const err = page.getByRole('alert').filter({ hasText: '편지함을 불러오지 못했어요' });
		await err.waitFor({ timeout: 8000 });
		check('★ 편지함을 못 불러오면 "없어요"가 아니라 이유 + 다시 시도', (await page.getByText('새로 온 편지가 없어요').count()) === 0 && (await page.getByText('아직 쌓인 편지가 없어요').count()) === 0 && (await err.getByRole('button', { name: '다시 시도' }).count()) === 1);
		st.offline = false;
		await err.getByRole('button', { name: '다시 시도' }).click();
		await page.getByText('새로 온 편지가 없어요').waitFor({ timeout: 5000 });
		check('다시 시도 → 편지함', (await err.count()) === 0);
		st.offline = true;
		await page.goto(`${BASE}/notices`);
		const nerr = page.getByRole('alert').filter({ hasText: '공지를 불러오지 못했어요' });
		await nerr.waitFor({ timeout: 8000 });
		check('★ 공지를 못 불러오면 끝없는 빈 줄 대신 다시 시도', (await nerr.getByRole('button', { name: '다시 시도' }).count()) === 1);
		st.offline = false;
		await nerr.getByRole('button', { name: '다시 시도' }).click();
		await page.getByText('세 번째 공지').waitFor({ timeout: 5000 });
		check('다시 시도 → 공지 목록', (await nerr.count()) === 0);
		await ctx.close();
	}
	{
		// 앱을 열 때부터 대화 목록을 못 받는다
		const { ctx, page, st } = await open();
		st.offline = true;
		await login(page);
		const herr = page.getByRole('alert').filter({ hasText: '대화 목록을 불러오지 못했어요' });
		await herr.waitFor({ timeout: 8000 });
		check('★ 홈: 대화 목록을 못 받으면 "대화 없음"처럼 비워 두지 않고 다시 시도', (await page.locator('ul.rooms').count()) === 0);
		st.offline = false;
		await herr.getByRole('button', { name: '다시 시도' }).click();
		await page.locator('ul.rooms').waitFor({ timeout: 5000 });
		check('다시 시도 → 대화 목록', (await herr.count()) === 0);
		await ctx.close();
	}

	console.log('[로그아웃 (G14.4)]');
	{
		const { ctx, page } = await open({ unread: 1 });
		await login(page);
		await page.goto(`${BASE}/me`);
		await page.getByRole('textbox', { name: '소개' }).fill('다음 계정에 보이면 안 됨');
		await page.waitForTimeout(700);
		check('초안이 저장돼 있다', await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('draft-v1:'))));
		await page.evaluate(() => (window.__alive = true));
		await page.goto(`${BASE}/settings`);
		await page.evaluate(() => (window.__alive = true)); // 앱 안 이동이면 남아 있다
		await page.getByRole('button', { name: '로그아웃' }).click();
		await page.waitForURL('**/login', { timeout: 8000 });
		await page.getByPlaceholder('학교 이메일 앞부분').waitFor();
		check('★ 로그아웃하면 로그인 화면을 새로 연다 (앱 안에 기억해 둔 목록을 통째로 버린다)', !(await page.evaluate(() => window.__alive)));
		check('★ 쓰던 초안을 지운다', await page.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith('draft-v1:'))));
		await ctx.close();
	}
} catch (e) { fail++; console.error(e); }
finally {
	await browser.close();
	try { process.kill(-vite.pid); } catch { try { vite.kill(); } catch {} }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
