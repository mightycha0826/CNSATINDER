import { ROOT, CHROME, OUT } from './_env.mjs';
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
// 답장 · 첫마디 도우미 · 시간 구분선 · 연결 화면 — /dev/chat 미리보기
const SP = OUT, PORT = 5192;
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
	const bubble = (t) => page.locator('.bubble', { hasText: t });

	console.log('[시간 구분선]');
	await page.goto(U('/dev/chat?s=chat'));
	await bubble('안녕하세요!').waitFor(); await page.waitForTimeout(600);
	const seps = await page.locator('.time-sep').allInnerTexts();
	check('대화 시작 + 5분 넘게 쉰 뒤 = 구분선 2개', seps.length === 2 && seps.every((t) => /^(오전|오후) \d{1,2}:\d{2}$/.test(t)), JSON.stringify(seps));
	const firstSep = await page.locator('.time-sep').first().boundingBox(), firstSys = await page.locator('.list .sys').first().boundingBox();
	check('첫 구분선은 첫 안내 위', firstSep.y < firstSys.y);

	console.log('[답장 보이기]');
	const quoted = page.locator('.bwrap', { has: bubble('헐 저도 좋아해요') }).locator('.quote');
	check('답장 말풍선 위에 인용', (await quoted.innerText()).includes('내 메시지에 답장') && (await quoted.innerText()).includes('실리카겔 좋아하세요?'), await quoted.innerText().catch(() => ''));
	await page.screenshot({ path: `${SP}/feat-1-chat.png` });
	await page.locator('.list').evaluate((e) => e.scrollTo(0, e.scrollHeight));
	await quoted.click(); await page.waitForTimeout(250);
	check('★ 인용 누르면 원래 메시지로 가서 반짝', (await page.locator('.bwrap.flash .bubble').innerText()).includes('실리카겔 좋아하세요?'));

	const qb = await quoted.boundingBox(), bb = await bubble('헐 저도 좋아해요').boundingBox();
	check('★ 인용 상자와 답장 말풍선이 겹치지 않는다', qb.y + qb.height <= bb.y, JSON.stringify({ quoteBottom: qb.y + qb.height, bubbleTop: bb.y }));

	console.log('[답장 보내기]');
	await bubble('공연도 가봤어요?').click({ button: 'right' }); await page.waitForTimeout(200);
	check('고르기 줄에 "답장"', (await page.getByRole('menuitem', { name: '답장' }).count()) === 1);
	const pk = await page.locator('.rx-pick').boundingBox();
	check('고르기 줄이 화면 안에', pk.x >= 0 && pk.x + pk.width <= 390, JSON.stringify(pk));
	await page.getByRole('menuitem', { name: '답장' }).click(); await page.waitForTimeout(200);
	const bar = page.locator('.replying');
	check('입력창 위 "새벽수달에게 답장" 막대', (await bar.innerText()).includes('새벽수달에게 답장') && (await bar.innerText()).includes('공연도 가봤어요?'));
	check('입력창에 커서', await page.locator('textarea').evaluate((e) => e === document.activeElement));
	await page.screenshot({ path: `${SP}/feat-2-replying.png` });
	await page.evaluate(() => document.documentElement.style.setProperty('--bubble-fill', 'linear-gradient(#3b8af6, #3b8af6)'));
	const barBg = await page.locator('.replying-text').evaluate((e) => getComputedStyle(e, '::before').backgroundImage);
	check('답장 막대의 세로줄 = 채팅 색상 (설정에서 고른 색)', barBg.includes('59, 138, 246'), barBg);
	await page.evaluate(() => document.documentElement.style.removeProperty('--bubble-fill'));
	await page.locator('.replying-x').click();
	check('✕ 로 답장 취소', (await page.locator('.replying').count()) === 0);
	await bubble('공연도 가봤어요?').click({ button: 'right' }); await page.getByRole('menuitem', { name: '답장' }).click();
	await page.locator('textarea').fill('아직 못 가봤어요!'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
	const mine = page.locator('.bwrap', { has: bubble('아직 못 가봤어요!') });
	check('★ 보낸 답장에 인용 · 막대 사라짐', (await mine.locator('.quote').innerText()).includes('새벽수달의 메시지에 답장') && (await page.locator('.replying').count()) === 0);
	await page.screenshot({ path: `${SP}/feat-3-sent.png` });

	console.log('[밀어서 답장]');
	// 손가락 밀기 — 터치 포인터 이벤트를 말풍선에 직접 보낸다 (down → move 여러 번 → up)
	const drag = (text, dx, dy = 0, type = 'touch') => page.evaluate(async ([text, dx, dy, type]) => {
		const el = [...document.querySelectorAll('.bubble')].find((b) => b.textContent.includes(text));
		const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
		const ev = (n, cx, cy) => el.dispatchEvent(new PointerEvent(n, { bubbles: true, cancelable: true, pointerId: 7, pointerType: type, isPrimary: true, button: 0, clientX: cx, clientY: cy }));
		ev('pointerdown', x, y);
		for (let i = 1; i <= 6; i++) ev('pointermove', x + (dx * i) / 6, y + (dy * i) / 6);
		await new Promise((r) => requestAnimationFrame(() => r())); // 화면이 따라 그려진 뒤에 본다
		const w = el.closest('.bwrap');
		return { transform: w.style.transform, icon: !!w.querySelector('.swipe-ic'), hit: !!w.querySelector('.swipe-ic.hit'), left: !!w.querySelector('.swipe-ic.left') };
	}, [text, dx, dy, type]);
	const lift = (text) => page.evaluate((text) => {
		const el = [...document.querySelectorAll('.bubble')].find((b) => b.textContent.includes(text));
		el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 }));
	}, text);
	const replying = () => page.locator('.replying').innerText().catch(() => '');

	let mid = await drag('공연도 가봤어요?', 100);
	check('상대 말풍선을 오른쪽으로 끌면 따라온다 + 왼쪽에 답장 화살표', /translateX\(\d/.test(mid.transform) && mid.icon && mid.left && mid.hit, JSON.stringify(mid));
	await page.screenshot({ path: `${SP}/feat-6-swipe.png` });
	await lift('공연도 가봤어요?'); await page.waitForTimeout(300);
	check('★ 놓으면 그 메시지에 답장 준비', (await replying()).includes('새벽수달에게 답장') && (await replying()).includes('공연도 가봤어요?'), await replying());
	check('말풍선은 제자리로', (await page.locator('.bwrap', { has: bubble('공연도 가봤어요?') }).evaluate((e) => e.style.transform)) === '');
	check('밀기는 톡으로 세지 않는다 (공감 안 달림)', (await page.locator('.bwrap.reacted', { has: bubble('공연도 가봤어요?') }).count()) === 0);
	await page.locator('.replying-x').click();

	mid = await drag('아직 못 가봤어요!', -100);
	check('내 말풍선은 왼쪽으로 밀어도 된다 (화살표는 오른쪽)', /translateX\(-\d/.test(mid.transform) && mid.icon && !mid.left, JSON.stringify(mid));
	await lift('아직 못 가봤어요!'); await page.waitForTimeout(300);
	check('★ 내 메시지에도 밀어서 답장', (await replying()).includes('내 메시지에 답장') && (await replying()).includes('아직 못 가봤어요!'), await replying());
	await page.locator('.replying-x').click();

	await drag('공연도 가봤어요?', 35); await lift('공연도 가봤어요?'); await page.waitForTimeout(300);
	check('조금만 밀다 놓으면 답장 안 함', (await page.locator('.replying').count()) === 0);
	mid = await drag('공연도 가봤어요?', 12, 80); await lift('공연도 가봤어요?'); await page.waitForTimeout(300);
	check('위아래로 움직이면 스크롤로 보고 밀지 않는다', !mid.icon && (await page.locator('.replying').count()) === 0, JSON.stringify(mid));
	mid = await drag('공연도 가봤어요?', 100, 0, 'mouse'); await lift('공연도 가봤어요?'); await page.waitForTimeout(300);
	check('마우스 드래그는 글자 고르기 — 밀기 아님', !mid.icon && (await page.locator('.replying').count()) === 0, JSON.stringify(mid));
	mid = await page.evaluate(async () => {
		const b = [...document.querySelectorAll('.bubble')].find((x) => x.textContent.includes('공연도 가봤어요?'));
		const row = b.closest('.row'), r = b.getBoundingClientRect(), rr = row.getBoundingClientRect();
		const x = r.right + (rr.right - r.right) / 2, y = r.top + r.height / 2; // 말풍선 오른쪽 빈자리
		const ev = (n, cx) => row.dispatchEvent(new PointerEvent(n, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, clientX: cx, clientY: y }));
		ev('pointerdown', x);
		for (let i = 1; i <= 6; i++) ev('pointermove', x - (100 * i) / 6);
		await new Promise((res) => requestAnimationFrame(() => res()));
		const w = b.closest('.bwrap'), out = { hit: document.elementFromPoint(x, y) === row, transform: w.style.transform, icon: !!w.querySelector('.swipe-ic.hit') };
		ev('pointerup', x - 100);
		return out;
	});
	await page.waitForTimeout(300);
	check('★ 말풍선 밖 빈자리(그 줄)를 밀어도 답장', mid.hit && /translateX\(-\d/.test(mid.transform) && mid.icon && (await replying()).includes('공연도 가봤어요?'), JSON.stringify(mid) + ' ' + (await replying()));
	await page.locator('.replying-x').click();
	check('말풍선: 위아래 스크롤만 브라우저에 맡긴다 (touch-action: pan-y)', (await bubble('공연도 가봤어요?').evaluate((e) => getComputedStyle(e).touchAction)) === 'pan-y');

	console.log('[첫마디 도우미]');
	await page.goto(U('/dev/chat?s=fresh'));
	await page.locator('.starters').waitFor(); await page.waitForTimeout(800);
	const chips = await page.locator('.starters .chip').allInnerTexts();
	check('질문 3개 · 첫째는 상대 관심사', chips.length === 3 && chips[0] === '밴드 좋아하시는구나! 언제부터예요?', JSON.stringify(chips));
	check('★ 신상을 묻는 질문 없음', !chips.some((c) => /학년|반이|이름|학번|인스타|번호/.test(c)));
	await page.screenshot({ path: `${SP}/feat-4-starters.png` });
	await page.locator('.starters .more').click(); await page.waitForTimeout(100);
	const chips2 = await page.locator('.starters .chip').allInnerTexts();
	check('↻ 다른 질문', chips2.length === 3 && chips2.join() !== chips.join(), JSON.stringify(chips2));
	await page.locator('.starters .chip').first().click(); await page.waitForTimeout(100);
	check('누르면 입력창에 채워지고 보내지는 않음', (await page.locator('textarea').inputValue()) === chips2[0] && (await page.locator('.row.mine').count()) === 0);
	check('입력창에 글이 있으면 도우미 숨김', (await page.locator('.starters').count()) === 0);
	await page.keyboard.press('Enter'); await page.waitForTimeout(500);
	check('★ 한 마디 보내면 도우미 사라짐', (await page.locator('.row.mine').count()) === 1 && (await page.locator('.starters').count()) === 0);
	await page.goto(U('/dev/chat?s=chat')); await bubble('안녕하세요!').waitFor(); await page.waitForTimeout(400);
	check('이미 대화한 방에는 없음', (await page.locator('.starters').count()) === 0);

	console.log('[연결 화면]');
	await page.goto(U('/dev/chat?s=fresh&matched'));
	await page.locator('.match').waitFor({ timeout: 5000 });
	check('새로 매칭된 방: "새벽수달님과 연결됐어요"', (await page.locator('.match').innerText()).replace(/\s+/g, ' ').includes('새벽수달님과 연결됐어요'));
	await page.waitForTimeout(250); await page.screenshot({ path: `${SP}/feat-5-match.png` });
	await page.waitForTimeout(1700);
	check('1.6초 뒤 저절로 닫힘', (await page.locator('.match').count()) === 0);
	await page.goto(U('/dev/chat?s=fresh&matched')); await page.locator('.match').waitFor();
	await page.locator('.match').click(); await page.waitForTimeout(150);
	check('누르면 바로 닫힘', (await page.locator('.match').count()) === 0);
	await page.goto(U('/dev/chat?s=chat')); await bubble('안녕하세요!').waitFor(); await page.waitForTimeout(300);
	check('평소에 들어가면 안 뜸', (await page.locator('.match').count()) === 0);
	check('페이지 오류 없음', errs.length === 0, errs.join(' / '));
} finally { await browser.close(); vite.kill(); try { execSync("pkill -f 'vite dev --port 5192'"); } catch {} }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
