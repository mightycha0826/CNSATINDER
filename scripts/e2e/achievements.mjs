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

	console.log('[교복 — 대표 업적은 깃의 배지 (Phase 60)]');
	await page.goto(U('/dev/achievements?uniform')); await page.locator('.uniform').first().waitFor(); await page.waitForTimeout(400);
	const uni = (neck, n) => page.locator(`.u[data-neck="${neck}"][data-n="${n}"] .uniform`);
	// Phase 62 — 숨 쉬듯 움직이고 넥타이 날 · 리본 꼬리가 흔들린다. 동작 줄이기면 멈춘다
	const motion = async () => uni('tie', 3).evaluate((u) => {
		const a = getComputedStyle(u.querySelector('.body')), t = getComputedStyle(u.querySelector('.tie .sway'));
		return { body: a.animationName !== 'none' && a.animationIterationCount === 'infinite', sway: t.animationName !== 'none' && t.animationIterationCount === 'infinite' };
	});
	const moving = await motion();
	check('★ 교복이 숨 쉬듯 움직이고 넥타이가 흔들린다', moving.body && moving.sway, JSON.stringify(moving));
	await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(150);
	const still = await motion();
	check('동작 줄이기면 멈춘다', !still.body && !still.sway, JSON.stringify(still));
	// 아래 누르기 · 재기는 움직임을 멈춘 채로 (배지가 숨 쉬듯 움직여 playwright 가 "멈춘 요소"를 기다린다)
	check('★ 넥타이 · 리본 교복', (await uni('tie', 3).getAttribute('data-neck')) === 'tie' && (await uni('ribbon', 3).getAttribute('data-neck')) === 'ribbon');
	check('★ 대표 업적 수만큼 깃에 배지 · 남은 칸은 점선 "+" (업적 화면으로)', (await uni('tie', 3).locator('button.pin').count()) === 3 && (await uni('tie', 3).locator('.empty').count()) === 0
		&& (await uni('tie', 2).locator('button.pin').count()) === 2 && (await uni('tie', 2).locator('a.empty').getAttribute('href')) === '/dev/achievements'
		&& (await uni('ribbon', 0).locator('a.empty').count()) === 3);
	check('빈 칸 링크가 없으면(상대 프로필) 빈 칸도 없다', (await page.locator('.sheet-size .uniform .empty').count()) === 0 && (await page.locator('.sheet-size .uniform button.pin').count()) === 2);
	await uni('tie', 3).getByRole('button', { name: '개척자 업적 자세히' }).click(); await page.waitForTimeout(150);
	check('배지를 누르면 그 업적', (await page.locator('.picked').innerText()) === '개척자');
	const pins = await uni('tie', 3).locator('button.pin').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.width, r.height, r.top]));
	check('배지 누름 영역 44 · 서로 겹치지 않는다', pins.every(([w, h]) => w >= 44 && h >= 44) && pins.every((p, i) => !i || p[2] - pins[i - 1][2] >= 44), JSON.stringify(pins));
	// Phase 62 — 넥타이는 매듭(머리)이 날 위를 덮고 날보다 넓다, 리본은 고리 둘 · 꼬리 둘 · 매듭
	const tie = await uni('tie', 3).evaluate((u) => {
		const k = u.querySelector('.tie .knot').getBBox(), b = u.querySelector('.tie .blade').getBBox();
		return { knotW: k.width, covers: k.y < b.y && k.y + k.height > b.y + 2, wider: k.width > 2 * 7.5 + 10 };
	});
	check('★ 넥타이 매듭(머리) — 날 위를 덮고 날 윗부분보다 넓다', tie.covers && tie.wider, JSON.stringify(tie));
	// Phase 64 — 사진처럼 조끼 V넥이 칼라 끝 바로 아래(그림 위쪽 절반, 매듭보다 아래), 스케치처럼 넥타이는 왼쪽 끝
	const lay = await uni('tie', 3).evaluate((u) => {
		const f = u.getBoundingClientRect(), v = u.querySelector('.vneck').getBoundingClientRect(), k = u.querySelector('.tie .knot').getBoundingClientRect();
		return { vBottom: (v.bottom - f.top) / f.height, knotBottom: (k.bottom - f.top) / f.height, knotX: (k.left + k.width / 2 - f.left) / f.width };
	});
	check('★ 조끼 V넥은 칼라 끝 바로 아래 · 넥타이는 왼쪽 끝', lay.vBottom < 0.5 && lay.vBottom > lay.knotBottom && lay.knotX < 0.15, JSON.stringify(lay));
	check('★ 리본 — 고리 둘 · 꼬리 둘', (await uni('ribbon', 3).locator('.ribbon .loop').count()) === 2 && (await uni('ribbon', 3).locator('.ribbon-tails .tail').count()) === 2
		&& (await uni('tie', 3).locator('.ribbon').count()) === 0 && (await uni('ribbon', 3).locator('.tie').count()) === 0);
	// Phase 65 — 실제로 입은 것처럼 겹친다: 칼라는 조끼 목둘레에 닿지 않고, 리본 고리 · 머리와 넥타이 매듭은 재킷에 닿지 않으며
	// 리본 고리는 조끼 위에 걸치지 않고, 넥타이 날 · 리본 꼬리 끝은 조끼 속에 있다
	const layering = async (neck) => uni(neck, 3).evaluate((u) => {
		const into = (el, target) => { const m = target.getScreenCTM().inverse().multiply(el.getScreenCTM()); return (x, y) => new DOMPoint(x, y).matrixTransform(m); };
		const outline = (el) => { const L = el.getTotalLength(), out = []; for (let d = 0; d <= L; d += 2) out.push(el.getPointAtLength(d)); return out; };
		const clear = (sel, target, dy = 0) => [...u.querySelectorAll(sel)].every((el) => { const f = into(el, target); return outline(el).every((p) => !target.isPointInFill(f(p.x, p.y + dy))); });
		// 끝이 조끼 자리에 있고, 조끼보다 먼저 그려져(아래 겹) 가려진다
		const tucked = (sel, target) => [...u.querySelectorAll(sel)].every((el) => { const b = el.getBBox(), f = into(el, target); return target.isPointInFill(f(b.x + b.width / 2, b.y + b.height - 1)) && !!(el.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING); });
		const over = (sel, target) => [...u.querySelectorAll(sel)].every((el) => !!(el.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_PRECEDING));
		const vest = u.querySelector('.vest'), lap = u.querySelector('.lapel-r');
		return {
			collarAboveVest: clear('.leaf', vest, 5),
			neckClearOfJacket: clear('.tie .knot, .ribbon .loop, .ribbon .bow-knot', lap),
			bowAboveVest: clear('.ribbon .loop, .ribbon .bow-knot', vest, 4),
			tuckedInVest: tucked('.tie .blade, .ribbon-tails .tail', vest),
			bowOverVest: over('.ribbon .loop, .ribbon .bow-knot', vest)
		};
	});
	for (const neck of ['tie', 'ribbon']) {
		const l = await layering(neck);
		check(`★ 입은 순서대로 자연스럽게 겹친다 (${neck})`, Object.values(l).every(Boolean), JSON.stringify(l));
	}
	// Phase 61 — 깃이 커서 배지 3개가 다 깃 안에 (가운데 · 위아래 · 좌우 끝), 주머니는 수평으로 교표 바로 위 가운데 (움직임을 멈추고 잰다)
	for (const [neck, w] of [['tie', 0], ['ribbon', 320]]) {
		if (w) { await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(200); }
		const inside = await uni(neck, 3).evaluate((u) => {
			const svg = u.querySelector('svg'), lap = u.querySelector('.lapel-r'), m = svg.getScreenCTM().inverse();
			return [...u.querySelectorAll('button.pin .coin')].every((c) => {
				const r = c.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
				return [[cx, cy], [cx, r.top], [cx, r.bottom], [r.left, cy], [r.right, cy]].every(([x, y]) => lap.isPointInFill(new DOMPoint(x, y).matrixTransform(m)));
			});
		});
		check(`★ 배지 3개가 다 깃 안에 (${neck}${w ? ` · 폭 ${w}` : ''})`, inside);
	}
	await page.setViewportSize({ width: 390, height: 844 });
	const pocket = await uni('tie', 3).evaluate((u) => {
		const p = u.querySelector('.pocket').getBBox(), c = u.querySelector('image').getBBox();
		return { level: /^M[\d.]+ ([\d.]+)H[\d.]+V[\d.]+H/.test(u.querySelector('.pocket').getAttribute('d')), above: p.y + p.height < c.y, dx: Math.abs(p.x + p.width / 2 - (c.x + c.width / 2)) };
	});
	check('★ 가슴 주머니는 수평 · 교표 바로 위 가운데', pocket.level && pocket.above && pocket.dx < 1, JSON.stringify(pocket));
	const crest = await page.evaluate(async () => {
		const img = new Image();
		img.src = document.querySelector('.uniform image')?.getAttribute('href') ?? '';
		try { await img.decode(); return `${img.naturalWidth}x${img.naturalHeight}`; } catch { return 'fail'; }
	});
	check('★ 가슴의 교표 그림이 불러와진다', crest === '244x256', crest);
	await uni('tie', 3).screenshot({ path: `${SP}/ach-7-uniform-tie.png` });
	await uni('ribbon', 2).screenshot({ path: `${SP}/ach-8-uniform-ribbon.png` });
	await page.emulateMedia({ reducedMotion: 'no-preference' });

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
	check('★ 상대 프로필 시트: 교복 깃에 대표 업적 배지 (이름 · 등급) · 늘 넥타이 (Phase 60)', (await page.locator('.profile .badges').getByRole('button', { name: '따뜻한 사람 업적 자세히' }).count()) === 1
		&& (await page.locator('.profile .badges [aria-label="이야기꾼 금"]').count()) === 1 && (await page.locator('.profile .uniform[data-neck="tie"]').count()) === 1
		&& (await page.locator('.profile .uniform .empty').count()) === 0);
	await page.screenshot({ path: `${SP}/ach-4-partner.png` });
	await page.emulateMedia({ reducedMotion: 'reduce' }); // 교복 배지는 숨 쉬듯 움직인다 — 멈추고 누른다
	await page.locator('.profile .badges').getByRole('button', { name: '고정 친구 업적 자세히' }).click(); await page.waitForTimeout(400);
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	const pin = page.getByRole('dialog', { name: '고정 친구' });
	check('★ 프로필 시트 위에 메달 자세히 (동 1명 · 동만 달성)', (await pin.innerText()).includes('둘 다 고정한 채팅') && (await pin.locator('.tiers li.done').count()) === 1);
	check('카탈로그는 한 번만 받는다', catalogCalls === 1, String(catalogCalls));
	check('페이지 오류 없음', errs.length === 0, errs.join(' / '));
} finally { await browser.close(); vite.kill(); try { execSync(`pkill -f 'vite dev --port ${PORT}'`); } catch {} }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
