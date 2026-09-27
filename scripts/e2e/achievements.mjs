import { ROOT, CHROME, OUT } from './_env.mjs';
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
// 업적 (Phase 31) — /dev/achievements 미리보기 · 상대 프로필의 대표 업적(/dev/chat)
const SP = OUT, PORT = 5185;
const env = { ...process.env, PUBLIC_SUPABASE_URL: 'https://fake-proj.supabase.co', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest' };
const vite = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; vite.stdout.on('data', (d) => (out += d));
for (let i = 0; i < 60 && !out.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const browser = await chromium.launch({ executablePath: CHROME });
const U = (p) => `http://localhost:${PORT}${p}`;
try {
	const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
	const errs = []; page.on('pageerror', (e) => errs.push(String(e)));

	console.log('[업적 화면]');
	await page.goto(U('/dev/achievements')); await page.locator('.grid').waitFor(); await page.waitForTimeout(400);
	check('요약: 모은 업적 수 · 금 · 은 · 동', (await page.locator('.summary').innerText()).replace(/\s+/g, ' ').includes('9 / 12') && (await page.locator('.metals').innerText()).replace(/\s+/g, '') === '금2은3동4', await page.locator('.summary').innerText());
	check('대표 업적 3칸', (await page.locator('.featured .slot [role="img"]').count()) === 3);
	check('메달 12개 · 잠긴 것은 잠김으로', (await page.locator('.grid .card').count()) === 12 && (await page.locator('.card.locked').count()) === 3);
	check('새로 딴 업적에 NEW', (await page.locator('.card .new').count()) === 2);
	check('진행도: "7 / 20번"', (await page.locator('.card', { hasText: '연장의 달인' }).innerText()).includes('7 / 20번'));
	check('개척자는 가입 순서로', (await page.locator('.card', { hasText: '개척자' }).innerText()).includes('가입 42번째'));
	await page.screenshot({ path: `${SP}/ach-1-grid.png`, fullPage: true });
	await page.getByRole('button', { name: '편지', exact: true }).click();
	check('분류 탭: 편지만', (await page.locator('.grid .card').count()) === 2);
	await page.getByRole('button', { name: '전체', exact: true }).click();

	console.log('[자세히 · 대표 업적]');
	await page.locator('.card', { hasText: '연장의 달인' }).click(); await page.waitForTimeout(250);
	const sheet = page.getByRole('dialog', { name: '연장의 달인' });
	check('메달을 누르면 등급 기준 (동 5번 · 은 20번 · 금 50번)', (await sheet.innerText()).replace(/\s+/g, '').includes('동5번') && (await sheet.innerText()).replace(/\s+/g, '').includes('금50번') && (await sheet.locator('.tiers li.done').count()) === 1);
	await page.screenshot({ path: `${SP}/ach-2-detail.png` });
	await sheet.getByRole('button', { name: '대표 업적으로 걸기' }).click(); await page.waitForTimeout(250);
	check('★ 대표로 걸면 맨 앞에 · 3개로 유지', JSON.stringify(await page.evaluate(() => window.__featured)) === '["extend","fun","pioneer"]', JSON.stringify(await page.evaluate(() => window.__featured)));
	await page.locator('.card', { hasText: '연장의 달인' }).click(); await page.waitForTimeout(250);
	await page.getByRole('dialog', { name: '연장의 달인' }).getByRole('button', { name: '대표 업적에서 내리기' }).click(); await page.waitForTimeout(250);
	check('대표에서 내리기', JSON.stringify(await page.evaluate(() => window.__featured)) === '["fun","pioneer"]');
	await page.locator('.card', { hasText: '친절왕' }).click(); await page.waitForTimeout(250);
	check('잠긴 업적은 대표로 못 건다', (await page.getByRole('dialog', { name: '친절왕' }).getByRole('button', { name: /대표 업적/ }).count()) === 0);
	await page.keyboard.press('Escape');

	console.log('[새 업적 축하]');
	await page.goto(U('/dev/achievements?celebrate')); await page.waitForTimeout(700);
	const party = page.getByRole('dialog', { name: '새 업적' });
	check('★ 여러 개면 "업적 3개를 모았어요!" · 메달 3개', (await party.innerText()).includes('업적 3개를 모았어요!') && (await party.locator('.m').count()) === 3);
	await page.screenshot({ path: `${SP}/ach-3-celebrate.png` });
	await page.goto(U('/dev/achievements?celebrate&one')); await page.waitForTimeout(700);
	check('하나면 "고정 친구 동 등급!"', (await page.getByRole('dialog', { name: '새 업적' }).innerText()).includes('고정 친구 동 등급!'));
	await page.getByRole('button', { name: '닫기' }).click(); await page.waitForTimeout(500);
	check('닫으면 사라진다', (await page.getByRole('dialog', { name: '새 업적' }).count()) === 0);

	console.log('[상대 프로필의 대표 업적]');
	await page.goto(U('/dev/chat?s=chat')); await page.locator('.bubble', { hasText: '안녕하세요!' }).waitFor(); await page.waitForTimeout(400);
	check('대화 맨 위 소개에 대표 업적 메달 3개', (await page.locator('.intro [role="img"]').count()) === 3);
	await page.getByRole('button', { name: '프로필 보기' }).first().click(); await page.waitForTimeout(300);
	check('★ 상대 프로필 시트: 대표 업적 이름 · 등급', (await page.locator('.profile .badges').innerText()).includes('따뜻한 사람') && (await page.locator('.profile .badges [aria-label="이야기꾼 금"]').count()) === 1);
	await page.screenshot({ path: `${SP}/ach-4-partner.png` });
	check('페이지 오류 없음', errs.length === 0, errs.join(' / '));
} finally { await browser.close(); vite.kill(); try { execSync(`pkill -f 'vite dev --port ${PORT}'`); } catch {} }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
