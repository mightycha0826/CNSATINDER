import { ROOT, CHROME, OUT } from './_env.mjs';
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
// 학생 앱 시트(Sheet · ReportPicker · BackButton) — 대화방 미리보기에서 열고 닫고 신고까지 (편지 시트는 letters 스위트)
const SP = OUT, PORT = 5196, TAG = process.env.TAG ?? 'after';
const env = { ...process.env, PUBLIC_SUPABASE_URL: 'https://fake-proj.supabase.co', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest' };
const vite = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; vite.stdout.on('data', (d) => (out += d));
for (let i = 0; i < 60 && !out.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const browser = await chromium.launch({ executablePath: CHROME });
try {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
	const page = await ctx.newPage();
	const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
	const U = (p) => `http://localhost:${PORT}${p}`;

	console.log('[대화방]');
	await page.goto(U('/dev/chat?s=chat&sheet=report')); await page.waitForTimeout(1200);
	await page.screenshot({ path: `${SP}/sheet-${TAG}-chat-report.png` });
	check('신고 시트: 사유 7개', (await page.locator('.reason').count()) === 7);
	check('신고 버튼은 사유 고르기 전엔 꺼짐', await page.getByRole('button', { name: '신고하기' }).isDisabled());
	await page.locator('.reason', { hasText: '욕설·괴롭힘' }).click();
	check('사유 고르면 켜짐 + 표시', !(await page.getByRole('button', { name: '신고하기' }).isDisabled()) && (await page.locator('.reason.on').innerText()) === '욕설·괴롭힘');
	await page.locator('textarea.note').fill('메모');
	await page.getByRole('button', { name: '신고하기' }).click(); await page.waitForTimeout(800);
	check('신고하면 시트 닫힘', (await page.locator('.scrim').count()) === 0);

	await page.goto(U('/dev/chat?s=chat&sheet=menu')); await page.waitForTimeout(1000);
	await page.screenshot({ path: `${SP}/sheet-${TAG}-chat-menu.png` });
	check('메뉴 5개', (await page.locator('.sheet .item').count()) === 5);
	await page.mouse.click(195, 100); await page.waitForTimeout(300);
	check('바깥 누르면 닫힘', (await page.locator('.scrim').count()) === 0);
	await page.goto(U('/dev/chat?s=chat&sheet=block')); await page.waitForTimeout(1000);
	await page.keyboard.press('Escape'); await page.waitForTimeout(300);
	check('Esc 로 닫힘', (await page.locator('.scrim').count()) === 0);
	await page.goto(U('/dev/chat?s=chat&sheet=profile')); await page.waitForTimeout(1200);
	await page.screenshot({ path: `${SP}/sheet-${TAG}-chat-profile.png` });
	check('프로필 시트 + 닫기', (await page.locator('.sheet .profile').count()) === 1 && (await page.getByRole('button', { name: '닫기' }).count()) === 1);
	await page.getByRole('button', { name: '닫기' }).click(); await page.waitForTimeout(300);
	check('뒤로 버튼 있음', (await page.locator('button.back[aria-label="뒤로"]').count()) === 1);
	check('카운트다운 mm:ss', /^\d\d:\d\d$/.test((await page.locator('.topbar .num').first().innerText().catch(() => '')).trim()), await page.locator('.topbar').innerText());

	check('페이지 오류 없음', errs.length === 0, errs.join(' / '));
} finally {
	await browser.close(); vite.kill();
	try { execSync("pkill -f 'vite dev --port 5196'"); } catch {}
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
