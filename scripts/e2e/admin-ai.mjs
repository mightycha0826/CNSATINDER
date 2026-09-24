import { ROOT, CHROME, OUT } from './_env.mjs';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

/** 운영자 화면 — AI 자동 감지 신고 · 검열봇/AI 대화 설정 · 금칙어 (가짜 Supabase RPC + 서명 쿠키) */
const SECRET = 'e2e-secret-'.padEnd(48, 'z');
const SB = 'http://127.0.0.1:54395';
const PORT = 5187;
const STAFF = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROOM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const HUMAN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const t = new Date().toISOString();
const calls = [];
let settings = { is_open: true, notice: '', room_minutes: 10, extend_minutes: 10, vote_window_sec: 90, max_rounds: 0, rematch_cooldown_days: 7, auto_suspend_reports: 3, max_open_rooms: 5,
	ai_moderation: false, ai_mod_daily_cap: 250, ai_chat: false, ai_chat_per_user: 3, ai_chat_daily_cap: 3, ai_chat_minutes: 10, ai_chat_max_turns: 30 };
let terms = ['섹\\s*스', '니\\s*애\\s*미'];
const row = (id, source, reporter) => ({ id, created_at: t, reason: source === 'auto' ? 'self_harm' : 'harassment', note: source === 'auto' ? '[자동 감지] "요즘 사라지고 싶어" — 위기 신호' : '욕했어요', status: 'open', reported_id: A, reporter_id: reporter, source, reported_30d: 1, evidence_count: 2, reported_status: 'active' });
const RPC = {
	admin_staff_role: () => 'admin',
	admin_stats: () => ({ open_reports: 2, reviewing: 0, open_letter_reports: 0, active_rooms: 1, seeking_now: 0, restricted_users: 0, rooms_24h: 1, letters_24h: 0, is_open: true }),
	admin_list_reports: () => [row(REP, 'auto', null), row(HUMAN, 'user', B)],
	admin_student_labels: () => ({}),
	admin_report: (a) => ({
		report: { ...row(a.p_id, a.p_id === REP ? 'auto' : 'user', a.p_id === REP ? null : B), room_id: ROOM, handled_by: null, handled_at: null, action_note: null },
		evidence: [{ ord: 1, sender: 1, body: '괜찮아요?', sent_at: t }, { ord: 2, sender: 2, body: '요즘 사라지고 싶어', sent_at: t }],
		reported: { status: 'active', strikes: 0, suspended_until: null, gender: 'm', created_at: t },
		history: [], reporter_filed: 0, reporter_dismissed: 0
	}),
	admin_log_identity_view: (a) => { calls.push(['log', a]); return null; },
	admin_roster_name: () => null,
	admin_get_settings: () => settings,
	admin_ai_usage: () => ({ mod_checked_today: 12, mod_flagged_today: 2, mod_pending: 3, ai_chats_today: 1, day_start: t }),
	admin_banned_terms: () => terms,
	admin_update_settings: (a) => { calls.push(['settings', a.p_patch]); settings = { ...settings, ...a.p_patch }; return settings; },
	admin_set_banned_terms: (a) => {
		calls.push(['terms', a.p_terms]);
		if (a.p_terms.some((x) => x.includes('('))) throw { status: 400, body: { message: 'bad_pattern:(깨진' } };
		terms = a.p_terms; return terms;
	}
};
const sb = http.createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
		if (req.url.startsWith('/auth/v1/admin/users/')) return send(200, { id: A, email: 'x@cnsa.hs.kr' });
		const fn = req.url.match(/^\/rest\/v1\/rpc\/([a-z_]+)/)?.[1];
		if (!fn || !RPC[fn]) return send(404, { message: `no mock ${req.url}` });
		try { send(200, RPC[fn](body ? JSON.parse(body) : {})); } catch (e) { send(e.status ?? 500, e.body ?? { message: String(e) }); }
	});
}).listen(54395);

