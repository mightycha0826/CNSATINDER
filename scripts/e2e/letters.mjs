import { CHROME, OUT } from './_env.mjs';
import { chromium } from 'playwright-core';
// 익명편지 (Phase 32 · 35) — 편지함(새 편지 + 책상 위 보관함) · 보관함(받은 · 보낸) → 봉투 열기 연출 → 편지로 답장 · 새 편지(찾기 → 서명 → 봉투에 담아 보내기) · 메뉴 · 설정 · 이름 적기
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

/** 가짜 서버 상태 — 편지 한 통씩 (box: 내 입장에서 받은/보낸) */
function world({ named = true } = {}) {
	return {
		account: named ? { has_password: true, name: '김보냄', grade: 1, name_source: 'roster' } : { has_password: true, name: null, grade: null, name_source: null },
		prof: { id: uid, nickname: '푸른고래', bio: '', interests: [], mbti: null, gender: 'm', want: 'f', status: 'active', suspended_until: null, verified: true, onboarded: true, allow_rematch: false, letters_open: true, manner_temp: 40 },
		calls: [],
		patches: [],
		letters: [
			{ id: 70, thread_id: 7, box: 'received', from_gender: 'f', from_name: null, opened: false, is_reply: false, body: '안녕! 너 그림 진짜 잘 그리더라\n나중에 누군지 알려 줄게 ㅎㅎ', created_at: ago(5) },
			{ id: 60, thread_id: 8, box: 'received', from_gender: 'm', from_name: null, opened: true, is_reply: false, body: '시험 잘 봐!', created_at: ago(90) },
			{ id: 55, thread_id: 9, box: 'received', from_gender: 'f', from_name: '박받음', opened: false, is_reply: true, body: '편지 고마워 누구야?', created_at: ago(30) },
			{ id: 50, thread_id: 9, box: 'sent', to_name: '박받음', to_grade: 2, opened: true, replied: true, is_reply: false, body: '발표 멋있었어', created_at: ago(60) }
		],
		rooms: [{ room_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'active', my_seat: 1, partner_alias: '새벽수달', expires_at: new Date(Date.now() + 600_000).toISOString(), round: 1, joined: true, partner_online: false, last_body: '안녕', last_seat: 2, last_at: ago(1), unread: 0 }],
		hidden: new Set(),
		wait: false,
		nextId: 100
	};
}
const pub = (l) => { const { box, body, ...rest } = l; return { ...rest, removed: false, thread_status: 'open' }; };
const mailbox = (w, box) => ({ letters: w.letters.filter((l) => l.box === box && !w.hidden.has(l.thread_id)).sort((a, b) => b.id - a.id).map(pub), server_now: new Date().toISOString() });
function open(w, id) {
	const l = w.letters.find((x) => x.id === id && !w.hidden.has(x.thread_id));
	if (!l) return { status: 'not_found' };
	const first = l.box === 'received' && !l.opened;
	if (l.box === 'received') l.opened = true;
	return { status: 'ok', ...pub(l), role: l.box, body: l.body, fmt: l.fmt ?? null, closed_by: null, can_reply: l.box === 'received', wait_reply: w.wait, first_open: first, server_now: new Date().toISOString() };
}

