import { ROOT, CHROME, OUT } from './_env.mjs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const SP = OUT;
const PORT = 5196;
const env = { ...process.env, PUBLIC_SUPABASE_URL: 'https://fake-proj.supabase.co', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest' };
const vite = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
vite.stdout.on('data', (d) => (out += d));
vite.stderr.on('data', (d) => (out += d));
for (let i = 0; i < 60 && !out.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const browser = await chromium.launch({ executablePath: CHROME });
try {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
	await ctx.route('https://fake-proj.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
	const page = await ctx.newPage();
	const errs = [];
	page.on('pageerror', (e) => errs.push(String(e)));
	await page.goto(`http://localhost:${PORT}/dev/letters?v=feed`);
	await page.locator('.posts li').first().waitFor();
	const li = (n) => page.locator('.posts li').nth(n);
	const heart = (n) => li(n).locator('button.like');
	const state = async (n) => ({ on: await heart(n).evaluate((b) => b.classList.contains('on')), n: Number(await heart(n).locator('.num').innerText()) });
	const likes = () => page.evaluate(() => window.__LIKES__ ?? []);

	console.log('\n[1] 피드');
	check('첫 편지는 이미 누른 상태로 보인다', (await state(0)).on === true);
	check('게시물마다 하트 버튼', (await page.locator('.posts button.like').count()) === 4);
	await page.screenshot({ path: `${SP}/like-feed-before.png` });

	// 두 번째 편지(id 8, 2개, 안 누름) 누르기
	const url0 = page.url();
	await heart(1).click();
	const opt = await state(1);
	check('누르자마자 채워지고 +1 (서버 응답 전)', opt.on === true && opt.n === 3, JSON.stringify(opt));
	await page.waitForTimeout(400);
	check('서버 응답으로 개수를 맞춘다', (await state(1)).n === 10, JSON.stringify(await state(1)));
	check('하트를 눌러도 편지로 넘어가지 않는다', page.url() === url0, page.url());
	const l1 = (await likes()).at(-1);
	check('서버에 "누름" 상태를 보낸다', l1?.p_letter === 8 && l1?.p_like === true, JSON.stringify(l1));
	await page.screenshot({ path: `${SP}/like-feed-after.png` });

	await heart(1).click();
	await page.waitForTimeout(400);
	const un = await state(1);
	check('다시 누르면 취소', un.on === false && un.n === 9, JSON.stringify(un));

	console.log('\n[2] 실패하면 되돌리기');
	const before = await state(3);
	await heart(3).click();
	await page.waitForTimeout(400);
	const after = await state(3);
	check('볼 수 없는 편지면 원래대로', after.on === before.on && after.n === before.n, `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
	check('안내 문구', await page.getByText('볼 수 없는 편지').isVisible());

	console.log('\n[3] 연타');
	const n0 = (await likes()).length;
	await heart(2).click();
	await heart(2).click();
	await page.waitForTimeout(500);
	const fin = await state(2);
	const sent = (await likes()).slice(n0);
	check('요청 두 번, 마지막은 "취소"', sent.length === 2 && sent[1].p_like === false, JSON.stringify(sent));
	check('마지막 요청 결과로 끝난다 (꺼짐)', fin.on === false && fin.n === 9, JSON.stringify(fin));

	console.log('\n[4] 링크');
	check('본문 링크는 그대로', (await li(1).locator('a.post').getAttribute('href')) === '/letters/8');
	check('댓글 수를 눌러도 편지로', (await li(1).locator('a.count').getAttribute('href')) === '/letters/8');

	console.log('\n[5] 상세');
	await page.goto(`http://localhost:${PORT}/dev/letters?v=detail`);
	const dh = page.locator('.acts button.like');
	await dh.waitFor();
	check('상세에 하트 (이미 누름)', await dh.evaluate((b) => b.classList.contains('on')));
	await dh.click();
	await page.waitForTimeout(400);
	check('상세에서 취소', !(await dh.evaluate((b) => b.classList.contains('on'))) && (await dh.locator('.num').innerText()) === '9');
	await dh.click();
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${SP}/like-detail.png` });
	check('페이지 오류 없음', errs.length === 0, errs.join(' / '));
} finally {
	await browser.close();
	vite.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
