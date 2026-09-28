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
	check('요약: 모은 업적 수 · 금 · 은 · 동 (특별 업적은 금 · 은 · 동에 안 셈)', (await page.locator('.summary').innerText()).replace(/\s+/g, ' ').includes('10 / 13') && (await page.locator('.metals').innerText()).replace(/\s+/g, '') === '금2은3동4', await page.locator('.summary').innerText());
	check('대표 업적 3칸', (await page.locator('.featured .slot [role="img"]').count()) === 3);
	check('메달 13개 · 잠긴 것은 잠김으로', (await page.locator('.grid .card').count()) === 13 && (await page.locator('.card.locked').count()) === 3);
	check('★ 베타 테스터 — 특별 업적 ("특별" · 받음)', (await page.locator('.card', { hasText: '베타 테스터' }).locator('[aria-label="베타 테스터 특별"]').count()) === 1
		&& (await page.locator('.card', { hasText: '베타 테스터' }).innerText()).includes('받음'));
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
	check('대표 업적 칸에 설명 문구 없음 (Phase 44)', !(await page.locator('.featured').innerText()).includes('대화 상대에게 보여요'));
	await page.keyboard.press('Escape'); await page.waitForTimeout(300);
	await page.locator('.card', { hasText: '베타 테스터' }).click(); await page.waitForTimeout(250);
	const beta = page.getByRole('dialog', { name: '베타 테스터' });
	check('★ 특별 업적 자세히 — 등급 기준 대신 "운영진이 주는 특별 업적"', (await beta.innerText()).includes('운영진이 주는 특별 업적') && (await beta.locator('.tiers').count()) === 0);
	await page.screenshot({ path: `${SP}/ach-6-beta.png` });
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
	// 업적 카탈로그 (Phase 44) — 남의 메달을 누르면 설명 · 기준을 여기서
	let catalogCalls = 0;
	await page.route('https://fake-proj.supabase.co/rest/v1/rpc/achievement_catalog', (r) => {
		catalogCalls++;
		return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
			{ code: 'warm', title: '따뜻한 사람', description: '매너 온도', icon: '🌡️', category: 'manner', unit: '도', lower_better: false, granted: false, tiers: [42, 45, 50] },
			{ code: 'pin', title: '고정 친구', description: '둘 다 고정한 채팅', icon: '📌', category: 'chat', unit: '명', lower_better: false, granted: false, tiers: [1, 3, 10] },
			{ code: 'fun', title: '이야기꾼', description: '"대화가 재밌어요" 받기', icon: '🎉', category: 'manner', unit: '번', lower_better: false, granted: false, tiers: [10, 50, 200] }
		]) });
	});
	await page.goto(U('/dev/chat?s=chat')); await page.locator('.bubble', { hasText: '안녕하세요!' }).waitFor(); await page.waitForTimeout(400);
	check('대화 맨 위 소개에 대표 업적 메달 3개', (await page.locator('.intro [role="img"]').count()) === 3);
	await page.getByRole('button', { name: '이야기꾼 업적 자세히' }).first().click();
	const fun = page.getByRole('dialog', { name: '이야기꾼' });
	await fun.locator('.tiers li').first().waitFor({ timeout: 5000 }).catch(() => {});
	check('★ 소개의 메달을 누르면 어떻게 얻는지 · 등급 기준 (업적 화면과 같은 모양)', (await fun.innerText()).includes('"대화가 재밌어요" 받기') && (await fun.locator('.tiers li.done').count()) === 3
		&& (await fun.innerText()).replace(/\s+/g, '').includes('금200번'), await fun.innerText().catch(() => ''));
	await page.screenshot({ path: `${SP}/ach-5-partner-badge.png` });
	await page.keyboard.press('Escape'); await page.waitForTimeout(300);
	await page.getByRole('button', { name: '프로필 보기' }).first().click(); await page.waitForTimeout(300);
	check('★ 상대 프로필 시트: 대표 업적 이름 · 등급', (await page.locator('.profile .badges').innerText()).includes('따뜻한 사람') && (await page.locator('.profile .badges [aria-label="이야기꾼 금"]').count()) === 1);
	await page.screenshot({ path: `${SP}/ach-4-partner.png` });
	await page.locator('.profile .badges').getByRole('button', { name: '고정 친구 업적 자세히' }).click(); await page.waitForTimeout(400);
	const pin = page.getByRole('dialog', { name: '고정 친구' });
	check('★ 프로필 시트 위에 메달 자세히 (동 1명 · 동만 달성)', (await pin.innerText()).includes('둘 다 고정한 채팅') && (await pin.locator('.tiers li.done').count()) === 1);
	check('카탈로그는 한 번만 받는다', catalogCalls === 1, String(catalogCalls));
	check('페이지 오류 없음', errs.length === 0, errs.join(' / '));
} finally { await browser.close(); vite.kill(); try { execSync(`pkill -f 'vite dev --port ${PORT}'`); } catch {} }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
