import { ROOT, CHROME, OUT } from './_env.mjs';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
// 드래그 복사 — 학생 앱은 사람이 쓴 글·입력칸만 선택되고, 버튼·안내·제목은 선택되지 않는다
const PORT = 5193;
const env = { ...process.env, PUBLIC_SUPABASE_URL: 'https://fake-proj.supabase.co', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest' };
const vite = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; vite.stdout.on('data', (d) => (out += d));
for (let i = 0; i < 60 && !out.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const browser = await chromium.launch({ executablePath: CHROME });
const U = (p) => `http://localhost:${PORT}${p}`;
try {
	const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
	const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
	/** 요소 위를 왼쪽 끝→오른쪽 끝으로 드래그한 뒤 선택된 글자 */
	const drag = async (loc) => {
		await page.evaluate(() => getSelection()?.removeAllRanges());
		const b = await loc.first().boundingBox();
		const y = b.y + Math.min(b.height / 2, 10); // 여러 줄이면 첫 줄 위로 (줄 사이 틈을 긋지 않게)
		await page.mouse.move(b.x + 2, y);
		await page.mouse.down();
		await page.mouse.move(b.x + b.width - 2, y, { steps: 8 });
		await page.mouse.up();
		return page.evaluate(() => getSelection()?.toString() ?? '');
	};
	const us = (loc) => loc.first().evaluate((e) => getComputedStyle(e).userSelect);

	console.log('[채팅 · 데스크톱]');
	await page.goto(U('/dev/chat?s=chat'));
	await page.locator('.bubble', { hasText: '안녕하세요!' }).waitFor(); await page.waitForTimeout(500);
	check('안내 문구(10분 설명) 드래그 → 선택 안 됨', (await drag(page.locator('.list .sys'))) === '');
	check('상단 이름 드래그 → 선택 안 됨', (await drag(page.locator('.topbar .who'))) === '');
	check('소개 카드 드래그 → 선택 안 됨', (await drag(page.locator('.intro h2'))) === '');
	check('입력칸 안내·보내기 버튼 → 선택 안 됨', (await us(page.locator('button.send'))) === 'none');
	const got = await drag(page.locator('.bubble', { hasText: '혹시 요즘 뭐 듣는 노래' }));
	check('★ 채팅 말풍선은 드래그로 선택됨', got.includes('노래'), JSON.stringify(got));
	await page.locator('textarea').first().fill('입력 테스트');
	check('입력칸은 그대로 입력·선택 가능', (await us(page.locator('textarea'))) !== 'none' && (await page.locator('textarea').inputValue()) === '입력 테스트');

	console.log('[폰]');
	const phone = await (await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true })).newPage();
	await phone.goto(U('/dev/chat?s=chat'));
	await phone.locator('.bubble').first().waitFor();
	check('폰에서는 말풍선 길게 누르기 = 공감 (글자 선택 안 함, 복사는 고르기 줄)', (await phone.locator('.bwrap .bubble').first().evaluate((e) => getComputedStyle(e).userSelect)) === 'none');
	// -webkit-touch-callout 은 iOS Safari 전용이라 Chromium 은 규칙을 버린다 → 원본 CSS 에 들어 있는지로 확인
	const css = (await import('node:fs')).readFileSync(`${ROOT}/src/app.css`, 'utf8');
	check('폰(iOS): 길게 눌러도 시스템 메뉴(복사·공유) 안 뜨는 규칙', /body:not\(\.admin\) \{[^}]*-webkit-touch-callout: none/.test(css));

	console.log('[운영자 화면은 그대로]');
	await page.goto(U('/admin/login'));
	await page.locator('body.admin').waitFor();
	check('운영자 화면은 선택 가능 (이메일·ID 복사)', (await page.evaluate(() => getComputedStyle(document.body).userSelect)) !== 'none');
	check('페이지 오류 없음', errs.length === 0, errs.join(' / '));
} finally { await browser.close(); vite.kill(); try { execSync("pkill -f 'vite dev --port 5193'"); } catch {} }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
