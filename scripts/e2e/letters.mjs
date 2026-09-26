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
			{ id: 7, role: 'received', title: '푸른 우표', alias: '푸른 우표', recipient_name: '김보냄', mode: 'letter', grade: null, status: 'open', last_at: ago(5), unread: 2,
				msgs: [{ id: 70, mine: false, letter: true, body: '안녕! 너 그림 진짜 잘 그리더라', created_at: ago(8) }, { id: 71, mine: false, letter: true, body: '나중에 알려 줄게 ㅎㅎ', created_at: ago(5) }] },
			{ id: 8, role: 'received', title: '노란 편지지', alias: '노란 편지지', recipient_name: '김보냄', mode: 'letter', grade: null, status: 'open', last_at: ago(30), unread: 1,
				msgs: [{ id: 60, mine: false, letter: true, body: '시험 잘 봐!', created_at: ago(30) }] }
		],
		rooms: [{ room_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'active', my_seat: 1, partner_alias: '새벽수달', expires_at: new Date(Date.now() + 600_000).toISOString(), round: 1, joined: true, partner_online: false, last_body: '안녕', last_seat: 2, last_at: ago(1), unread: 0 }],
		wait: false
	};
	return w;
}
const inbox = (w) => ({ threads: w.threads.filter((t) => !t.hidden).map(({ msgs, hidden, alias, recipient_name, mode, ...t }) => ({ ...t, last_body: msgs.at(-1)?.body ?? null })), server_now: new Date().toISOString() });
const thread = (w, id) => {
	const t = w.threads.find((x) => x.id === id);
	if (!t || t.hidden) return { status: 'not_found' };
	t.unread = 0;
	return { status: 'ok', id: t.id, role: t.role, title: t.title, grade: t.grade, thread_status: t.status, closed_by: t.status === 'closed' ? (t.role === 'received' ? 'recipient' : 'sender') : null,
		mode: t.mode, alias: t.alias, recipient_name: t.recipient_name,
		wait_reply: w.wait, their_read: t.theirRead ?? 0, messages: t.msgs.map((m) => ({ ...m, removed: false })), server_now: new Date().toISOString() };
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
		if (rpc === 'my_rooms') return json({ rooms: w.rooms, server_now: new Date().toISOString() });
		if (rpc === 'leave_room' || rpc === 'block_partner' || rpc === 'report_partner') { w.rooms = w.rooms.filter((r) => r.room_id !== a.p_room); return json({ snap: {}, status: 'ok' }); }
		if (rpc === 'my_notices') return json({ notices: [], last_seen: 0 });
		if (rpc === 'dm_inbox') return json(inbox(w));
		if (rpc === 'dm_search') {
			const q = String(a.p_q ?? '');
			return json(q.length >= 2 && '박받음'.includes(q) ? [{ id: 'u-b', name: '박받음', grade: 2, checked: true }, { id: 'u-c', name: '박받음', grade: 3, checked: true }] : []);
		}
		if (rpc === 'dm_send') {
			const id = 100 + w.threads.length;
			w.threads.unshift({ id, role: 'sent', title: '박받음', alias: '빨간 우체통', recipient_name: '박받음', mode: 'letter', grade: 2, status: 'open', last_at: new Date().toISOString(), unread: 0, msgs: [{ id: id * 10, mine: true, letter: true, body: a.p_body, fmt: a.p_fmt ?? null, created_at: new Date().toISOString() }] });
			return json({ status: 'ok', thread_id: id, msg_id: id * 10 });
		}
		if (rpc === 'dm_thread') return json(thread(w, a.p_thread));
		if (rpc === 'dm_reply') {
			if (w.wait) return json({ status: 'wait_reply' });
			const t = w.threads.find((x) => x.id === a.p_thread);
			if (t.mode !== 'chat') return json({ status: 'letter_mode' });
			const mid = t.msgs.at(-1).id + 1;
			t.msgs.push({ id: mid, mine: true, body: a.p_body, created_at: new Date().toISOString() });
			return json({ status: 'ok', msg_id: mid });
		}
		if (rpc === 'dm_letter') {
			const t = w.threads.find((x) => x.id === a.p_thread);
			if (t.mode !== 'letter') return json({ status: 'chat_mode' });
			const mid = t.msgs.at(-1).id + 1;
			t.msgs.push({ id: mid, mine: true, letter: true, body: a.p_body, fmt: a.p_fmt ?? null, created_at: new Date().toISOString() });
			return json({ status: 'ok', msg_id: mid });
		}
		if (rpc === 'dm_chat') { const t = w.threads.find((x) => x.id === a.p_thread); t.mode = 'chat'; return json({ status: 'ok' }); }
		if (rpc === 'dm_close' || rpc === 'dm_block' || rpc === 'dm_report') {
			const t = w.threads.find((x) => x.id === a.p_thread); if (t) { t.status = 'closed'; t.hidden = true; } // 나가면 내 목록에서 사라진다 (Phase 25)
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
	check('★ 받은 편지: 보낸 사람은 가명만 ("익명 · " 없이) · ? 아바타', (await row.locator('.line1 b').innerText()) === '푸른 우표' && (await row.locator('.anon').count()) === 1);
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
	check('★ 편지지: To. 받는 사람 · From. 익명', (await page.locator('.letter-paper .lp-to').innerText()).startsWith('To. 박받음') && (await page.locator('.letter-paper .lp-from').innerText()).startsWith('From. 익명')
		&& (await page.locator('.foot').innerText()).includes('가명'));
	check('서식 도구 막대 (굵게 · 형광펜 · 글자색 · 크기 · 정렬)', await page.getByRole('toolbar', { name: '서식' }).isVisible()
		&& (await page.getByRole('toolbar', { name: '서식' }).getByRole('button').count()) >= 10);
	const editor = page.getByRole('textbox', { name: '편지 내용' });
	await editor.fill('안녕 박받음! 오늘 발표 멋있었어');
	// "발표" 만 골라 굵게 + 형광펜
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
	await page.screenshot({ path: `${SP}/letters-3-compose.png` });
	await page.getByRole('button', { name: '보내기' }).click();
	await page.waitForURL(/\/letters\/\d+$/);
	const sent = called(w, 'dm_send').at(-1)?.[1];
	check('★ 고른 사람(계정 id)에게 보낸다', sent?.p_to === 'u-b' && sent?.p_body === '안녕 박받음! 오늘 발표 멋있었어', JSON.stringify(sent));
	check('★ 서식은 본문과 따로 — "발표"(11~13) 굵게 · 노랑 형광펜', JSON.stringify(sent?.p_fmt?.m?.slice().sort()) === JSON.stringify([[11, 13, 'b'], [11, 13, 'h:yellow']]), JSON.stringify(sent?.p_fmt));
	await page.waitForTimeout(2000); // AI 검토 요청은 1.5초 모아서
	check('보낸 뒤 알림 · AI 검토 요청', w.calls.some((c) => c[0] === 'api' && c[1] === '/api/push' && c[2]?.dm_msg_id) && w.calls.some((c) => c[0] === 'api' && c[1] === '/api/moderate'));
	await page.locator('.letter-paper.mine').first().waitFor();
	check('보낸 편지 화면: 받는 사람 이름 · "나는 익명"', (await page.locator('.names b').innerText()) === '박받음' && (await page.locator('.names small').innerText()).includes('나는 익명'));
	check('★ 보낸 편지는 편지지로 — To. 박받음 · From. 내 가명', (await page.locator('.letter-paper.mine .lp-to').innerText()) === 'To. 박받음'
		&& (await page.locator('.letter-paper.mine .lp-from').innerText()) === 'From. 빨간 우체통' && (await page.locator('.letter-paper.mine .lp-body').innerText()).includes('발표 멋있었어'));
	check('★ 서식 그대로 (HTML 없이 표로)', (await page.locator('.letter-paper.mine .rt-b').innerText()) === '발표'
		&& (await page.locator('.letter-paper.mine .rt-b').getAttribute('style'))?.includes('background-color'));
	check('보낸 쪽 아래: 답장 기다리는 중 · 한 통 더 쓰기 (입력창 없음)', (await page.locator('.choose').innerText()).includes('답장을 기다리고') && (await page.getByRole('button', { name: '한 통 더 쓰기' }).count()) === 1
		&& (await page.getByRole('textbox', { name: '메시지' }).count()) === 0);
	await page.screenshot({ path: `${SP}/letters-3b-sent.png` });
	await page.locator('button.back').click(); await page.waitForURL(/\/letters$/); await page.locator('.tabs').waitFor(); await page.waitForTimeout(300);
	check('★ 보낸 편지에서 뒤로 → 보낸 편지 목록 (받은 편지로 튀지 않는다)', (await page.locator('.tabs button.on').innerText()).startsWith('보낸 편지')
		&& (await page.locator('.thread .line1 b').first().innerText()) === '박받음');

	console.log('[받은 편지 열기 · 답장]');
	await page.goto(`${BASE}/letters/7`); await page.locator('.letter-paper').first().waitFor(); await page.waitForTimeout(300);
	check('★ 받은 편지: 가명 "푸른 우표" · 누가 보냈는지 알 수 없다는 안내', (await page.locator('.names b').innerText()) === '푸른 우표' && (await page.locator('.names small').innerText()).includes('알 수 없어요'));
	check('★ 받은 편지는 편지지 — To. 내 이름 · From. 가명', (await page.locator('.letter-paper').count()) === 2 && (await page.locator('.letter-paper .lp-to').first().innerText()) === 'To. 김보냄'
		&& (await page.locator('.letter-paper .lp-from').first().innerText()) === 'From. 푸른 우표');
	check('편지 글은 선택 · 복사 가능', await page.locator('.letter-paper .lp-body').first().evaluate((e) => getComputedStyle(e).userSelect !== 'none'));
	check('★ 받은 사람이 고른다: 편지로 답장하기 · 채팅하기 (입력창은 아직 없음)', (await page.locator('.choose .btn').allInnerTexts()).join(',') === '편지로 답장하기,채팅하기'
		&& (await page.getByRole('textbox', { name: '메시지' }).count()) === 0);
	await page.screenshot({ path: `${SP}/letters-4a-choose.png` });
	await page.locator('.choose .btn', { hasText: '채팅하기' }).click(); await page.getByRole('textbox', { name: '메시지' }).waitFor();
	check('★ 채팅하기 → 채팅으로 바뀌고 입력창', JSON.stringify(called(w, 'dm_chat').at(-1)?.[1]) === '{"p_thread":7}' && (await page.locator('.choose').count()) === 0);
	await page.getByRole('textbox', { name: '메시지' }).fill('누구야?? 고마워');
	await page.getByRole('button', { name: '보내기' }).click(); await page.waitForTimeout(500);
	check('채팅 한 줄은 말풍선 (편지지는 위에 그대로)', called(w, 'dm_reply').at(-1)?.[1]?.p_body === '누구야?? 고마워' && (await page.locator('.row.mine .bubble').last().innerText()).includes('고마워')
		&& (await page.locator('.letter-paper').count()) === 2);
	check('★ 시간은 가장 최근 말 아래 한 줄만 (말마다 X)', (await page.locator('.when').count()) === 1
		&& (await page.locator('.when').innerText()) === '방금' && (await page.locator('.when').getAttribute('class')).includes('mine'), await page.locator('.when').allInnerTexts().then((x) => x.join('|')));
	w.threads.find((x) => x.id === 7).theirRead = 10_000;
	await page.reload(); await page.locator('.when').waitFor(); await page.waitForTimeout(300);
	check('★ 상대가 읽었으면 "읽음 · 방금"', (await page.locator('.when').innerText()) === '읽음 · 방금', await page.locator('.when').innerText());
	await page.screenshot({ path: `${SP}/letters-4-thread.png` });

	// 키보드: 안드로이드(resizes-content)는 키보드가 올라오면 화면 높이 자체가 줄어든다 — 창 높이를 줄여 흉내
	const t7 = w.threads.find((x) => x.id === 7);
	for (let i = 0; i < 10; i++) t7.msgs.push({ id: 80 + i, mine: i % 2 === 0, body: `긴 대화 ${i + 1}`, created_at: ago(1) });
	await page.reload(); await page.locator('.bubble', { hasText: '긴 대화 10' }).waitFor(); await page.waitForTimeout(400);
	const lastVisible = () => page.evaluate(() => {
		const list = document.querySelector('.list').getBoundingClientRect(), b = [...document.querySelectorAll('.bubble')].at(-1).getBoundingClientRect();
		return b.bottom <= list.bottom + 1 && b.top >= list.top;
	});
	check('긴 편지: 열면 맨 아래(최근 말)', await lastVisible());
	await page.getByRole('textbox', { name: '메시지' }).focus();
	await page.setViewportSize({ width: 390, height: 430 }); await page.waitForTimeout(400);
	await page.screenshot({ path: `${SP}/letters-4b-keyboard.png` });
	check('★ 키보드가 올라와도 최근 말이 가려지지 않는다', await lastVisible());
	check('입력창도 보이는 영역 안', await page.getByRole('textbox', { name: '메시지' }).evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight + 1));
	await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
	check('키보드가 내려가도 맨 아래 그대로', await lastVisible());
	w.wait = true;
	await page.reload(); await page.locator('.bubble').first().waitFor(); await page.waitForTimeout(300);
	check('답 없이 3개를 보냈으면 입력창 대신 안내', (await page.locator('.wait').count()) === 1 && (await page.getByRole('textbox', { name: '메시지' }).count()) === 0);
	w.wait = false;

	console.log('[편지로 답장하기]');
	await page.goto(`${BASE}/letters/8`); await page.locator('.letter-paper').first().waitFor(); await page.waitForTimeout(300);
	await page.locator('.choose .btn', { hasText: '편지로 답장하기' }).click(); await page.waitForURL('**/letters/8/write');
	await page.locator('.letter-paper .lp-to').waitFor();
	check('★ 답장 편지지: To. 가명 · From. 내 이름 (상대는 이미 내 이름을 안다)', (await page.locator('.letter-paper .lp-to').innerText()) === 'To. 노란 편지지'
		&& (await page.locator('.letter-paper .lp-from').innerText()) === 'From. 김보냄' && (await page.getByRole('toolbar', { name: '서식' }).count()) === 1);
	await page.getByRole('textbox', { name: '편지 내용' }).fill('고마워! 너도 잘 봐');
	await page.screenshot({ path: `${SP}/letters-4c-reply.png` });
	await page.getByRole('button', { name: '보내기' }).click(); await page.waitForURL(/\/letters\/8$/); await page.waitForTimeout(500);
	check('★ 편지로 답장 → 편지 화면에 내 편지지 · 답장 기다리는 중', JSON.stringify(called(w, 'dm_letter').at(-1)?.[1]) === JSON.stringify({ p_thread: 8, p_body: '고마워! 너도 잘 봐', p_fmt: null })
		&& (await page.locator('.letter-paper.mine .lp-body').innerText()).includes('너도 잘 봐') && (await page.locator('.choose').innerText()).includes('답장을 기다리고'), JSON.stringify(called(w, 'dm_letter')));
	await page.screenshot({ path: `${SP}/letters-4d-waiting.png` });
	await page.goto(`${BASE}/letters/7`); await page.locator('.letter-paper').first().waitFor(); await page.waitForTimeout(300);

	console.log('[메뉴 · 신고]');
	await page.getByRole('button', { name: '메뉴' }).click(); await page.waitForTimeout(300);
	check('메뉴: 신고 · 차단 · 나가기 · 취소', (await page.locator('.sheet .item').allInnerTexts()).join(',') === '신고하기,차단하기,나가기,취소');
	await page.locator('.sheet .item', { hasText: '나가기' }).click(); await page.waitForTimeout(200);
	check('받은 편지에서 나가면 "목록에서 사라지고 · 다시 보낼 수 없어요" 안내', (await page.locator('.sheet .warn').innerText()).includes('목록에서 사라지고') && (await page.locator('.sheet .warn').innerText()).includes('다시 편지를 보낼 수 없어요'));
	await page.locator('.sheet .item', { hasText: '취소' }).click(); await page.waitForTimeout(300);
	await page.getByRole('button', { name: '메뉴' }).click(); await page.waitForTimeout(200);
	await page.locator('.sheet .item', { hasText: '신고하기' }).click(); await page.waitForTimeout(300);
	check('신고 시트: 사유 7개 · 운영진이 보낸 사람을 확인한다는 안내', (await page.locator('.reason').count()) === 7 && (await page.locator('.report .warn').innerText()).includes('누가 보냈는지 확인'));
	await page.screenshot({ path: `${SP}/letters-5-report.png` });
	await page.locator('.reason', { hasText: '욕설' }).click();
	await page.locator('.sheet .item.danger', { hasText: '신고하기' }).click();
	await page.waitForFunction(() => location.pathname !== '/letters/7'); await page.waitForTimeout(300);
	check('★ 신고 → 편지 id · 사유로 신고하고 편지 화면을 나간다', JSON.stringify(called(w, 'dm_report').at(-1)?.[1]) === JSON.stringify({ p_thread: 7, p_reason: 'harassment', p_note: '' }), page.url());

	console.log('[목록에서 길게 누르기 · 나가기]');
	await page.goto(`${BASE}/letters`); await page.waitForTimeout(800);
	check('★ 신고한 편지는 내 목록에서 사라진다', !(await page.locator('.thread .line1 b').allInnerTexts()).includes('푸른 우표'));
	await page.locator('.tabs button', { hasText: '보낸 편지' }).click(); await page.waitForTimeout(200);
	const sentRow = page.locator('.thread').first();
	const sentTitle = await sentRow.locator('.line1 b').innerText();
	const box = await sentRow.boundingBox();
	const at = { clientX: box.x + 60, clientY: box.y + box.height / 2, pointerType: 'touch', button: 0, isPrimary: true, pointerId: 5 };
	await sentRow.dispatchEvent('pointerdown', at); await page.waitForTimeout(650);
	await sentRow.dispatchEvent('pointerup', at); await sentRow.dispatchEvent('click'); await page.waitForTimeout(300);
	check('★ 편지 줄을 길게 누르면 메뉴 (화면은 넘어가지 않는다)', new URL(page.url()).pathname === '/letters' && (await page.locator('.sheet .item').allInnerTexts()).join(',') === '신고하기,차단하기,나가기,취소'
		&& (await page.locator('.sheet .who').innerText()) === sentTitle);
	await page.screenshot({ path: `${SP}/letters-7-longpress.png` });
	await page.locator('.sheet .item', { hasText: '나가기' }).click(); await page.waitForTimeout(200);
	check('보낸 편지에서 나가기 안내에는 "다시 못 보냄" 없음', !(await page.locator('.sheet .warn').innerText()).includes('다시 편지를 보낼 수 없어요'));
	await page.locator('.sheet .item.danger', { hasText: '나가기' }).click(); await page.waitForTimeout(600);
	check('★ 나가면 목록에서 바로 사라진다', called(w, 'dm_close').length === 1 && (await page.locator('.thread').count()) === 0 && (await page.locator('.sheet').count()) === 0);
	await page.locator('.tabs button', { hasText: '받은 편지' }).click();

	console.log('[대화 목록에서 길게 누르기]');
	await page.goto(`${BASE}/`); await page.locator('button.room').first().waitFor({ timeout: 8000 });
	await page.locator('button.room').first().click({ button: 'right' }); await page.waitForTimeout(300);
	check('★ 대화 줄 오른쪽 클릭(길게 누르기) → 신고 · 차단 · 나가기', new URL(page.url()).pathname === '/' && (await page.locator('.sheet .item').allInnerTexts()).join(',') === '신고하기,차단하기,대화 나가기,취소'
		&& (await page.locator('.sheet .who').innerText()) === '새벽수달');
	await page.screenshot({ path: `${SP}/home-longpress.png` });
	await page.locator('.sheet .item', { hasText: '차단하기' }).click(); await page.waitForTimeout(200);
	await page.locator('.sheet .item.danger', { hasText: '차단하기' }).click(); await page.waitForTimeout(800);
	check('★ 차단 → 그 방으로 block_partner · 목록에서 사라짐', called(w, 'block_partner').at(-1)?.[1]?.p_room === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' && (await page.locator('button.room').count()) === 0);

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
	await page.locator('a.legal-row', { hasText: '개인정보 처리방침' }).click(); await page.waitForURL('**/settings/privacy'); await page.locator('article h1').waitFor();
	check('개인정보 처리방침: 익명편지에서 이름으로 검색될 수 있음', (await page.locator('.intro').innerText()).includes('이름과 학년으로 검색'));
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
