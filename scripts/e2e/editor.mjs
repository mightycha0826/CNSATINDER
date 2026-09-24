import { ROOT, CHROME, OUT } from './_env.mjs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const SP = OUT;
const PORT = 5197;
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
	await page.goto(`http://localhost:${PORT}/dev/letters?v=new`);
	const doc = page.locator('.le-doc');
	await doc.waitFor();
	const btn = (label) => page.getByRole('button', { name: label, exact: true });
	const cdp = await ctx.newCDPSession(page);

	console.log('\n[1] 한글 조합 입력 (IME)');
	await doc.click();
	for (const t of ['ㅎ', '하', '한']) await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
	await cdp.send('Input.insertText', { text: '한' });
	for (const t of ['ㄱ', '그', '글']) await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
	await cdp.send('Input.insertText', { text: '글' });
	await page.keyboard.type(' 편지');
	check('조합 중인 글자가 깨지지 않는다', (await doc.innerText()).trim() === '한글 편지', JSON.stringify(await doc.innerText()));

	console.log('\n[2] 툴바');
	// "한글" 을 골라 굵게 + 노랑 형광펜
	await page.keyboard.press('Home');
	await page.keyboard.down('Shift');
	for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight');
	await page.keyboard.up('Shift');
	await btn('굵게').click();
	check('굵게 → <strong>', (await doc.locator('strong').innerText()) === '한글');
	check('굵게 버튼이 켜짐 표시', await btn('굵게').evaluate((b) => b.classList.contains('on')));
	await btn('형광펜').click();
	await page.getByRole('button', { name: '형광펜 노랑' }).click();
	check('형광펜 → <mark>', (await doc.locator('mark').innerText()) === '한글');
	await page.waitForTimeout(500); // PROBE
	// 다음 줄: 가운데 정렬 + 파란 글씨 + 크게 + 밑줄
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await btn('가운데 정렬').click();
	await btn('글자색').click();
	await page.getByRole('button', { name: '글자색 파랑' }).click();
	await btn('글자 크기').click();
	await page.getByRole('button', { name: '크게', exact: true }).click();
	await btn('밑줄').click();
	await page.keyboard.type('둘째 줄');
	await btn('밑줄').click();
	await page.keyboard.type('!');
	await page.screenshot({ path: `${SP}/editor-1.png` });

	console.log('\n[3] 올리기 → 서버로 가는 값');
	await page.getByRole('button', { name: '올리기' }).click();
	await page.waitForFunction(() => window.__LAST_POST__, null, { timeout: 5000 }).catch(() => {});
	const sent = await page.evaluate(() => window.__LAST_POST__);
	check('본문은 순수 텍스트, 줄은 \\n', sent?.p_body === '한글 편지\n둘째 줄!', JSON.stringify(sent?.p_body));
	const m = sent?.p_fmt?.m ?? [];
	const has = (s, e, k) => m.some((x) => x[0] === s && x[1] === e && x[2] === k);
	check('"한글" 굵게 [0,2]', has(0, 2, 'b'), JSON.stringify(m));
	check('"한글" 노랑 형광펜 [0,2]', has(0, 2, 'h:yellow'), JSON.stringify(m));
	check('둘째 줄 파란 글씨·크게는 이어서 한 범위 [6,11]', has(6, 11, 'c:blue') && has(6, 11, 'z:lg'), JSON.stringify(m));
	check('밑줄은 "!" 전까지만 [6,10]', has(6, 10, 'u'), JSON.stringify(m));
	check('둘째 줄 가운데 정렬', JSON.stringify(sent?.p_fmt?.a) === '[[1,"center"]]', JSON.stringify(sent?.p_fmt?.a));
	check('그 밖의 서식 없음', m.length === 5, JSON.stringify(m));

	console.log('\n[4] 붙여넣기 · 되돌리기 · 글자 수');
	await page.goto(`http://localhost:${PORT}/dev/letters?v=new`);
	await doc.waitFor();
	await doc.click();
	await doc.evaluate((el) => {
		const dt = new DataTransfer();
		dt.setData('text/html', '<b style="color:#ff0000;font-size:40px">굵은 빨강</b><script>alert(1)</script><img src=x onerror=alert(1)>');
		dt.setData('text/plain', '첫 줄\n둘째 줄');
		el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
	});
	check('붙여넣기는 글자만 — 서식·태그 없음', (await doc.locator('strong, b, mark, span[style], img, script').count()) === 0);
	check('붙여넣은 줄바꿈은 문단으로', (await doc.locator('p').count()) === 2 && (await doc.locator('p').nth(1).innerText()) === '둘째 줄');
	await btn('되돌리기').click();
	check('되돌리기', (await doc.innerText()).trim() === '');
	await doc.click();
	await cdp.send('Input.insertText', { text: '가'.repeat(501) });
	const foot = await page.locator('.foot .num').innerText();
	check('500자 넘으면 "넘음" 표시', /1자 넘음/.test(foot), foot);
	check('500자 넘으면 올리기 막힘', await page.getByRole('button', { name: '올리기' }).isDisabled());
	await page.keyboard.press('Backspace');
	check('500자면 올리기 가능', !(await page.getByRole('button', { name: '올리기' }).isDisabled()));

	console.log('\n[5] 보여주기 — 피드 · 상세');
	for (const v of ['feed', 'detail']) {
		await page.goto(`http://localhost:${PORT}/dev/letters?v=${v}`);
		await page.locator('.rt').first().waitFor({ timeout: 10000 });
		const rt = page.locator('.rt').first();
		const bold = await rt.locator('.rt-b').first().evaluate((e) => ({ t: e.textContent, w: getComputedStyle(e).fontWeight, bg: getComputedStyle(e).backgroundColor }));
		check(`${v}: "진로" 굵게 + 형광펜`, bold.t === '진로' && Number(bold.w) >= 700 && bold.bg.startsWith('rgba(255, 213, 0'), JSON.stringify(bold));
		const u = await rt.locator('span', { hasText: '때문에' }).evaluate((e) => getComputedStyle(e).textDecorationLine);
		check(`${v}: "때문에" 밑줄`, u.includes('underline'), u);
		const line2 = await rt.locator('.rt-line').nth(1).evaluate((e) => getComputedStyle(e).textAlign);
		check(`${v}: 둘째 줄 가운데 정렬`, line2 === 'center', line2);
		await page.screenshot({ path: `${SP}/render-${v}.png` });
	}
	check('페이지 오류 없음', errs.length === 0, errs.join(' / '));
} finally {
	await browser.close();
	vite.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