const env = { ...process.env, SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'service-key-xxxxxxxxxxxx', PUBLIC_SUPABASE_URL: SB, PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest', ADMIN_SESSION_SECRET: SECRET };
const vite = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let out = '';
vite.stdout.on('data', (d) => (out += d));
for (let i = 0; i < 120 && !out.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const payload = `${STAFF}.${Math.floor(Date.now() / 1000) + 3600}`;
const cookie = `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
const browser = await chromium.launch({ executablePath: CHROME });
try {
	const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
	await ctx.addCookies([{ name: 'simbun_admin', value: cookie, domain: 'localhost', path: '/admin', httpOnly: true, sameSite: 'Strict' }]);
	const page = await ctx.newPage();
	const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
	page.on('dialog', (d) => d.accept());
	const U = (p) => `http://localhost:${PORT}${p}`;

	console.log('[자동 감지 신고]');
	await page.goto(U('/admin'));
	const rows = page.locator('tbody tr');
	await rows.first().waitFor();
	check('목록: 자동 감지에 "자동" 표시 · 위기 신호 사유', (await rows.nth(0).innerText()).includes('자동') && (await rows.nth(0).innerText()).includes('위기 신호'), await rows.nth(0).innerText());
	check('목록: 사람 신고에는 표시 없음', !(await rows.nth(1).innerText()).includes('자동'));

	await page.goto(U(`/admin/reports/${REP}`));
	await page.locator('.rnote').waitFor();
	check('상세: "AI 판정" 메모', (await page.locator('.rnote').innerText()).startsWith('AI 판정'));
	check('상세: 사본의 1 = "상대" (신고자 아님)', (await page.locator('.msgs .who').allInnerTexts()).join() === '상대,피신고자');
	check('상세: 신고자 칸 대신 AI 자동 감지 안내', (await page.getByText('AI 자동 감지 — 사람이 신고한 것이 아니에요').count()) === 1);
	check('상세: 신고자 계정 링크 없음', (await page.getByRole('link', { name: '신고자 계정 →', exact: true }).count()) === 0);
	check('상세: 조치 대상은 피신고자만', (await page.getByRole('radio', { name: '신고자' }).count()) + (await page.locator('option', { hasText: '신고자' }).count()) === 0);
	await page.getByRole('button', { name: '이메일 확인' }).click();
	const idCard = page.locator('section.a-card', { hasText: '신원 확인' });
	await idCard.locator('dt').first().waitFor();
	check('신원 확인: 피신고자 한 명만 기록 · 표시', calls.find((c) => c[0] === 'log')?.[1].p_users.length === 1 &&
		(await idCard.locator('dt').allInnerTexts()).join() === '피신고자', JSON.stringify(calls.find((c) => c[0] === 'log')));
	await page.screenshot({ path: `${OUT}/admin-ai-report.png`, fullPage: true });

	await page.goto(U(`/admin/reports/${HUMAN}`));
	await page.locator('.rnote').waitFor();
	check('사람 신고는 그대로 (신고자 메모 · 신고자 계정)', (await page.locator('.rnote').innerText()).startsWith('신고자 메모') && (await page.getByRole('link', { name: '신고자 계정 →', exact: true }).count()) === 1);

	console.log('[운영 설정 — AI]');
	await page.goto(U('/admin/settings'));
	await page.getByText('검열봇 · AI 대화 상대').waitFor();
	await page.waitForLoadState('networkidle'); // 하이드레이션 전에 누르면 체크가 되돌려진다
	check('오늘 사용량', (await page.locator('.usage').innerText()).replace(/\s+/g, ' ').includes('오늘 AI 검토 12건'));
	await page.getByLabel(/AI 검토 \(검열봇 2단\)/).check();
	await page.getByLabel(/AI 대화 상대/).check();
	await page.locator('input[name=ai_chat_daily_cap]').fill('5');
	await page.getByRole('button', { name: 'AI 설정 저장' }).click();
	await page.getByText('AI 설정 저장 완료').waitFor();
	const p = calls.filter((c) => c[0] === 'settings').at(-1)?.[1];
	check('AI 설정 저장 (켜기 · 한도)', p?.ai_moderation === true && p.ai_chat === true && p.ai_chat_daily_cap === 5 && p.ai_mod_daily_cap === 250, JSON.stringify(p));
	check('AI 저장이 다른 운영 수치를 건드리지 않는다', p && !('room_minutes' in p) && !('notice' in p));

	console.log('[금칙어]');
	const ta = page.locator('textarea[name=terms]');
	check('금칙어 목록이 한 줄에 하나', (await ta.inputValue()) === '섹\\s*스\n니\\s*애\\s*미');
	await ta.fill('섹\\s*스\n니\\s*애\\s*미\n  바보멍청이  \n\n');
	await page.getByRole('button', { name: '금칙어 저장' }).click();
	await page.getByText('금칙어 3개 저장 완료').waitFor();
	check('저장: 빈 줄 · 앞뒤 공백 정리', JSON.stringify(calls.filter((c) => c[0] === 'terms').at(-1)?.[1]) === JSON.stringify(['섹\\s*스', '니\\s*애\\s*미', '바보멍청이']));
	await ta.fill('(깨진');
	await page.getByRole('button', { name: '금칙어 저장' }).click();
	await page.getByText('올바른 패턴이 아니에요').waitFor();
	check('틀린 패턴은 안내', (await page.getByText('"(깨진" 는 올바른 패턴이 아니에요').count()) === 1);
	await page.screenshot({ path: `${OUT}/admin-ai-settings.png`, fullPage: true });
	check('페이지 오류 없음', errs.length === 0, errs.join(' | '));
} catch (e) { fail++; console.error(e); }
finally {
	await browser.close();
	try { process.kill(-vite.pid); } catch {}
	sb.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
