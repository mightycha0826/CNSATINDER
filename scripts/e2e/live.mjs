import { ROOT, CHROME, OUT } from './_env.mjs';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const SP = OUT;
const ROLE = process.env.ROLE ?? 'admin';
const SECRET = 'e2e-secret-'.padEnd(48, 'z');
const SB = 'http://127.0.0.1:54399';
const PORT = 5198;
const STAFF = '11111111-1111-4111-8111-111111111111';
const id = (c) => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`;
const [A, B, C, D, E] = ['a', 'b', 'c', 'd', 'e'].map(id);
const ROOM = id('f');
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();
const soon = new Date(Date.now() + 60_000).toISOString();
const base = { status: 'active', suspended_until: null, onboarded: true, staff_role: null, seeking: false, room_count: 0, rooms: [] };

// 처음 상태: A·B 대화 중(A 앱 켜짐), C 매칭 대기, D 접속 중, E 오프라인(정지)
let world = [
	{ ...base, id: A, nickname: '푸른고래', online: true, last_seen: soon, room_count: 1, rooms: [ROOM] },
	{ ...base, id: B, nickname: '작은별', online: false, last_seen: ago(3), room_count: 1, rooms: [ROOM] },
	{ ...base, id: C, nickname: '노란우산', online: true, last_seen: soon, seeking: true },
	{ ...base, id: D, nickname: '초록나무', online: true, last_seen: soon },
	{ ...base, id: E, nickname: '회색구름', online: false, last_seen: ago(180), status: 'suspended', suspended_until: soon }
];
let liveCalls = 0, labelCalls = 0;
const RPC = {
	admin_staff_role: () => ROLE,
	admin_live_users: () => {
		liveCalls++;
		return world.map((u) => ({ ...u, rooms: ROLE === 'admin' ? u.rooms : null }));
	},
	admin_student_labels: () => {
		labelCalls++;
		if (ROLE !== 'admin') throw { status: 400, body: { message: 'admin_only' } };
		return { [A]: '29999 홍길동', [B]: '19998 김철수', [C]: '10101 곽채은' };
	}
};
const sb = http.createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		const fn = req.url.match(/^\/rest\/v1\/rpc\/([a-z_]+)/)?.[1];
		const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (!fn || !RPC[fn]) return send(404, { message: `no mock ${req.url}` });
		try { send(200, RPC[fn](body ? JSON.parse(body) : {})); } catch (e) { send(e.status ?? 500, e.body ?? { message: String(e) }); }
	});
}).listen(54399);

const env = { ...process.env, SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'service-key-xxxxxxxxxxxx', PUBLIC_SUPABASE_URL: SB, PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest', ADMIN_SESSION_SECRET: SECRET };
const vite = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
vite.stdout.on('data', (d) => (out += d));
vite.stderr.on('data', (d) => (out += d));
for (let i = 0; i < 60 && !out.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const payload = `${STAFF}.${Math.floor(Date.now() / 1000) + 3600}`;
const cookie = `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
const browser = await chromium.launch({ executablePath: CHROME });
try {
	const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
	await ctx.addCookies([{ name: 'simbun_admin', value: cookie, domain: 'localhost', path: '/admin', httpOnly: true, sameSite: 'Strict' }]);
	const page = await ctx.newPage();
	const errs = [];
	page.on('pageerror', (e) => errs.push(String(e)));
	console.log(`\n[${ROLE}]`);
	const r = await page.goto(`http://localhost:${PORT}/admin/live`);
	await page.waitForSelector('body.admin', { timeout: 15000 });
	await page.waitForLoadState('networkidle');
	check('200', r.status() === 200, String(r.status()));
	const rowText = async () => (await page.locator('tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
	const tabText = async () => (await page.locator('nav.a-tabs').innerText()).replace(/\s+/g, ' ');
	await page.screenshot({ path: `${SP}/live-${ROLE}-1.png`, fullPage: true });

	check('메뉴에 "실시간"이 있고 선택됨', (await page.locator('nav a.on', { hasText: '실시간' }).count()) === 1);
	const tabs = await tabText();
	check('탭별 인원', /전체 5/.test(tabs) && /대화 중 2/.test(tabs) && /매칭 대기 1/.test(tabs) && /접속 중 1/.test(tabs) && /오프라인 1/.test(tabs) && /이용 제한 1/.test(tabs), tabs);
	let rows = await rowText();
	check('정렬: 대화 중 → 매칭 대기 → 접속 중 → 오프라인', /^대화 중/.test(rows[0]) && /^대화 중/.test(rows[1]) && /^매칭 대기/.test(rows[2]) && /^접속 중/.test(rows[3]) && /^오프라인/.test(rows[4]), rows.join(' | '));
	check('대화 중끼리는 최근 접속순 (앱 켜진 푸른고래 먼저)', rows[0].includes('푸른고래'), rows[0]);
	check('오프라인 사용자는 마지막 접속 시간', /3시간 전/.test(rows[4]), rows[4]);
	check('정지 표시', /정지/.test(rows[4]), rows[4]);
	if (ROLE === 'admin') {
		check('학번·이름 표시', rows[0].includes('(29999 홍길동)'), rows[0]);
		check('관리자: 대화 열기 링크', (await page.locator(`a[href="/admin/rooms/${ROOM}"]`).count()) === 2);
		await page.getByPlaceholder('익명 이름, 학번, 이름').fill('곽채은');
		rows = await rowText();
		check('실명으로 검색', rows.length === 1 && rows[0].includes('노란우산'), rows.join(' | '));
		await page.getByPlaceholder('익명 이름, 학번, 이름').fill('');
	} else {
		check('운영진: 학번·이름 없음', !rows.join().includes('홍길동'), rows[0]);
		check('운영진: 방 링크 대신 개수', (await page.locator('a[href^="/admin/rooms/"]').count()) === 0 && rows[0].includes('1개'), rows[0]);
	}

	await page.locator('nav.a-tabs a', { hasText: '매칭 대기' }).click();
	rows = await rowText();
	check('탭 누르면 그 상태만', rows.length === 1 && rows[0].includes('노란우산'), rows.join(' | '));
	await page.locator('nav.a-tabs a', { hasText: '전체' }).click();

	// ── 자동 갱신: 서버 상태를 바꾸고 새로고침 없이 기다린다
	const labelsBefore = labelCalls;
	world = world.map((u) => (u.id === D ? { ...u, online: false, last_seen: ago(0) } : u.id === C ? { ...u, seeking: false, room_count: 1, rooms: [id('9')] } : u));
	await page.waitForFunction(() => document.querySelector('nav.a-tabs')?.textContent?.replace(/\s+/g, ' ').includes('매칭 대기 0'), null, { timeout: 15000 }).catch(() => {});
	const tabs2 = await tabText();
	check('★ 10초 안에 새로고침 없이 상태 반영', /대화 중 3/.test(tabs2) && /매칭 대기 0/.test(tabs2) && /접속 중 0/.test(tabs2) && /오프라인 2/.test(tabs2), tabs2);
	check('★ 자동 갱신은 학번·이름을 다시 부르지 않는다 (활동 기록이 쌓이지 않음)', labelCalls === labelsBefore, `${labelsBefore}→${labelCalls}`);
	check('상태 RPC 는 여러 번 불림', liveCalls >= 2, String(liveCalls));
	await page.screenshot({ path: `${SP}/live-${ROLE}-2.png`, fullPage: true });
	check('페이지 오류 없음', errs.length === 0, errs.join(' / '));
} finally {
	await browser.close();
	vite.kill();
	sb.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