async function openApp(browser, w, opts = {}) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
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
		if (rpc === 'my_rooms') return json({ rooms: w.rooms, server_now: new Date().toISOString() });
		if (rpc === 'leave_room' || rpc === 'block_partner' || rpc === 'report_partner') { w.rooms = w.rooms.filter((r) => r.room_id !== a.p_room); return json({ snap: {}, status: 'ok' }); }
		if (rpc === 'my_notices') return json({ notices: [], last_seen: 0 });
		if (rpc === 'dm_mailbox') return json(mailbox(w, a.p_box));
		if (rpc === 'dm_unread') return json(w.letters.filter((l) => l.box === 'received' && !l.opened && !w.hidden.has(l.thread_id)).length);
		if (rpc === 'dm_open') return json(open(w, a.p_msg));
		if (rpc === 'dm_search') {
			const q = String(a.p_q ?? '');
			return json(q.length >= 2 && '박받음'.includes(q) ? [{ id: 'u-b', name: '박받음', grade: 2, no: 20314, checked: true }, { id: 'u-c', name: '박받음', grade: 2, no: 20522, checked: true }] : []);
		}
		if (rpc === 'dm_send') {
			const id = w.nextId++;
			w.letters.push({ id, thread_id: 9, box: 'sent', to_name: '박받음', to_grade: 2, opened: false, replied: false, is_reply: false, body: a.p_body, fmt: a.p_fmt ?? null, created_at: new Date().toISOString() });
			return json({ status: 'ok', thread_id: 9, msg_id: id });
		}
		if (rpc === 'dm_reply_to') {
			if (w.wait) return json({ status: 'wait_reply' });
			const src = w.letters.find((x) => x.id === a.p_msg);
			const id = w.nextId++;
			w.letters.push({ id, thread_id: src.thread_id, box: 'sent', to_name: src.from_name, to_gender: src.from_gender, opened: false, replied: false, is_reply: true, body: a.p_body, fmt: a.p_fmt ?? null, created_at: new Date().toISOString() });
			return json({ status: 'ok', thread_id: src.thread_id, msg_id: id });
		}
		if (rpc === 'dm_close' || rpc === 'dm_block' || rpc === 'dm_report') { w.hidden.add(a.p_thread); return json({ status: 'ok' }); }
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
	return { page, errors, ctx };
}
const called = (w, fn) => w.calls.filter((c) => c[0] === fn);
const phase = (page) => page.locator('[data-phase]').first().getAttribute('data-phase').catch(() => null);

