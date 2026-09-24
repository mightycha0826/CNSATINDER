import { ROOT, CHROME, OUT } from './_env.mjs';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

/** 운영자 화면 전체 점검 — 가짜 Supabase(RPC·Auth) + 실제 SvelteKit 서버 + 실제 브라우저 */
const SP = OUT;
const SECRET = 'e2e-secret-'.padEnd(48, 'z');
const SB = 'http://127.0.0.1:54398';
const PORT = 5195;
const STAFF = '11111111-1111-4111-8111-111111111111';
const id = (c) => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`;
const [A, B, ROOM, REP, LREP, BOOM] = ['a', 'b', 'c', 'd', 'e', '9'].map(id);
const t = new Date().toISOString();
let ROLE = 'admin';
const calls = [];

const user = (i, nick) => ({ id: i, nickname: nick, status: 'active', suspended_until: null, strikes: 0, verified: true, onboarded: true, created_at: t, online: false, last_seen: t, staff_role: null, reports_received: 1 });
const RPC = {
	admin_staff_role: () => ROLE,
	admin_stats: () => ({ open_reports: 1, reviewing: 0, open_letter_reports: 1, active_rooms: 1, seeking_now: 0, restricted_users: 0, rooms_24h: 3, letters_24h: 2, is_open: true }),
	admin_list_reports: () => [{ id: REP, created_at: t, reason: 'harassment', note: '욕했어요', status: 'open', reported_id: A, reporter_id: B, reported_30d: 1, evidence_count: 2, reported_status: 'active' }],
	admin_report: () => ({ report: { id: REP, created_at: t, reason: 'harassment', note: '욕했어요', status: 'open', reported_id: A, reporter_id: B, room_id: ROOM, handled_by: null, handled_at: null, action_note: null }, evidence: [{ ord: 1, sender: 2, body: '나쁜 말', sent_at: t }, { ord: 2, sender: 1, body: '그만해', sent_at: t }], reported: { status: 'active', strikes: 0, suspended_until: null, gender: 'm', created_at: t }, history: [], reporter_filed: 1, reporter_dismissed: 0 }),
	admin_set_report: () => null,
	admin_sanction: (a) => ({ status: 'active', strikes: 1, suspended_until: null }),
	admin_log_identity_view: () => null,
	admin_roster_name: (a) => (a.p_email?.startsWith('29999') ? '홍길동' : null),
	admin_list_letter_reports: () => [{ id: LREP, created_at: t, target_type: 'letter', letter_id: 7, comment_id: null, reason: 'spam', note: '', status: 'open', reported_id: A, reporter_id: B, reported_30d: 1, preview: '광고', reported_status: 'active' }],
	admin_letter_report: () => ({ report: { id: LREP, created_at: t, target_type: 'letter', letter_id: 7, comment_id: null, reason: 'spam', note: '', status: 'open', reported_id: A, reporter_id: B, handled_by: null, handled_at: null, action_note: null }, evidence: [{ ord: 1, kind: 'letter', alias: '맑은 하늘', body: '광고 편지', sent_at: t }], target: { letter_status: 'open', comment_status: null }, reported: { status: 'active', strikes: 0, suspended_until: null, created_at: t }, history: [], chat_reports: 0, reporter_filed: 1, reporter_dismissed: 0 }),
	admin_remove_letter_content: () => null,
	admin_set_letter_report: () => null,
	admin_find_users: () => [user(A, '푸른고래'), user(B, '작은별')],
	admin_student_labels: () => ({ [A]: '29999 홍길동', [B]: '19998' }),
	admin_user: () => ({ profile: { ...user(A, '푸른고래'), bio: '', interests: [], mbti: null, gender: 'm', want: 'f' }, online: false, last_seen: t, staff_role: null, counts: { rooms: 1, open_rooms: 0, letters: 1, comments: 0, reports_filed: 0, reports_dismissed: 0 }, chat_reports: [], letter_reports: [], history: [] }),
	admin_user_rooms: () => [],
	admin_user_letters: () => [{ letter_id: 7, alias: '맑은 하늘', is_author: true, status: 'open', created_at: t, preview: '광고 편지', my_comments: 0 }],
	admin_get_settings: () => ({ is_open: true, notice: '', room_minutes: 10, extend_minutes: 10, vote_window_sec: 60, max_rounds: 0, rematch_cooldown_days: 7, auto_suspend_reports: 3, max_open_rooms: 5 }),
	admin_update_settings: () => RPC.admin_get_settings(),
	admin_audit: () => [
		{ id: 1, staff_id: STAFF, action: 'remove_letter', target_user: null, report_id: LREP, detail: { letter_id: 7, comment_id: null }, created_at: t },
		{ id: 2, staff_id: null, action: 'roster_import', target_user: null, report_id: null, detail: { grade: 1, count: 373 }, created_at: t },
		{ id: 3, staff_id: STAFF, action: 'update_settings', target_user: null, report_id: null, detail: { is_open: false }, created_at: t },
		{ id: 4, staff_id: STAFF, action: 'view_identity', target_user: null, report_id: null, detail: { users: [A, B], via: 'label' }, created_at: t }
	],
	admin_live_users: () => [{ id: A, nickname: '푸른고래', status: 'active', suspended_until: null, onboarded: true, staff_role: null, online: true, last_seen: t, seeking: false, room_count: 0, rooms: [] }],
	admin_rooms: () => [],
	admin_room: (a) => {
		if (a.p_room === BOOM) throw { status: 500, body: { message: 'boom' } };
		return { room: { id: ROOM, status: 'active', round: 1, created_at: t, armed_at: t, expires_at: t, closed_at: null, close_reason: null, live: true }, members: [], messages: [] };
	},
	admin_letter_post: () => ({ letter: { id: 7, body: '광고 편지', fmt: null, status: 'open', reply_status: 'assigned', created_at: t, like_count: 2 }, participants: [], reader: null, comments: [] })
};

const sb = http.createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
		const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(o)); };
		if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
		const u = new URL(req.url, SB);
		if (u.pathname === '/auth/v1/token') {
			const now = Math.floor(Date.now() / 1000);
			return send(200, { access_token: 'staff-token', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r', user: { id: STAFF, aud: 'authenticated', email: '29999@cnsa.hs.kr', app_metadata: {}, user_metadata: {}, created_at: t } });
		}
		if (u.pathname === '/auth/v1/user') return send(200, { id: STAFF, aud: 'authenticated', email: '29999@cnsa.hs.kr', app_metadata: {}, user_metadata: {}, created_at: t });
		const au = u.pathname.match(/^\/auth\/v1\/admin\/users\/(.+)$/);
		if (au) return send(200, { id: au[1], email: au[1] === A ? '29999@cnsa.hs.kr' : '19998@cnsa.hs.kr', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: t });
		const fn = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)/)?.[1];
		if (!fn || !RPC[fn]) return send(404, { message: `no mock ${req.url}` });
		const args = body ? JSON.parse(body) : {};
		if (fn !== 'admin_staff_role') calls.push([fn, args]);
		try { send(200, RPC[fn](args)); } catch (e) { send(e.status ?? 500, e.body ?? { message: String(e) }); }
	});
}).listen(54398);

const env = { ...process.env, SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'service-key-xxxxxxxxxxxx', PUBLIC_SUPABASE_URL: SB, PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest', ADMIN_SESSION_SECRET: SECRET };
const vite = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
vite.stdout.on('data', (d) => (out += d));
vite.stderr.on('data', (d) => (out += d));
for (let i = 0; i < 60 && !out.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const cookie = () => { const p = `${STAFF}.${Math.floor(Date.now() / 1000) + 3600}`; return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}`; };
const since = () => { const n = calls.length; return () => calls.slice(n).map((c) => c[0]); };
const base = `http://localhost:${PORT}`;
const browser = await chromium.launch({ executablePath: CHROME });

