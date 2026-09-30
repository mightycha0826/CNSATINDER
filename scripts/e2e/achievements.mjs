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
	// Phase 65 · 66 — 실제로 입은 것처럼 겹친다: 칼라는 조끼 목둘레에 닿지 않고, 리본 머리와 넥타이 매듭은 재킷에 닿지 않으며
	// 리본 고리(1.5배 — 앞섶 사이보다 넓다)는 끝이 재킷 밑으로 들어가고(재킷보다 먼저 그린다), 보이는 곳은 조끼 위에 걸치지 않고,
	// 넥타이 날 끝은 조끼 속에 있고, 리본 꼬리는 벌어져 조끼 목둘레 단 바로 위에서 끝난다 (Phase 68 — 제비꼬리 끝이 보이게)
	const layering = async (neck) => uni(neck, 3).evaluate((u) => {
		const into = (el, target) => { const m = target.getScreenCTM().inverse().multiply(el.getScreenCTM()); return (x, y) => new DOMPoint(x, y).matrixTransform(m); };
		const outline = (el) => { const L = el.getTotalLength(), out = []; for (let d = 0; d <= L; d += 2) out.push(el.getPointAtLength(d)); return out; };
		// 그림 밖 점과, hidden 이 있으면 그것(재킷)에 가려지는 점은 빼고 본다
		const frame = u.getBoundingClientRect();
		const seen = (el, p) => { const q = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM()); return q.x >= frame.left && q.x <= frame.right && q.y >= frame.top && q.y <= frame.bottom; };
		const clear = (sel, target, dy = 0, hidden = null) => [...u.querySelectorAll(sel)].every((el) => {
			const f = into(el, target), h = hidden && into(el, hidden);
			return outline(el).every((p) => !seen(el, p) || (h && hidden.isPointInFill(h(p.x, p.y))) || !target.isPointInFill(f(p.x, p.y + dy)));
		});
		const under = (sel, target) => [...u.querySelectorAll(sel)].every((el) => !!(el.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING));
		// 끝이 조끼 자리에 있고, 조끼보다 먼저 그려져(아래 겹) 가려진다
		const tucked = (sel, target) => [...u.querySelectorAll(sel)].every((el) => { const b = el.getBBox(), f = into(el, target); return target.isPointInFill(f(b.x + b.width / 2, b.y + b.height - 1)) && !!(el.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING); });
		const over = (sel, target) => [...u.querySelectorAll(sel)].every((el) => !!(el.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_PRECEDING));
		const vest = u.querySelector('.vest'), lap = u.querySelector('.lapel-r');
		return {
			collarAboveVest: clear('.leaf', vest, 5),
			neckClearOfJacket: clear('.tie .knot, .ribbon .bow-knot', lap),
			loopsUnderJacket: under('.ribbon .loop', lap),
			bowAboveVest: clear('.ribbon .loop, .ribbon .bow-knot', vest, 4, lap),
			tuckedInVest: tucked('.tie .blade', vest),
			tailsAboveVest: clear('.ribbon-tails .tail', vest, 5),
			bowOverVest: over('.ribbon .loop, .ribbon .bow-knot', vest)
		};
	});
	for (const neck of ['tie', 'ribbon']) {
		const l = await layering(neck);
		check(`★ 입은 순서대로 자연스럽게 겹친다 (${neck})`, Object.values(l).every(Boolean), JSON.stringify(l));
	}
	// Phase 67 — 리본 고리가 거의 다 보이고(1.5배로 키웠을 때 잘려서 넥타이처럼 보였다), 넥타이 날은 머리에 맞게 넓고,
	// 조끼 목둘레는 끝만 살짝 둥근 V(라운드넥이 아니다), 재킷 앞섶은 거의 곧다
	const shape = await page.evaluate(() => {
		const tie = document.querySelector('.u[data-neck="tie"][data-n="3"] .uniform'), rib = document.querySelector('.u[data-neck="ribbon"][data-n="3"] .uniform');
		const pts = (el, step = 1) => { const L = el.getTotalLength(), out = []; for (let d = 0; d <= L; d += step) out.push(el.getPointAtLength(d)); return out; };
		// 리본 고리 — 그림 안이고 재킷에 가려지지 않은 윤곽 점의 비율
		const frame = rib.getBoundingClientRect(), lap = rib.querySelector('.lapel-r'), lm = lap.getScreenCTM().inverse();
		const loops = [...rib.querySelectorAll('.ribbon .loop')].map((el) => {
			const m = el.getScreenCTM(), all = pts(el, 2);
			const seen = all.filter((p) => { const q = new DOMPoint(p.x, p.y).matrixTransform(m); return q.x >= frame.left && q.x <= frame.right && q.y >= frame.top && q.y <= frame.bottom && !lap.isPointInFill(q.matrixTransform(lm)); });
			return seen.length / all.length;
		});
		// 넥타이 날 너비 (머리 아래 끝에서 8 아래) ÷ 머리 너비
		const knot = tie.querySelector('.tie .knot'), blade = tie.querySelector('.tie .blade'), kb = knot.getBBox();
		const y = kb.y + kb.height + 8; let w = 0;
		for (let x = kb.x - 20; x < kb.x + kb.width + 20; x += 0.5) if (blade.isPointInFill(new DOMPoint(x, y))) w += 0.5;
		// 조끼 목둘레 — 가장 아래 점과, 거기서 옆으로 10 떨어진 곳의 높이 차 (둥글면 거의 0)
		const vp = pts(tie.querySelector('.vneck'), 0.5), bottom = vp.reduce((a, p) => (p.y > a.y ? p : a));
		const side = vp.reduce((a, p) => (Math.abs(p.x - (bottom.x + 10)) < Math.abs(a.x - (bottom.x + 10)) ? p : a));
		// 재킷 앞섶 — 양 끝을 잇는 곧은 선에서 가장 멀리 벗어난 거리
		const fp = pts(tie.querySelector('.front-edge'), 2), [a0, a1] = [fp[0], fp[fp.length - 1]];
		const dev = Math.max(...fp.map((p) => Math.abs((a1.y - a0.y) * p.x - (a1.x - a0.x) * p.y + a1.x * a0.y - a1.y * a0.x) / Math.hypot(a1.y - a0.y, a1.x - a0.x)));
		return { loops: loops.map((v) => +v.toFixed(2)), bladeRatio: +(w / kb.width).toFixed(2), vTip: +(bottom.y - side.y).toFixed(1), frontDev: +dev.toFixed(1) };
	});
	// Phase 68 — 리본은 프레임 안에 통째로 들어온다 (고리마다 윤곽 거의 전부가 보인다)
	check('★ 리본 고리가 다 보인다 (넥타이처럼 보이지 않게)', shape.loops.length === 2 && shape.loops.every((v) => v >= 0.95), JSON.stringify(shape));
	check('★ 넥타이 날은 머리에 맞게 넓다', shape.bladeRatio >= 0.45, JSON.stringify(shape));
	check('★ 조끼 목둘레는 끝만 살짝 둥근 V (라운드넥 아님)', shape.vTip >= 2, JSON.stringify(shape));
	check('★ 재킷 앞섶은 거의 곧다', shape.frontDev <= 2.5, JSON.stringify(shape));
	// Phase 68 — 카라 · 넥타이 · 리본을 한 비례로 다시 그렸다. 카라 벌어짐(뾰족한 두 끝 사이)이 기준: 매듭은 그 절반쯤, 리본은 2/3쯤.
	// 카라 잎은 끝이 뾰족하고(60 도쯤) 매듭 어깨를 덮으며, 리본 날개는 카라 위에 얹힌다. 리본 꼬리는 서로 벌어지고 날개는 프레임 안.
	const fit = async (neck) => uni(neck, 3).evaluate((u) => {
		const pts = (el, step = 0.5) => { const L = el.getTotalLength(), out = []; for (let d = 0; d <= L; d += step) out.push(el.getPointAtLength(d)); return out; };
		const frame = u.getBoundingClientRect(), leaves = [...u.querySelectorAll('.leaf')], leaf = leaves[0], m = leaf.getScreenCTM();
		const P = pts(leaf), ti = P.reduce((a, p, i) => (p.y > P[a].y ? i : a), 0), tip = P[ti];
		// 끝 각도 — 끝에서 윤곽을 양쪽으로 12 만큼 간 두 점이 이루는 각 (잎 좌표 그대로)
		const va = { x: P[ti - 24].x - tip.x, y: P[ti - 24].y - tip.y }, vb = { x: P[ti + 24].x - tip.x, y: P[ti + 24].y - tip.y };
		const angle = (Math.acos((va.x * vb.x + va.y * vb.y) / (Math.hypot(va.x, va.y) * Math.hypot(vb.x, vb.y))) * 180) / Math.PI;
		const cx = new DOMPoint(0, 0).matrixTransform(m).x, spread = 2 * (new DOMPoint(tip.x, tip.y).matrixTransform(m).x - cx);
		const out = { leaves: leaves.length, tipAngle: +angle.toFixed(0) };
		const knot = u.querySelector('.tie .knot');
		if (knot) {
			out.knotRatio = +(knot.getBoundingClientRect().width / spread).toFixed(2);
			// 카라 잎이 매듭 어깨를 덮는다 — 매듭 윤곽 점이 잎 안에 들어 있고, 잎이 매듭보다 나중에 그려진다
			const km = knot.getScreenCTM();
			out.collarCoversKnot = pts(knot, 1).filter((p) => leaves.some((l) => l.isPointInFill(new DOMPoint(p.x, p.y).matrixTransform(km).matrixTransform(l.getScreenCTM().inverse())))).length >= 8
				&& leaves.every((l) => !!(knot.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING));
		}
		const loops = [...u.querySelectorAll('.ribbon .loop')];
		if (loops.length) {
			const rs = loops.map((l) => l.getBoundingClientRect());
			out.bowRatio = +((Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.left))) / spread).toFixed(2);
			out.bowInFrame = rs.every((r) => r.left >= frame.left + 4 && r.right <= frame.right - 4 && r.top >= frame.top);
			out.bowOverCollar = loops.every((l) => leaves.every((c) => !!(l.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_PRECEDING)));
			// 꼬리 — 가장 아래 두 점(제비꼬리 두 끝)의 안쪽 끝 사이 간격 ÷ 그림 너비
			const inner = [...u.querySelectorAll('.ribbon-tails .tail')].map((t) => {
				const tm = t.getScreenCTM(), Q = pts(t, 1).map((p) => new DOMPoint(p.x, p.y).matrixTransform(tm)), yMax = Math.max(...Q.map((q) => q.y));
				const low = Q.filter((q) => q.y > yMax - 14 * (frame.height / 280)).map((q) => q.x);
				return { lo: Math.min(...low), hi: Math.max(...low) };
			});
			const [r, l] = inner[0].lo > inner[1].lo ? inner : [inner[1], inner[0]];
			out.tails = inner.length;
			out.tailGap = +((r.lo - l.hi) / frame.width).toFixed(3);
		}
		return out;
	});
	for (const neck of ['tie', 'ribbon']) {
		const f = await fit(neck);
		check(`★ 카라 잎 둘 · 끝이 뾰족하다 (${neck})`, f.leaves === 2 && f.tipAngle >= 40 && f.tipAngle <= 85, JSON.stringify(f));
		if (neck === 'tie') check('★ 넥타이 매듭은 카라 벌어짐의 절반쯤 · 카라 잎이 매듭 어깨를 덮는다', f.knotRatio >= 0.4 && f.knotRatio <= 0.62 && f.collarCoversKnot, JSON.stringify(f));
		else {
			check('★ 리본은 카라 벌어짐의 2/3쯤 · 프레임 안 · 카라 위에 얹힌다', f.bowRatio >= 0.55 && f.bowRatio <= 0.8 && f.bowInFrame && f.bowOverCollar, JSON.stringify(f));
			check('★ 리본 꼬리 둘이 서로 벌어진다 (한 장처럼 겹치지 않게)', f.tails === 2 && f.tailGap >= 0.04, JSON.stringify(f));
		}
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
