import { CHROME, OUT } from './_env.mjs';
import { chromium } from 'playwright-core';
// 이름 편지 (Phase 23) — 학생 찾기 → 익명으로 보내기 → 주고받기 · 끝내기 · 신고 · 편지 받기 설정 · 이름 적기
// 가짜 Supabase 를 브라우저 요청 가로채기로 (서버: run.mjs 가 5199 에 띄운다)
const SP = OUT;
const BASE = 'http://localhost:5199';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const uid = '3f1c2b4a-1111-4222-8333-944455556666';
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now, email: 'x@cnsa.hs.kr' })}.sig`;
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'rt',
	user: { id: uid, aud: 'authenticated', role: 'authenticated', email: '10101@cnsa.hs.kr', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();

/** 가짜 서버 상태 */
function world({ named = true } = {}) {
	const w = {
		account: named ? { has_password: true, name: '김보냄', grade: 1, name_source: 'roster' } : { has_password: true, name: null, grade: null, name_source: null },
		prof: { id: uid, nickname: '푸른고래', bio: '', interests: [], mbti: null, gender: 'm', want: 'f', status: 'active', suspended_until: null, verified: true, onboarded: true, allow_rematch: false, letters_open: true },
		calls: [],
		patches: [],
		threads: [
			{ id: 7, role: 'received', title: '푸른 우표', grade: null, status: 'open', last_at: ago(5), unread: 2,
				msgs: [{ id: 70, mine: false, body: '안녕! 너 그림 진짜 잘 그리더라', created_at: ago(8) }, { id: 71, mine: false, body: '나중에 알려 줄게 ㅎㅎ', created_at: ago(5) }] }
		],
		wait: false
	};
	return w;
}
const inbox = (w) => ({ threads: w.threads.map(({ msgs, ...t }) => ({ ...t, last_body: msgs.at(-1)?.body ?? null })), server_now: new Date().toISOString() });
const thread = (w, id) => {
	const t = w.threads.find((x) => x.id === id);
	if (!t) return { status: 'not_found' };
	t.unread = 0;
	return { status: 'ok', id: t.id, role: t.role, title: t.title, grade: t.grade, thread_status: t.status, closed_by: t.status === 'closed' ? (t.role === 'received' ? 'recipient' : 'sender') : null,
		wait_reply: w.wait, messages: t.msgs.map((m) => ({ ...m, removed: false })), server_now: new Date().toISOString() };
};

async function openApp(browser, w) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
	await page.route(`${BASE}/api/**`, (r) => { w.calls.push(['api', new URL(r.request().url()).pathname, r.request().postDataJSON()]); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"claimed":0}' }); });
	await page.route('https://fake-proj.supabase.co/**', async (route) => {
		const req = route.request(); const u = new URL(req.url());
		const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
		const rpc = u.pathname.startsWith('/rest/v1/rpc/') ? u.pathname.slice('/rest/v1/rpc/'.length) : null;
		const a = req.method() === 'POST' ? req.postDataJSON() ?? {} : {};
		if (rpc) w.calls.push([rpc, a]);
		if (u.pathname === '/auth/v1/token') return json(session);
		if (u.pathname.startsWith('/auth/v1/')) return json({});
		if (rpc === 'my_account') return json(w.account);
		if (rpc === 'set_my_name') { w.account = { ...w.account, name: a.p_name, name_source: 'self' }; return json({ status: 'ok' }); }
		if (rpc === 'my_rooms') return json({ rooms: [], server_now: new Date().toISOString() });
		if (rpc === 'my_notices') return json({ notices: [], last_seen: 0 });
		if (rpc === 'dm_inbox') return json(inbox(w));
		if (rpc === 'dm_search') {
			const q = String(a.p_q ?? '');
			return json(q.length >= 2 && '박받음'.includes(q) ? [{ id: 'u-b', name: '박받음', grade: 2, checked: true }, { id: 'u-c', name: '박받음', grade: 3, checked: true }] : []);
		}
		if (rpc === 'dm_send') {
			const id = 100 + w.threads.length;
			w.threads.unshift({ id, role: 'sent', title: '박받음', grade: 2, status: 'open', last_at: new Date().toISOString(), unread: 0, msgs: [{ id: id * 10, mine: true, body: a.p_body, created_at: new Date().toISOString() }] });
			return json({ status: 'ok', thread_id: id, msg_id: id * 10 });
		}
		if (rpc === 'dm_thread') return json(thread(w, a.p_thread));
		if (rpc === 'dm_reply') {
			if (w.wait) return json({ status: 'wait_reply' });
			const t = w.threads.find((x) => x.id === a.p_thread);
			const mid = t.msgs.at(-1).id + 1;
			t.msgs.push({ id: mid, mine: true, body: a.p_body, created_at: new Date().toISOString() });
			return json({ status: 'ok', msg_id: mid });
		}
		if (rpc === 'dm_close' || rpc === 'dm_block' || rpc === 'dm_report') {
			const t = w.threads.find((x) => x.id === a.p_thread); if (t) t.status = 'closed';
			return json({ status: 'ok' });
		}
		if (u.pathname === '/rest/v1/profiles') {
			if (req.method() === 'PATCH') { Object.assign(w.prof, req.postDataJSON()); w.patches.push(req.postDataJSON()); return route.fulfill({ status: 204 }); }
			return json(w.prof);
		}
		if (u.pathname === '/rest/v1/app_settings') return json({ is_open: true, notice: '', room_minutes: 10, extend_minutes: 10, vote_window_sec: 30, join_grace_sec: 30, max_rounds: 99, heartbeat_sec: 30, presence_ttl_sec: 70, msg_max_len: 500, max_open_rooms: 5, letter_max_len: 1000, comment_max_len: 300, ai_moderation: true, ai_chat: false });
		if (rpc) return json(null);
		return json([]);
	});
	await page.addInitScript(() => { try { localStorage.setItem('push-asked-v1', '1'); } catch {} });
	await page.goto(`${BASE}/login`);
	await page.getByPlaceholder('학교 이메일 앞부분').fill('10101');
	await page.getByPlaceholder('비밀번호').fill('abcd1234');
	await page.getByRole('button', { name: '로그인', exact: true }).click();
	await page.waitForTimeout(1500);
	return { page, errors };
}
const called = (w, fn) => w.calls.filter((c) => c[0] === fn);

const browser = await chromium.launch({ executablePath: CHROME });
try {
	const w = world();
	const { page, errors } = await openApp(browser, w);
	await page.locator('a.logo').waitFor({ timeout: 8000 });

	console.log('[탭 · 받은 편지]');
	await page.waitForTimeout(600);
	check('★ 안 읽은 편지 → 하단 익명편지 탭에 빨간 점', (await page.locator('a.tab', { hasText: '익명편지' }).locator('.tab-dot').count()) === 1);
	await page.locator('a.tab', { hasText: '익명편지' }).click(); await page.waitForURL('**/letters');
	await page.locator('.thread').first().waitFor();
	const row = page.locator('.thread').first();
	check('★ 받은 편지: 보낸 사람은 "익명 · 익명 이름" · ? 아바타', (await row.locator('.line1 b').innerText()) === '익명 · 푸른 우표' && (await row.locator('.anon').count()) === 1);
	check('안 읽은 수 · 미리보기', (await row.locator('.badge').innerText()) === '2' && (await row.locator('.line2').innerText()).includes('나중에 알려 줄게'));
	await page.screenshot({ path: `${SP}/letters-1-inbox.png` });

	console.log('[찾기 → 쓰기 → 보내기]');
	const search = page.getByRole('searchbox', { name: '편지 받을 학생 찾기' });
	await search.fill('박'); await page.waitForTimeout(400);
	check('한 글자로는 찾지 않는다', called(w, 'dm_search').length === 0 && (await page.locator('.person').count()) === 0);
	await search.fill('박받'); await page.waitForTimeout(600);
	const people = await page.locator('.person .who').allInnerTexts();
	check('★ 이름으로 찾기 — 동명이인은 학년으로 구분', people.length === 2 && people[0].includes('2학년') && people[1].includes('3학년'), JSON.stringify(people));
	await page.screenshot({ path: `${SP}/letters-2-search.png` });
	await page.locator('.person').first().click(); await page.waitForURL('**/letters/new');
	check('편지 쓰기: 받는 사람 이름 · 학년', (await page.locator('.to').innerText()).includes('박받음') && (await page.locator('.to').innerText()).includes('2학년'));
	check('비어 있으면 못 보낸다', await page.getByRole('button', { name: '보내기' }).isDisabled());
	check('"내 이름은 보이지 않아요" 안내', (await page.locator('.foot').innerText()).includes('익명 이름'));
	await page.getByRole('textbox', { name: '편지 내용' }).fill('안녕 박받음! 오늘 발표 멋있었어');
	await page.screenshot({ path: `${SP}/letters-3-compose.png` });
	await page.getByRole('button', { name: '보내기' }).click();
	await page.waitForURL(/\/letters\/\d+$/);
	const sent = called(w, 'dm_send').at(-1)?.[1];
	check('★ 고른 사람(계정 id)에게 보낸다', sent?.p_to === 'u-b' && sent?.p_body === '안녕 박받음! 오늘 발표 멋있었어', JSON.stringify(sent));
	await page.waitForTimeout(2000); // AI 검토 요청은 1.5초 모아서
	check('보낸 뒤 알림 · AI 검토 요청', w.calls.some((c) => c[0] === 'api' && c[1] === '/api/push' && c[2]?.dm_msg_id) && w.calls.some((c) => c[0] === 'api' && c[1] === '/api/moderate'));
	await page.locator('.row.mine .bubble').first().waitFor();
	check('보낸 편지 화면: 받는 사람 이름 · "나는 익명"', (await page.locator('.names b').innerText()) === '박받음' && (await page.locator('.names small').innerText()).includes('나는 익명'));
	check('내 편지는 오른쪽 말풍선', (await page.locator('.row.mine .bubble').innerText()).includes('발표 멋있었어'));

	console.log('[받은 편지 열기 · 답장]');
	await page.goto(`${BASE}/letters/7`); await page.locator('.bubble').first().waitFor(); await page.waitForTimeout(300);
	check('★ 받은 편지: "익명 · 푸른 우표" · 누가 보냈는지 알 수 없다는 안내', (await page.locator('.names b').innerText()) === '익명 · 푸른 우표' && (await page.locator('.names small').innerText()).includes('알 수 없어요'));
	check('편지 글은 선택 · 복사 가능', await page.locator('.bubble').first().evaluate((e) => getComputedStyle(e).userSelect !== 'none'));
	await page.getByRole('textbox', { name: '답장' }).fill('누구야?? 고마워');
	await page.getByRole('button', { name: '보내기' }).click(); await page.waitForTimeout(500);
	check('답장', called(w, 'dm_reply').at(-1)?.[1]?.p_body === '누구야?? 고마워' && (await page.locator('.row.mine .bubble').last().innerText()).includes('고마워'));
	await page.screenshot({ path: `${SP}/letters-4-thread.png` });
	w.wait = true;
	await page.reload(); await page.locator('.bubble').first().waitFor(); await page.waitForTimeout(300);
	check('답 없이 3개를 보냈으면 입력창 대신 안내', (await page.locator('.wait').count()) === 1 && (await page.getByRole('textbox', { name: '답장' }).count()) === 0);
	w.wait = false;

	console.log('[메뉴 · 신고]');
	await page.getByRole('button', { name: '메뉴' }).click(); await page.waitForTimeout(300);
	check('메뉴: 그만 주고받기 · 차단 · 신고 · 취소', (await page.locator('.sheet .item').allInnerTexts()).join(',') === '그만 주고받기,차단하기,신고하기,취소');
	await page.locator('.sheet .item', { hasText: '그만 주고받기' }).click(); await page.waitForTimeout(200);
	check('받은 편지를 끝내면 "다시 보낼 수 없어요" 안내', (await page.locator('.sheet .warn').innerText()).includes('다시 편지를 보낼 수 없어요'));
	await page.locator('.sheet .item', { hasText: '취소' }).click(); await page.waitForTimeout(300);
	await page.getByRole('button', { name: '메뉴' }).click(); await page.waitForTimeout(200);
	await page.locator('.sheet .item', { hasText: '신고하기' }).click(); await page.waitForTimeout(300);
	check('신고 시트: 사유 7개 · 운영진이 보낸 사람을 확인한다는 안내', (await page.locator('.reason').count()) === 7 && (await page.locator('.report .warn').innerText()).includes('누가 보냈는지 확인'));
	await page.screenshot({ path: `${SP}/letters-5-report.png` });
	await page.locator('.reason', { hasText: '욕설' }).click();
	await page.locator('.sheet .item.danger', { hasText: '신고하기' }).click();
	await page.waitForFunction(() => location.pathname !== '/letters/7'); await page.waitForTimeout(300);
	check('★ 신고 → 편지 id · 사유로 신고하고 편지 화면을 나간다', JSON.stringify(called(w, 'dm_report').at(-1)?.[1]) === JSON.stringify({ p_thread: 7, p_reason: 'harassment', p_note: '' }), page.url());

	console.log('[새로고침한 편지 쓰기]');
	await page.goto(`${BASE}/letters/new`); await page.waitForTimeout(1200);
	check('받는 사람 없이 편지 쓰기를 열면 목록으로', new URL(page.url()).pathname === '/letters');

	console.log('[설정 · 편지 받기]');
	await page.goto(`${BASE}/settings`);
	const sw = page.getByRole('switch', { name: '편지 받기' });
	await sw.waitFor();
	check('편지 받기 — 기본 켜짐', await sw.isChecked());
	await sw.click(); await page.waitForTimeout(500);
	check('★ 끄면 letters_open = false 로 저장', JSON.stringify(w.patches.at(-1)) === '{"letters_open":false}' && !(await sw.isChecked()));
	check('설정에 내 이름 · 학년', (await page.locator('.g-row', { hasText: '이름' }).innerText()).includes('김보냄 · 1학년'));
	check('개인정보 안내: 익명편지에서 이름으로 검색될 수 있음', (await page.locator('.privacy').innerText()).includes('이름과 학년으로 검색'));
	check('페이지 오류 없음', errors.length === 0, errors.join(' / '));

	console.log('[명단에 없는 학생 — 이름 적기]');
	const w2 = world({ named: false });
	const two = await openApp(browser, w2);
	await two.page.waitForURL('**/onboarding', { timeout: 8000 }).catch(() => {});
	check('★ 이름이 없으면 시작 화면으로 (이미 가입했어도)', new URL(two.page.url()).pathname === '/onboarding', two.page.url());
	check('이름만 묻는다 (성별 · 선호는 이미 정함)', (await two.page.getByRole('textbox', { name: '내 이름' }).count()) === 1 && (await two.page.getByText('나는', { exact: true }).count()) === 0);
	await two.page.getByRole('textbox', { name: '내 이름' }).fill('1');
	check('이상한 이름이면 저장 못 함', await two.page.getByRole('button', { name: '저장' }).isDisabled());
	await two.page.getByRole('textbox', { name: '내 이름' }).fill('이외부');
	await two.page.screenshot({ path: `${SP}/letters-6-name.png` });
	await two.page.getByRole('button', { name: '저장' }).click();
	await two.page.waitForURL(`${BASE}/`, { timeout: 8000 }).catch(() => {});
	check('★ 적으면 저장하고 홈으로', called(w2, 'set_my_name').at(-1)?.[1]?.p_name === '이외부' && new URL(two.page.url()).pathname === '/', two.page.url());
	check('페이지 오류 없음 (둘째)', two.errors.length === 0, two.errors.join(' / '));
} finally {
	await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