const browser = await chromium.launch({ executablePath: CHROME });
try {
	const w = world();
	const { page, errors } = await openApp(browser, w);
	await page.locator('a.logo').waitFor({ timeout: 8000 });

	console.log('[편지함]');
	await page.waitForTimeout(600);
	check('★ 안 연 편지 → 하단 익명편지 탭에 빨간 점', (await page.locator('a.tab', { hasText: '익명편지' }).locator('.tab-dot').count()) === 1);
	await page.locator('a.tab', { hasText: '익명편지' }).click(); await page.waitForURL('**/letters');
	await page.locator('.stack .item').first().waitFor(); await page.waitForTimeout(500);
	const items = page.locator('.stack .item');
	check('★ 편지함 위: 안 연 편지만 봉투 2장 — 봉인 + "새 편지"', (await items.count()) === 2 && (await page.locator('.stack .new').count()) === 2 && (await page.locator('.stack .seal').count()) === 2);
	const labels = await items.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
	check('★ 모르는 사람은 "익명의 여학생" (성별만) · 내 편지의 답장은 이름', labels[0] === '익명의 여학생에게서 온 편지, 안 읽음' && labels[1] === '박받음에게서 온 답장, 안 읽음', JSON.stringify(labels));
	check('봉투 뒷면에 손글씨 From.', (await items.nth(0).locator('.back .back-from').innerText()).includes('익명의 여학생'));
	check('★ 받은 편지 테두리 = 보낸 사람 성별 색 (여학생 붉은색)', (await items.nth(0).locator('.env.b-f').count()) === 1 && (await items.nth(1).locator('.env.b-brand').count()) === 1);
	check('채팅 말풍선은 없다 (편지만)', (await page.locator('.bubble').count()) === 0 && (await page.getByRole('textbox', { name: '메시지' }).count()) === 0);
	check('새 편지 수', (await page.locator('.head .count').innerText()) === '2');
	const desk = page.locator('button.desk');
	check('★ 아래 책상 위 서류 더미 = 편지 보관함 (읽은 편지 · 보낸 편지)', (await desk.getAttribute('aria-label')) === '편지 보관함 — 받은 편지 1통, 보낸 편지 1통' && (await desk.locator('.layer').count()) >= 3 && (await desk.locator('.top-env .env').count()) === 1,
		await desk.getAttribute('aria-label'));
	await page.screenshot({ path: `${SP}/letters-1-inbox.png`, fullPage: true });

	await desk.click(); await page.waitForURL('**/letters/archive'); await page.locator('.rows .row').first().waitFor(); await page.waitForTimeout(300);
	const recvRows = await page.locator('.rows .row .name').allInnerTexts();
	check('★ 보관함 받은 편지: 전부 한 줄씩 (안 읽음 표시)', recvRows.length === 3 && recvRows[0].includes('익명의 여학생') && (await page.locator('.rows .st.new').count()) === 2, JSON.stringify(recvRows));
	check('보관함 작은 봉투도 성별 색', (await page.locator('.rows .mini.b-f').count()) === 1 && (await page.locator('.rows .mini.b-m').count()) === 1);
	await page.getByRole('tab', { name: '보낸 편지' }).click(); await page.waitForTimeout(300);
	const sentRow = await page.locator('.rows .row').first().innerText();
	check('★ 보관함 보낸 편지: To. 이름 · 학년 · "답장 옴"', sentRow.includes('To. 박받음') && sentRow.includes('2학년') && sentRow.includes('답장 옴'), sentRow);
	await page.screenshot({ path: `${SP}/letters-2-sent.png` });
	await page.getByRole('tab', { name: '받은 편지' }).click(); await page.waitForTimeout(200);
	await page.locator('button.back').click(); await page.waitForURL(/\/letters$/); await page.locator('.stack .item').first().waitFor();

	console.log('[봉투 열기]');
	await items.nth(0).click(); await page.waitForURL('**/letters/m/70');
	await page.locator('.stage').waitFor(); await page.waitForTimeout(250);
	const p0 = await phase(page), cap = await page.locator('.caption').innerText();
	check('★ 처음 여는 편지는 연출: 주소 면부터 · "익명의 여학생에게서 편지가 왔어요"', p0 === 'front' && cap.includes('익명의 여학생에게서 편지가 왔어요'), `${p0} | ${cap}`);
	await page.screenshot({ path: `${SP}/letters-3a-front.png` });
	await page.waitForTimeout(1300);
	check('뒤집어 덮개 쪽 · 봉인이 깨진다', ['back', 'crack'].includes(await phase(page)));
	await page.screenshot({ path: `${SP}/letters-3b-crack.png` });
	await page.waitForTimeout(900);
	check('덮개가 열리고 편지지가 나온다', ['open', 'out'].includes(await phase(page)));
	await page.screenshot({ path: `${SP}/letters-3c-out.png` });
	await page.locator('.letter-paper').waitFor({ timeout: 4000 }); await page.waitForTimeout(700);
	check('★ 펼치면 편지지: To. 내 이름 · From. 익명의 여학생 · 본문', (await page.locator('.letter-paper .lp-to').innerText()) === 'To. 김보냄'
		&& (await page.locator('.letter-paper .lp-from').innerText()) === 'From. 익명의 여학생' && (await page.locator('.letter-paper .lp-body').innerText()).includes('그림 진짜 잘 그리더라'));
	check('dm_open 으로 이 편지 한 통을 연다', JSON.stringify(called(w, 'dm_open').at(-1)?.[1]) === '{"p_msg":70}');
	check('편지 글은 선택 · 복사 가능', await page.locator('.letter-paper .lp-body').evaluate((e) => getComputedStyle(e).userSelect !== 'none'));
	check('★ 본문도 To. 와 같은 손글씨 · 줄 간격 = 편지지 줄 (34px)', await page.locator('.letter-paper .lp-body').evaluate((e) => {
		const s = getComputedStyle(e); const to = getComputedStyle(document.querySelector('.letter-paper .lp-to'));
		return s.fontFamily === to.fontFamily && s.lineHeight === '34px' && s.backgroundImage.includes('repeating-linear-gradient');
	}));
	check('★ 글줄마다 줄 위에 앉는다 (줄 칸의 아래 선과 글줄 아래가 같은 자리)', await page.locator('.letter-paper .lp-body').evaluate((e) => {
		const box = e.getBoundingClientRect(); const r = document.createRange(); r.selectNodeContents(e);
		const rects = [...r.getClientRects()].filter((c) => c.width > 0);
		// 글줄마다 줄 칸(34px) 안에서 같은 자리 · 글자 아래가 그 칸의 선(칸 맨 아래)을 넘지 않는다
		const offs = rects.map((c) => (c.top - box.top) % 34);
		return rects.length > 1 && Math.max(...offs) - Math.min(...offs) < 1.5 && rects.every((c) => ((c.top - box.top) % 34) + c.height <= 34.5);
	}));
	check('받은 편지 → "편지로 답장 쓰기" (채팅하기 없음)', (await page.getByRole('button', { name: '편지로 답장 쓰기' }).count()) === 1 && (await page.getByText('채팅하기').count()) === 0);
	await page.screenshot({ path: `${SP}/letters-3d-read.png`, fullPage: true });
	await page.goto(`${BASE}/letters/m/70`); await page.locator('.letter-paper').waitFor({ timeout: 2000 });
	check('★ 이미 연 편지는 연출 없이 바로 편지지', (await page.locator('.stage').count()) === 0);

	console.log('[편지로 답장]');
	await page.getByRole('button', { name: '편지로 답장 쓰기' }).click(); await page.waitForURL('**/letters/m/70/reply');
	await page.waitForFunction(() => document.querySelector('.compose')?.getAttribute('data-phase') === 'write', null, { timeout: 4000 });
	check('★ 봉투에서 편지지가 나와 쓰는 칸이 된다 — To. 익명의 여학생 · From. 내 이름', (await page.locator('.letter-paper .lp-to').innerText()).startsWith('To. 익명의 여학생')
		&& (await page.locator('.letter-paper .lp-from').innerText()) === 'From. 김보냄');
	check('비어 있으면 못 보낸다', await page.getByRole('button', { name: '봉투에 넣어 보내기' }).isDisabled());
	await page.getByRole('textbox', { name: '편지 내용' }).fill('고마워! 너도 잘 지내');
	await page.screenshot({ path: `${SP}/letters-4a-reply.png` });
	await page.getByRole('button', { name: '봉투에 넣어 보내기' }).click();
	await page.waitForTimeout(1500);
	check('보내면 편지지가 봉투로 → 덮개 · 봉인', ['close', 'seal'].includes(await phase(page)), await phase(page));
	await page.screenshot({ path: `${SP}/letters-4b-seal.png` });
	await page.waitForTimeout(800);
	check('봉투를 뒤집어 소인 "보냄"', ['flip', 'fly'].includes(await phase(page)) && (await page.locator('.compose .ring b').innerText()) === '보냄');
	await page.screenshot({ path: `${SP}/letters-4c-flip.png` });
	await page.waitForURL(/\/letters$/, { timeout: 4000 }); await page.waitForTimeout(500);
	check('★ 답장 → dm_reply_to (받은 편지 한 통에 · 이름으로 받은 쪽은 서명 없음)', JSON.stringify(called(w, 'dm_reply_to').at(-1)?.[1]) === JSON.stringify({ p_msg: 70, p_body: '고마워! 너도 잘 지내', p_fmt: null, p_nick: null }));
	await page.locator('button.desk').click(); await page.waitForURL('**/letters/archive'); await page.locator('.rows .row').first().waitFor(); await page.waitForTimeout(300);
	check('★ 날아간 뒤 보관함은 보낸 편지 칸 — 맨 위에 방금 답장 (To. 익명의 여학생)', (await page.getByRole('tab', { name: '보낸 편지' }).getAttribute('aria-selected')) === 'true'
		&& (await page.locator('.rows .row').first().innerText()).includes('To. 익명의 여학생'));

	console.log('[새 편지]');
	await page.locator('button.back').click(); await page.waitForURL(/\/letters$/); await page.waitForTimeout(300);
	await page.getByRole('link', { name: '편지 쓰기' }).click(); await page.waitForURL('**/letters/new');
	const search = page.getByRole('searchbox', { name: '편지 받을 학생 찾기' });
	check('받는 사람에게 나는 성별만 ("익명의 남학생")', (await page.locator('.hint').innerText()).includes('익명의 남학생'));
	await search.fill('박'); await page.waitForTimeout(400);
	check('한 글자로는 찾지 않는다', called(w, 'dm_search').length === 0 && (await page.locator('.person').count()) === 0);
	await search.fill('박받'); await page.waitForTimeout(600);
	const people = await page.locator('.person .who').allInnerTexts();
	check('★ 이름으로 찾기 — 동명이인은 학년 · 학번으로 구분', people.length === 2 && people[0].includes('2학년') && people[0].includes('학번 20314') && people[1].includes('학번 20522'), JSON.stringify(people));
	await page.locator('.person').first().click();
	await page.waitForFunction(() => document.querySelector('.compose')?.getAttribute('data-phase') === 'write', null, { timeout: 4000 });
	check('★ 편지지: To. 박받음 2학년 · From. 서명 칸 (비우면 익명의 남학생)', (await page.locator('.letter-paper .lp-to').innerText()).replace(/\s+/g, '').startsWith('To.박받음2학년')
		&& (await page.locator('.letter-paper .nick').getAttribute('placeholder')) === '익명의 남학생');
	await page.waitForTimeout(700);
	check('★ 쓰는 동안 봉투는 화면에서 치운다 (키보드가 올라와도 가리지 않게)', await page.locator('.env-wrap').evaluate((e) => getComputedStyle(e).opacity === '0'));
	await page.locator('.letter-paper .nick').fill('  노란   우산 ');
	check('서식 도구 막대', (await page.getByRole('toolbar', { name: '서식' }).getByRole('button').count()) >= 10);
	const editor = page.getByRole('textbox', { name: '편지 내용' });
	await editor.fill('안녕 박받음! 오늘 발표 멋있었어');
	await editor.evaluate((el) => {
		const node = el.querySelector('p').firstChild, i = node.textContent.indexOf('발표');
		const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 2);
		const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
	});
	await page.waitForTimeout(100);
	await page.getByRole('button', { name: '굵게' }).click();
	await page.getByRole('button', { name: '형광펜', exact: true }).click();
	await page.getByRole('button', { name: '형광펜 노랑' }).click();
	await page.waitForTimeout(100);
	await page.screenshot({ path: `${SP}/letters-5a-compose.png` });
	await page.getByRole('button', { name: '봉투에 넣어 보내기' }).click();
	await page.waitForURL(/\/letters$/, { timeout: 5000 });
	const sent = called(w, 'dm_send').at(-1)?.[1];
	check('★ 고른 사람(계정 id)에게 · 서명(앞뒤 공백 정리) · 서식은 본문과 따로', sent?.p_to === 'u-b' && sent?.p_body === '안녕 박받음! 오늘 발표 멋있었어' && sent?.p_nick === '노란   우산'
		&& JSON.stringify(sent?.p_fmt?.m?.slice().sort()) === JSON.stringify([[11, 13, 'b'], [11, 13, 'h:yellow']]), JSON.stringify(sent));
	await page.waitForTimeout(1600);
	check('보낸 뒤 알림 · AI 검토 요청', w.calls.some((c) => c[0] === 'api' && c[1] === '/api/push' && c[2]?.dm_msg_id) && w.calls.some((c) => c[0] === 'api' && c[1] === '/api/moderate'));
	await page.goto(`${BASE}/letters/archive`); await page.locator('.rows .row').first().waitFor();
	await page.getByRole('tab', { name: '보낸 편지' }).click(); await page.waitForTimeout(300);
	await page.locator('.rows .row').first().click(); await page.waitForURL(/\/letters\/m\/\d+$/); await page.locator('.letter-paper').waitFor();
	check('★ 보낸 편지 열기: 연출 없이 · To. 박받음 2학년 · 서식 그대로 · 아직 안 읽음', (await page.locator('.stage').count()) === 0 && (await page.locator('.letter-paper .rt-b').innerText()) === '발표'
		&& (await page.locator('.note').innerText()).includes('아직 봉투를 열지 않았어요'));
	await page.screenshot({ path: `${SP}/letters-5b-sent-read.png` });

	console.log('[메뉴 · 신고]');
	await page.goto(`${BASE}/letters/m/60`); await page.locator('.letter-paper').waitFor();
	await page.getByRole('button', { name: '메뉴' }).click(); await page.waitForTimeout(300);
	check('메뉴: 신고 · 차단 · 나가기 · 취소', (await page.locator('.sheet .item').allInnerTexts()).join(',') === '신고하기,차단하기,나가기,취소');
	await page.locator('.sheet .item', { hasText: '나가기' }).click(); await page.waitForTimeout(200);
	check('모르는 사람의 편지에서 나가면 "다시 편지를 보낼 수 없어요"', (await page.locator('.sheet .warn').innerText()).includes('다시 편지를 보낼 수 없어요'));
	await page.locator('.sheet .item', { hasText: '취소' }).click(); await page.waitForTimeout(300);
	await page.getByRole('button', { name: '메뉴' }).click(); await page.waitForTimeout(200);
	await page.locator('.sheet .item', { hasText: '신고하기' }).click(); await page.waitForTimeout(300);
	check('신고 시트: 사유 7개', (await page.locator('.reason').count()) === 7);
	await page.locator('.reason', { hasText: '욕설' }).click();
	await page.locator('.sheet .item.danger', { hasText: '신고하기' }).click();
	await page.waitForURL(/\/letters$/, { timeout: 4000 }); await page.waitForTimeout(500);
	check('★ 신고 → 편지 줄기로 신고 · 편지함에서 사라진다', JSON.stringify(called(w, 'dm_report').at(-1)?.[1]) === JSON.stringify({ p_thread: 8, p_reason: 'harassment', p_note: '' })
		&& !(await page.locator('.stack .item').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).some((l) => l.includes('익명의 남학생')));

	console.log('[길게 누르기 · 나가기]');
	await page.goto(`${BASE}/letters/archive`); await page.locator('.rows .row').first().waitFor();
	await page.getByRole('tab', { name: '보낸 편지' }).click(); await page.waitForTimeout(300);
	const row = page.locator('.rows .row').last();
	const box = await row.boundingBox();
	const at = { clientX: box.x + 60, clientY: box.y + box.height / 2, pointerType: 'touch', button: 0, isPrimary: true, pointerId: 5 };
	await row.dispatchEvent('pointerdown', at); await page.waitForTimeout(650);
	await row.dispatchEvent('pointerup', at); await row.dispatchEvent('click'); await page.waitForTimeout(300);
	check('★ 길게 누르면 메뉴 (열리지 않는다)', new URL(page.url()).pathname === '/letters/archive' && (await page.locator('.sheet .item').allInnerTexts()).join(',') === '신고하기,차단하기,나가기,취소');
	await page.locator('.sheet .item', { hasText: '나가기' }).click(); await page.waitForTimeout(200);
	check('내가 이름으로 보낸 편지에서 나가기엔 "다시 못 보냄" 없음', !(await page.locator('.sheet .warn').innerText()).includes('다시 편지를 보낼 수 없어요'));
	await page.locator('.sheet .item.danger', { hasText: '나가기' }).click(); await page.waitForTimeout(700);
	check('★ 나가면 그 사람과의 편지가 보관함에서 사라진다', called(w, 'dm_close').at(-1)?.[1]?.p_thread === 9 && !(await page.locator('.rows .row').allInnerTexts()).some((l) => l.includes('박받음')));

	console.log('[예전 주소 · 대화 목록 길게 누르기]');
	await page.goto(`${BASE}/letters/7`); await page.waitForTimeout(800);
	check('예전 편지 주소(/letters/7) → 편지함', new URL(page.url()).pathname === '/letters');
	await page.goto(`${BASE}/`); await page.locator('button.room').first().waitFor({ timeout: 8000 });
	await page.locator('button.room').first().click({ button: 'right' }); await page.waitForTimeout(300);
	check('대화 줄 오른쪽 클릭 → 신고 · 차단 · 나가기', (await page.locator('.sheet .item').allInnerTexts()).join(',') === '신고하기,차단하기,대화 나가기,취소');
	await page.keyboard.press('Escape');

	console.log('[설정 · 편지 받기]');
	await page.goto(`${BASE}/settings`);
	const sw = page.getByRole('switch', { name: '편지 받기' });
	await sw.waitFor();
	check('편지 받기 — 기본 켜짐', await sw.isChecked());
	await sw.click(); await page.waitForTimeout(500);
	check('★ 끄면 letters_open = false 로 저장', JSON.stringify(w.patches.at(-1)) === '{"letters_open":false}' && !(await sw.isChecked()));
	await page.locator('a.legal-row', { hasText: '개인정보 처리방침' }).click(); await page.waitForURL('**/settings/privacy'); await page.locator('article h1').waitFor();
	check('개인정보 처리방침: 편지 받는 사람에게 성별이 보임', (await page.locator('article').innerText()).includes('성별'));
	check('페이지 오류 없음', errors.length === 0, errors.join(' / '));

	console.log('[동작 줄이기]');
	const w3 = world();
	const r3 = await openApp(browser, w3, { reducedMotion: 'reduce' });
	await r3.page.goto(`${BASE}/letters/m/70`); await r3.page.locator('.letter-paper').waitFor({ timeout: 3000 });
	check('★ 동작 줄이기: 처음 여는 편지도 연출 없이 바로 편지지', (await r3.page.locator('.stage').count()) === 0);
	await r3.page.getByRole('button', { name: '편지로 답장 쓰기' }).click();
	await r3.page.getByRole('textbox', { name: '편지 내용' }).waitFor({ timeout: 3000 });
	check('동작 줄이기: 바로 쓰는 칸', (await phase(r3.page)) === 'write');
	await r3.page.getByRole('textbox', { name: '편지 내용' }).fill('짧게');
	await r3.page.getByRole('button', { name: '봉투에 넣어 보내기' }).click();
	await r3.page.waitForURL(/\/letters$/, { timeout: 3000 });
	check('동작 줄이기: 보내면 바로 편지함', called(w3, 'dm_reply_to').length === 1);
	check('페이지 오류 없음 (동작 줄이기)', r3.errors.length === 0, r3.errors.join(' / '));
	await r3.ctx.close();

	console.log('[당겨서 새로고침]');
	const w4 = world();
	const r4 = await openApp(browser, w4);
	const pg = r4.page;
	await pg.goto(`${BASE}/letters`); await pg.locator('.stack .item').first().waitFor(); await pg.waitForTimeout(400);
	const cdp = await pg.context().newCDPSession(pg);
	const drag = async (dist) => {
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 160 }] });
		for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 160 + (dist * i) / 12 }] });
	};
	let reloaded = false; pg.once('load', () => (reloaded = true));
	await drag(60);
	check('조금 당기면 동그라미만 따라온다 (새로고침 아님)', (await pg.locator('.ptr.dragging').count()) === 1 && (await pg.locator('.ptr.ready').count()) === 0);
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pg.waitForTimeout(500);
	check('놓으면 제자리로 · 새로고침 안 함', !reloaded && (await pg.locator('.ptr.busy').count()) === 0);
	await drag(320);
	check('★ 충분히 당기면 준비 표시', (await pg.locator('.ptr.ready').count()) === 1);
	const load = pg.waitForEvent('load', { timeout: 8000 }).then(() => true, () => false);
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	check('★ 맨 위에서 당겼다 놓으면 앱을 다시 불러온다', await load);
	await pg.locator('.stack .item').first().waitFor(); await pg.waitForTimeout(400);
	check('다시 불러와도 편지함 그대로 (로그인 유지)', new URL(pg.url()).pathname === '/letters' && (await pg.locator('.stack .item').count()) === 2);
	check('페이지 오류 없음 (새로고침)', r4.errors.length === 0, r4.errors.join(' / '));
	await r4.ctx.close();

	console.log('[명단에 없는 학생 — 이름 적기]');
	const w2 = world({ named: false });
	const two = await openApp(browser, w2);
	await two.page.waitForURL('**/onboarding', { timeout: 8000 }).catch(() => {});
	check('★ 이름이 없으면 시작 화면으로 (이미 가입했어도)', new URL(two.page.url()).pathname === '/onboarding', two.page.url());
	await two.page.getByRole('textbox', { name: '내 이름' }).fill('이외부');
	await two.page.getByRole('button', { name: '저장' }).click();
	await two.page.waitForURL(`${BASE}/`, { timeout: 8000 }).catch(() => {});
	check('★ 적으면 저장하고 홈으로', called(w2, 'set_my_name').at(-1)?.[1]?.p_name === '이외부' && new URL(two.page.url()).pathname === '/', two.page.url());
	check('페이지 오류 없음 (둘째)', two.errors.length === 0, two.errors.join(' / '));
} finally {
	await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