async function session(width = 1200) {
	const ctx = await browser.newContext({ viewport: { width, height: 900 } });
	await ctx.addCookies([{ name: 'simbun_admin', value: cookie(), domain: 'localhost', path: '/admin', httpOnly: true, sameSite: 'Strict' }]);
	const page = await ctx.newPage();
	page.errs = [];
	page.on('pageerror', (e) => page.errs.push(String(e)));
	page.go = async (path) => {
		const r = await page.goto(base + path);
		await page.waitForSelector('body.admin', { timeout: 15000 });
	await page.waitForLoadState('networkidle');
		await page.waitForFunction(() => document.querySelector('#app')?.children.length, null, { timeout: 15000 });
		await page.waitForTimeout(150);
		return r;
	};
	return { ctx, page };
}
/** 확인창: answer 에 따라 수락/취소 */
const dialogs = (page, answer) => { page.removeAllListeners('dialog'); page.on('dialog', (d) => (answer() ? d.accept() : d.dismiss())); };

try {
	console.log('\n[1] 모든 화면이 열린다 (관리자)');
	const { page } = await session();
	for (const p of ['/admin', '/admin/live', '/admin/letters', '/admin/users', `/admin/users/${A}`, `/admin/reports/${REP}`, `/admin/letters/${LREP}`, '/admin/rooms', `/admin/rooms/${ROOM}`, '/admin/posts/7', '/admin/settings', '/admin/audit']) {
		const r = await page.go(p);
		check(`${p} → 200`, r.status() === 200, String(r.status()));
	}
	check('페이지 오류 없음', page.errs.length === 0, page.errs.join(' / '));

	console.log('\n[2] ★ 확인창에서 "취소"하면 아무것도 보내지 않는다');
	await page.go(`/admin/reports/${REP}`);
	let answer = false;
	dialogs(page, () => answer);
	let got = since();
	await page.getByRole('button', { name: '조치하기' }).click();
	await page.waitForTimeout(600);
	check('제재 취소 → admin_sanction 안 부름', !got().includes('admin_sanction'), got().join());
	got = since();
	await page.getByRole('button', { name: '이메일 확인' }).click();
	await page.waitForTimeout(600);
	check('이메일 확인 취소 → 기록·조회 안 함', !got().includes('admin_log_identity_view'), got().join());
	check('취소하면 이메일이 안 보인다', !(await page.getByText('29999@cnsa.hs.kr').count()));

	console.log('\n[3] 수락하면 실행');
	answer = true;
	await page.locator('select[name=action]').selectOption('warn');
	await page.getByRole('radio', { name: '신고자', exact: true }).check();
	got = since();
	await page.getByRole('button', { name: '조치하기' }).click();
	await page.getByText('조치 완료').waitFor({ timeout: 5000 }).catch(() => {});
	const sc = calls.filter((c) => c[0] === 'admin_sanction').at(-1)?.[1];
	check('제재 실행 — 고른 대상·조치 그대로', sc?.p_user === B && sc?.p_action === 'warn', JSON.stringify(sc));
	check('조치 뒤에도 고른 조치·대상이 유지된다', (await page.locator('select[name=action]').inputValue()) === 'warn' && (await page.getByRole('radio', { name: '신고자', exact: true }).isChecked()));
	await page.getByRole('button', { name: '이메일 확인' }).click();
	await page.getByText('29999@cnsa.hs.kr').waitFor({ timeout: 5000 }).catch(() => {});
	const idText = (await page.locator('dl').last().innerText()).replace(/\s+/g, ' ');
	check('이메일 + 명렬표 이름', idText.includes('29999@cnsa.hs.kr') && idText.includes('(홍길동)') && idText.includes('19998@cnsa.hs.kr'), idText);
	check('이름 괄호 앞에 간격', (await page.locator('dl .rname').first().evaluate((e) => parseFloat(getComputedStyle(e).marginLeft))) >= 3);
	check('열람 기록이 먼저', calls.findIndex((c) => c[0] === 'admin_log_identity_view') < calls.findIndex((c) => c[0] === 'admin_roster_name'));
	await page.getByRole('button', { name: '검토 시작' }).click();
	await page.waitForTimeout(600);
	check('상태 변경 버튼', calls.some((c) => c[0] === 'admin_set_report' && c[1].p_status === 'reviewing'));

	console.log('\n[4] 편지 신고 — 내리기 확인창');
	await page.go(`/admin/letters/${LREP}`);
	answer = false;
	got = since();
	await page.getByRole('button', { name: '편지 내리기' }).click();
	await page.waitForTimeout(600);
	check('★ 내리기 취소 → 안 내림', !got().includes('admin_remove_letter_content'), got().join());
	answer = true;
	await page.getByRole('button', { name: '편지 내리기' }).click();
	await page.waitForTimeout(800);
	check('내리기 수락 → 내림', calls.some((c) => c[0] === 'admin_remove_letter_content'));

	console.log('\n[5] 사용자 상세 — 편지·댓글 보기 확인창');
	await page.go(`/admin/users/${A}`);
	answer = false;
	got = since();
	await page.getByRole('button', { name: '편지 · 댓글 보기' }).click();
	await page.waitForTimeout(600);
	check('★ 취소 → 편지 활동 조회 안 함', !got().includes('admin_user_letters'));
	answer = true;
	await page.getByRole('button', { name: '편지 · 댓글 보기' }).click();
	await page.getByText('#7 광고 편지').waitFor({ timeout: 5000 }).catch(() => {});
	check('수락 → 편지 목록', await page.getByText('#7 광고 편지').isVisible());

	console.log('\n[6] 운영 설정');
	await page.go('/admin/settings');
	answer = false;
	got = since();
	await page.getByRole('button', { name: '서비스 닫기' }).click();
	await page.waitForTimeout(600);
	check('★ 서비스 닫기 취소 → 안 닫음', !got().includes('admin_update_settings'));
	await page.locator('input[name=room_minutes]').fill('12');
	await page.getByRole('button', { name: '저장' }).click();
	await page.getByText('저장 완료').waitFor({ timeout: 5000 }).catch(() => {});
	const save = calls.filter((c) => c[0] === 'admin_update_settings').at(-1)?.[1];
	check('저장은 확인창 없이 바로', save?.p_patch?.room_minutes === 12, JSON.stringify(save));

	console.log('\n[7] 활동 기록 — 원시 JSON 이 보이지 않는다');
	await page.go('/admin/audit');
	const audit = (await page.locator('tbody').innerText()).replace(/\s+/g, ' ');
	check('JSON 없음', !/[{}"]/.test(audit.replace(/"[^"]*"/g, '')), audit);
	check('명렬표 반영 · 1학년 373명', audit.includes('명렬표 반영') && audit.includes('1학년 373명'), audit);
	check('편지 내림 → 편지 #7 링크', (await page.locator('a[href="/admin/posts/7"]').count()) === 1);
	check('설정 변경 → "서비스 닫기"', audit.includes('서비스 닫기'), audit);
	check('학번·이름 열람 표시', audit.includes('2명 학번·이름'), audit);

	console.log('\n[8] 오류 화면');
	const er = await page.goto(`${base}/admin/rooms/${BOOM}`);
	await page.waitForTimeout(500);
	const errText = await page.locator('main').innerText();
	check('500 이어도 운영자 메뉴가 남는다', er.status() === 500 && (await page.locator('header.bar nav').count()) === 1, String(er.status()));
	check('오류 번호 안내', /서버 오류 \([0-9a-f]{8}\)/.test(errText), errText);
	const nf = await page.goto(`${base}/admin/users/not-a-uuid`);
	await page.waitForTimeout(300);
	check('없는 계정 → 404 안내', nf.status() === 404 && (await page.locator('main').innerText()).includes('찾을 수 없'), String(nf.status()));
	check('페이지 오류 없음', page.errs.length === 0, page.errs.join(' / '));

	console.log('\n[9] 서버에서 그릴 때부터 운영자 레이아웃');
	const html = await (await fetch(`${base}/admin/live`, { headers: { cookie: `simbun_admin=${cookie()}` } })).text();
	check('<body class="admin"> 로 내려온다', /<body class="admin"/.test(html));

	console.log('\n[10] 폰 화면 메뉴');
	const m = await session(390);
	await m.page.go('/admin/live');
	const heights = await m.page.locator('header.bar nav a').evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height));
	check('메뉴 글자가 줄바꿈되지 않는다', heights.every((h) => h < 40), heights.join());
	const tabH = await m.page.locator('nav.a-tabs a').evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height));
	check('화면 안 탭도 줄바꿈되지 않는다', tabH.length > 0 && tabH.every((h) => h < 48), tabH.join());
	const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	check('페이지가 옆으로 밀리지 않는다', overflow <= 1, String(overflow));
	await m.page.screenshot({ path: `${SP}/audit-mobile.png` });
	await m.page.go(`/admin/reports/${REP}`);
	await m.page.screenshot({ path: `${SP}/audit-mobile-report.png`, fullPage: true });
	await m.ctx.close();

	console.log('\n[11] 운영자 로그인이 학생 앱 로그인을 건드리지 않는다');
	const lctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
	const lp = await lctx.newPage();
	await lp.goto(`${base}/admin/login`);
	await lp.evaluate(() => localStorage.setItem('sb-127-auth-token', 'STUDENT-SESSION'));
	await lp.getByPlaceholder('학교 이메일 앞부분').fill('29999');
	await lp.getByPlaceholder('비밀번호').fill('abcd1234');
	await lp.getByRole('button', { name: '로그인' }).click();
	await lp.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 10000 }).catch(() => {});
	check('로그인 후 운영 화면으로', !lp.url().endsWith('/login'), lp.url());
	check('★ 학생 앱 세션이 그대로', (await lp.evaluate(() => localStorage.getItem('sb-127-auth-token'))) === 'STUDENT-SESSION');
	check('운영자 로그인이 브라우저에 저장되지 않는다', (await lp.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('admin')).length)) === 0);
	await lctx.close();

	console.log('\n[12] 운영진(moderator)');
	ROLE = 'moderator';
	const md = await session();
	for (const p of ['/admin', '/admin/live', '/admin/users', `/admin/users/${A}`, `/admin/reports/${REP}`, '/admin/settings', '/admin/audit']) {
		const r = await md.page.go(p);
		check(`${p} → 200`, r.status() === 200, String(r.status()));
	}
	const r403 = await md.page.goto(`${base}/admin/rooms`);
	await md.page.waitForTimeout(300);
	check('관리자 전용 → 403 안내', r403.status() === 403 && (await md.page.locator('main').innerText()).includes('권한 없음'));
	await md.page.go('/admin/settings');
	check('운영진: 수치 입력칸 잠김', await md.page.locator('input[name=room_minutes]').isDisabled());
	check('페이지 오류 없음', md.page.errs.length === 0, md.page.errs.join(' / '));
} finally {
	await browser.close();
	vite.kill();
	sb.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
