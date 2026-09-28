import { ROOT, CHROME } from './_env.mjs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
// 사용 흐름이 말없이 끊기지 않는지 (Phase 39 · docs/UX-GUIDELINES.md) — 가짜 Supabase 를 브라우저 가로채기로
//  · 로그인 직후 "계정 정보를 불러오지 못함"이 번쩍이지 않는다
//  · 찾는 중 AI 대화를 닫아도, 끝난 대화에서 "새 대화 찾기"로 와도 찾기가 이어진다
//  · 대화방을 열다 네트워크가 끊기면 쫓아내지 않고 그 자리에서 "다시 시도"
//  · 공지 하나를 열면 그 공지까지만 본 것으로
const PORT = 5183;
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
	const st = { flakyFails: opts.flakyFails ?? 0, marks: [] };
	await page.route('https://fake-proj.supabase.co/**', async (route) => {
		const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
		log.push(p.replace('/rest/v1/', ''));
		const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
		const body = () => { try { return req.postDataJSON() ?? {}; } catch { return {}; } };
		if (p === '/auth/v1/token') return json(session);
		if (p.startsWith('/auth/v1/')) return json({});
		if (p.endsWith('rpc/my_account')) return json({ has_password: true });
		if (p.endsWith('rpc/my_rooms')) return json({ rooms: [room(LIVE, '새벽수달'), room(ENDED, '끝난고래'), room(FLAKY, '느린거북')], server_now: iso() });
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
			return json({ id: uid, nickname: '푸른고래', bio: '', interests: [], mbti: null, gender: 'm', want: 'f', status: 'active', suspended_until: null, verified: true, onboarded: true });
		}
		if (p === '/rest/v1/app_settings') return json({ is_open: true, notice: '', room_minutes: 10, extend_minutes: 10, vote_window_sec: 90, join_grace_sec: 60, max_rounds: 0, heartbeat_sec: 15, presence_ttl_sec: 45, msg_max_len: 500, max_open_rooms: 5, letter_max_len: 1000, comment_max_len: 300, ai_moderation: false, ai_chat: true, ai_chat_per_user: 3 });
		if (p.startsWith('/rest/v1/rpc/')) return json(null);
		return json([]);
	});
	await page.addInitScript(() => { try { localStorage.setItem('push-asked-v1', '1'); } catch {} });
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
} catch (e) { fail++; console.error(e); }
finally {
	await browser.close();
	try { process.kill(-vite.pid); } catch { try { vite.kill(); } catch {} }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
