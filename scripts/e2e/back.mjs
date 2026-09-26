import { ROOT, CHROME, OUT } from './_env.mjs';
import { chromium } from 'playwright-core';
// 학생 앱 공지사항 — 종 아이콘 · 빨간 점 · /notices (가짜 Supabase 를 브라우저 요청 가로채기로)
const SP = OUT;
const BASE = 'http://localhost:5199';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const uid = '3f1c2b4a-1111-4222-8333-944455556666';
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now, email: 'x@cnsa.hs.kr' })}.sig`;
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'rt',
	user: { id: uid, aud: 'authenticated', role: 'authenticated', email: '29999@cnsa.hs.kr', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();

let notices = [
	{ id: 2, title: '시험 기간 운영 안내', body: '시험 기간에는 밤 10시에 닫아요.\n둘째 줄', created_at: ago(30) },
	{ id: 1, title: '처음 공지', body: '', created_at: ago(60 * 30) }
];
let lastSeen = 1;
const marks = [];

const prof = { id: uid, nickname: '푸른고래', bio: '', interests: [], mbti: null, gender: 'm', want: 'f', status: 'active', suspended_until: null, verified: true, onboarded: true, allow_rematch: false };
const patches = [];

const browser = await chromium.launch({ executablePath: CHROME });
try {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => m.text().startsWith('DBG') && console.log('   ', m.text()));
	await page.route('https://fake-proj.supabase.co/**', async (route) => {
		const req = route.request(); const u = new URL(req.url());
		const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
		if (u.pathname === '/auth/v1/token') return json(session);
		if (u.pathname.startsWith('/auth/v1/')) return json({});
		if (u.pathname === '/rest/v1/rpc/my_account') return json({ has_password: true });
		if (u.pathname === '/rest/v1/rpc/my_rooms') return json({ rooms: [], server_now: new Date().toISOString() });
		if (u.pathname === '/rest/v1/rpc/letter_feed') return json({ letters: [], server_now: new Date().toISOString() });
		if (u.pathname === '/rest/v1/rpc/my_notices') return json({ notices, last_seen: lastSeen });
		if (u.pathname === '/rest/v1/rpc/mark_notices_seen') { const p = req.postDataJSON().p_id; marks.push(p); lastSeen = Math.max(lastSeen, p); return json(lastSeen); }
		if (u.pathname === '/rest/v1/profiles') {
			if (req.method() === 'PATCH') { Object.assign(prof, req.postDataJSON()); patches.push(req.postDataJSON()); return route.fulfill({ status: 204 }); }
			return json(prof);
		}
		if (u.pathname === '/rest/v1/app_settings') return json({ is_open: true, notice: '', room_minutes: 10, extend_minutes: 10, vote_window_sec: 30, join_grace_sec: 30, max_rounds: 99, heartbeat_sec: 30, presence_ttl_sec: 70, msg_max_len: 500, max_open_rooms: 5, letter_max_len: 1000, comment_max_len: 300 });
		if (u.pathname.startsWith('/rest/v1/rpc/')) return json(null);
		return json([]);
	});
	await page.addInitScript(() => { try { localStorage.setItem('push-asked-v1', '1'); } catch {} });

	await page.goto(`${BASE}/login`);
	await page.getByPlaceholder('학교 이메일 앞부분').fill('29999');
	await page.getByPlaceholder('비밀번호').fill('abcd1234');
	await page.getByRole('button', { name: '로그인', exact: true }).click();
	await page.waitForURL(`${BASE}/`, { timeout: 8000 }).catch(() => {});
	await page.locator('a.logo').waitFor({ timeout: 8000 });
	await page.waitForTimeout(600);
	const idx = () => page.evaluate(() => navigation.currentEntry.index);
	const toastText = () => page.locator('.toasts').innerText().catch(() => '');
	const back = async () => { await page.evaluate(() => history.back()); await page.waitForTimeout(400); };

	console.log('[로고]');
	const logo = page.locator('a.logo');
	check('로고 = 홈 링크, 끌 수 없음', (await logo.getAttribute('href')) === '/' && (await logo.getAttribute('draggable')) === 'false');
	const lb = await logo.boundingBox();
	await page.mouse.move(lb.x + 3, lb.y + lb.height / 2); await page.mouse.down();
	await page.mouse.move(lb.x + lb.width - 3, lb.y + lb.height / 2, { steps: 6 }); await page.mouse.up();
	check('로고를 드래그해도 글자가 잡히지 않는다', (await page.evaluate(() => getSelection().toString())) === '');
	check('하단 탭 3개 — 익명편지 · 채팅 · 프로필 순서', (await page.locator('a.tab').allInnerTexts()).map((t) => t.trim()).join(',') === '익명편지,채팅,프로필',
		(await page.locator('a.tab').allInnerTexts()).join(','));
	check('상단 오른쪽 = 공지 종 + 설정 톱니 (프로필 사진 없음)', (await page.locator('button.settings').count()) === 1 && (await page.locator('button.me').count()) === 0);
	await page.locator('a.tab', { hasText: '프로필' }).click(); await page.waitForURL('**/me'); await page.waitForTimeout(500);
	check('프로필 탭 → 탭바 그대로 · 프로필 탭 켜짐', (await page.locator('a.tab.on').innerText()).includes('프로필') && (await page.locator('button.back').count()) === 0);
	check('프로필 탭 전환도 기록을 쌓지 않는다', (await idx()) === 1, String(await idx()));
	const heads = async () => (await page.locator('.g-head').allInnerTexts()).map((t) => t.replace(/\s+\d.*$/, ''));
	const meHeads = await heads();
	check('프로필 = 소개 · 관심사 · MBTI · 상대 (알림 · 비밀번호 · 로그아웃 없음)',
		meHeads.join(',') === '소개,관심사,MBTI,이런 사람과 이야기할래요' && (await page.getByRole('button', { name: '로그아웃' }).count()) === 0, meHeads.join(','));
	check('프로필: 설정식 — 회색 바탕 위 둥근 카드', (await page.locator('.page.grouped').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(242, 242, 247)'
		&& (await page.locator('.g-card').first().evaluate((e) => getComputedStyle(e).borderTopLeftRadius)) === '22px');
	check('상대 고르기 = 체크 표시 줄 (지금 고른 것 하나)', (await page.getByRole('radio', { checked: true }).count()) === 1);
	await page.screenshot({ path: `${SP}/profile.png`, fullPage: true });
	await back(); await page.waitForTimeout(300);
	check('★ 프로필에서 뒤로 → 채팅 홈', new URL(page.url()).pathname === '/' && (await idx()) === 1, `${page.url()} ${await idx()}`);
	await logo.click(); await page.waitForTimeout(300);
	check('홈에서 로고 누르기 → 홈 그대로', new URL(page.url()).pathname === '/');

	console.log('[홈에서 뒤로가기]');
	check('홈: 맨 아래 홈 + 표식 하나', (await idx()) === 1, String(await idx()));
	await back();
	check('★ 뒤로 한 번 → "한 번 더 누르면 종료" 안내, 화면은 홈 그대로', (await toastText()).includes('뒤로가기를 한 번 더 누르면 종료됩니다') && new URL(page.url()).pathname === '/');
	check('★ 이제 기록 맨 아래 → 한 번 더 누르면 앱이 닫힌다', (await idx()) === 0, String(await idx()));
	await page.waitForTimeout(2300);
	check('2초가 지나면 다시 처음 상태 (다시 안내부터)', (await idx()) === 1, String(await idx()));

	console.log('[탭]');
	await page.locator('a.tab', { hasText: '익명편지' }).click(); await page.waitForURL('**/letters'); await page.waitForTimeout(500);
	check('탭 전환은 기록을 쌓지 않는다', (await idx()) === 1, String(await idx()));
	await page.locator('a.tab', { hasText: '채팅' }).click(); await page.waitForURL(`${BASE}/`); await page.waitForTimeout(400);
	await page.locator('a.tab', { hasText: '익명편지' }).click(); await page.waitForURL('**/letters'); await page.waitForTimeout(400);
	check('여러 번 오가도 그대로', (await idx()) === 1, String(await idx()));
	await back(); await page.waitForTimeout(300);
	check('★ 익명편지에서 뒤로 → 채팅 홈', new URL(page.url()).pathname === '/' && (await idx()) === 1, `${page.url()} ${await idx()}`);
	await back();
	check('이어서 뒤로 → 종료 안내', (await toastText()).includes('한 번 더') && (await idx()) === 0);
	await page.waitForTimeout(2300);

	console.log('[다른 화면에서 돌아오기]');
	await page.locator('button.bell').click(); await page.waitForURL('**/notices'); await page.waitForTimeout(300);
	await page.locator('button.back').click(); await page.waitForURL(`${BASE}/`); await page.waitForTimeout(500);
	check('공지 → 뒤로 → 홈, 기록 늘지 않음', (await idx()) === 1, String(await idx()));
	await page.locator('button.bell').click(); await page.waitForURL('**/notices'); await page.waitForTimeout(300);
	await back();
	check('휴대폰 뒤로가기로 돌아와도 같음 (안내 없이 홈)', new URL(page.url()).pathname === '/' && (await idx()) === 1);

	console.log('[아이폰 상태바]');
	// 홈 화면 앱(black-translucent)은 화면이 상태바 밑까지 올라간다 — 안전영역 47px 을 흉내 내서 머리글이 그만큼 내려오는지
	await page.evaluate(() => document.documentElement.style.setProperty('--safe-top', '47px')); await page.waitForTimeout(100);
	const tb = await page.locator('.topbar').first().boundingBox();
	const lg = await page.locator('a.logo').boundingBox();
	check('★ 머리글 = 상태바 47 + 44, 로고는 상태바 아래', Math.round(tb.height) === 91 && lg.y >= 47, `${tb.height} ${lg.y}`);
	await page.evaluate(() => document.documentElement.style.removeProperty('--safe-top'));
	check('안전영역이 없으면 44 그대로', Math.round((await page.locator('.topbar').first().boundingBox()).height) === 44);

	console.log('[설정 · 테마 색상]');
	const fill = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bubble-fill').trim());
	const before = await fill();
	await page.locator('button.settings').click(); await page.waitForURL('**/settings'); await page.waitForTimeout(300);
	check('톱니 → 설정 화면 (탭바 숨김)', (await page.locator('.title').innerText()) === '설정' && (await page.locator('nav.tabbar').count()) === 0);
	const setHeads = await heads();
	check('★ 설정 = 화면(한 줄) · 테마 색상 · 알림 · 매칭 · 편지 · 계정 · 약관 및 정책 · 로그아웃', setHeads.join(',') === '테마 색상,알림,매칭,편지,계정,약관 및 정책'
		&& (await page.getByRole('switch', { name: '새 메시지 알림' }).count()) === 1 && (await page.getByText('학교 인증').count()) === 1
		&& (await page.getByRole('button', { name: '로그아웃' }).count()) === 1, setHeads.join(','));
	check('뒤로는 둥근 단추 · 제목 가운데', (await page.locator('button.back').evaluate((e) => getComputedStyle(e).borderRadius)) === '50%'
		&& Math.abs(await page.locator('.topbar .title').evaluate((e) => { const r = e.getBoundingClientRect(); return r.left + r.width / 2 - innerWidth / 2; })) < 2);
	const rematch = page.getByRole('switch', { name: '만났던 사람 다시 만나기' });
	check('매칭: "만났던 사람 다시 만나기" 스위치 — 기본 꺼짐', (await rematch.count()) === 1 && !(await rematch.isChecked()));
	await rematch.click(); await page.waitForTimeout(400);
	check('★ 켜면 내 프로필에 저장 (allow_rematch = true) · 스위치 켜짐', JSON.stringify(patches.at(-1)) === '{"allow_rematch":true}' && (await rematch.isChecked()), JSON.stringify(patches));
	await rematch.click(); await page.waitForTimeout(400);
	check('다시 끄면 false 로 저장', JSON.stringify(patches.at(-1)) === '{"allow_rematch":false}' && !(await rematch.isChecked()));
	check('색 후보 5개 — 파랑만 단색, 나머지는 그라데이션', await page.evaluate(() => {
		const dots = [...document.querySelectorAll('.swatch')].map((l) => ({ n: l.querySelector('input').getAttribute('aria-label'), bg: getComputedStyle(l.querySelector('.dot')).backgroundImage }));
		const cols = (bg) => new Set(bg.match(/rgb\([^)]*\)/g)).size;
		return dots.length === 5 && dots.every((d) => (d.n === '파랑' ? cols(d.bg) === 1 : cols(d.bg) >= 2));
	}));
	const pwRow = page.getByRole('button', { name: /^비밀번호 (바꾸기|만들기)$/ });
	await pwRow.click(); await page.waitForTimeout(150);
	check('비밀번호 줄 → 카드 안에서 펼침 (›가 아래로)', (await pwRow.getAttribute('aria-expanded')) === 'true' && (await page.getByPlaceholder('지금 비밀번호').count()) === 1);
	await pwRow.click(); await page.waitForTimeout(150);
	check('다시 누르면 접힘', (await pwRow.getAttribute('aria-expanded')) === 'false' && (await page.getByPlaceholder('지금 비밀번호').count()) === 0);
	await page.screenshot({ path: `${SP}/settings.png`, fullPage: true });
	await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(150);
	await page.screenshot({ path: `${SP}/settings-dark.png`, fullPage: true });
	await page.emulateMedia({ colorScheme: 'light' });
	const swatch = (name) => page.locator('.swatch', { has: page.getByRole('radio', { name }) });
	check('기본 색이 골라져 있다', (await page.getByRole('radio', { name: '기본' }).isChecked()) && (await swatch('기본').getAttribute('class')).includes('on'));
	check('색 동그라미 아래 글자 없음 (이름은 화면 낭독기에만)', (await page.locator('.swatches').innerText()).trim() === '');
	await swatch('파랑').click(); await page.waitForTimeout(200);
	const blue = await fill();
	check('★ 파랑을 고르면 말풍선 색이 바로 바뀐다', blue !== before && blue.includes('#3b8af6'), blue);
	const mine = await page.locator('.preview .mine .bubble').first().evaluate((e) => getComputedStyle(e).backgroundImage);
	check('미리보기 말풍선에도 입혀진다', mine.includes('59, 138, 246'), mine);
	const tok = () => page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return ['--accent-fill', '--accent', '--brand'].map((k) => cs.getPropertyValue(k).trim()); });
	const [af, ac, br] = await tok();
	check('★ 앱 전체 색이 바뀐다 — 채운 버튼 · 글자/아이콘 색 · 로고', af.includes('#3b8af6') && ac === '#3b8af6' && br.includes('#3b8af6'), JSON.stringify([af, ac, br]));
	check('설정 안의 포인트(화면 모드 고른 칸)도 파랑', (await page.locator('.seg-btn.on').evaluate((e) => getComputedStyle(e).backgroundImage)).includes('59, 138, 246'));
	check('이 기기에 저장', (await page.evaluate(() => localStorage.getItem('chat-color-v1'))) === 'ocean');
	await page.screenshot({ path: `${SP}/settings-color.png` });
	check('긴 설정 화면에서도 머리글 52px 그대로 (눌려 줄지 않음)', Math.round((await page.locator('.topbar').boundingBox()).height) === 52, String((await page.locator('.topbar').boundingBox()).height));
	await page.reload(); await page.locator('.swatch.on').waitFor({ timeout: 8000 });
	check('다시 열어도 그대로', (await fill()).includes('#3b8af6') && (await page.getByRole('radio', { name: '파랑' }).isChecked()));
	await page.goto(`${BASE}/`); await page.locator('a.logo').waitFor(); await page.waitForTimeout(400);
	await page.screenshot({ path: `${SP}/home-theme-blue.png` });
	check('★ 홈 로고도 테마 색 (파랑)', (await page.locator('a.logo').evaluate((e) => { const cs = getComputedStyle(e); return cs.backgroundImage + cs.color; })).includes('59, 138, 246'));
	await page.goto(`${BASE}/settings`); await page.locator('.swatch.on').waitFor({ timeout: 8000 });
	await swatch('기본').click(); await page.waitForTimeout(200);
	check('기본으로 되돌리면 저장값도 지운다', (await fill()) === before && (await page.evaluate(() => localStorage.getItem('chat-color-v1'))) === null);
	check('기본으로 되돌리면 앱 색도 원래대로 (주황 → 핑크)', (await tok()).every((v) => !v.includes('#3b8af6')) && (await tok())[0].includes('#f2603f'), JSON.stringify(await tok()));

	console.log('[설정 · 약관 및 정책]');
	const legal = page.locator('a.legal-row');
	check('★ 약관 및 정책 = 이용약관 · 개인정보 처리방침 · 운영정책 (각각 한 줄 설명)', (await legal.count()) === 3
		&& (await legal.locator('.legal-text > span').allInnerTexts()).join(',') === '이용약관,개인정보 처리방침,운영정책'
		&& (await legal.locator('small').allInnerTexts()).every((t) => t.length > 0));
	for (const [label, path, must] of [['이용약관', 'terms', '@cnsa.hs.kr'], ['개인정보 처리방침', 'privacy', '24시간 뒤'], ['운영정책', 'policy', '자동으로 차단']]) {
		await page.locator('a.legal-row', { hasText: label }).click(); await page.waitForURL(`**/settings/${path}`); await page.locator('article h1').waitFor();
		const txt = await page.locator('article').innerText();
		check(`★ ${label} 페이지 (제목 · 시행일 · 내용)`, (await page.locator('article h1').innerText()) === label && txt.includes('시행일') && txt.includes(must) && (await page.locator('article section').count()) >= 3 && txt.length < 600, String(txt.length));
		if (path === 'privacy') await page.screenshot({ path: `${SP}/legal-privacy.png` });
		await page.locator('button.back').click(); await page.waitForURL(/\/settings$/); await page.locator('a.legal-row').first().waitFor();
	}
	await page.locator('a.legal-row').first().scrollIntoViewIfNeeded();
	await page.screenshot({ path: `${SP}/settings-legal.png` });
	await page.goto(`${BASE}/settings/nope`); await page.getByText('없는 문서예요').waitFor({ timeout: 8000 }).catch(() => {});
	check('없는 문서 주소', await page.getByText('없는 문서예요').isVisible());
	await page.goto(`${BASE}/settings`); await page.getByRole('radiogroup', { name: '화면' }).waitFor({ timeout: 8000 });

	console.log('[설정 · 화면 모드]');
	const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
	const mode = (name) => page.getByRole('radio', { name });
	const bar = () => page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content).join(','));
	await page.emulateMedia({ colorScheme: 'light' });
	check('화면: 세 가지 · 기본은 "기기 설정 따르기"', (await page.getByRole('radiogroup', { name: '화면' }).getByRole('radio').count()) === 3
		&& (await mode('기기 설정 따르기').getAttribute('aria-checked')) === 'true');
	check('★ 화면은 한 줄 — 왼쪽 "화면", 오른쪽 아이콘 셋 (글자 없음)', await page.evaluate(() => {
		const g = document.querySelector('[role="radiogroup"][aria-labelledby="theme-h"]'), row = g.closest('.g-row');
		const lab = row.querySelector('#theme-h').getBoundingClientRect(), gr = g.getBoundingClientRect();
		return row.getBoundingClientRect().height < 60 && lab.right < gr.left && g.innerText.trim() === '' && g.querySelectorAll('svg').length === 3;
	}));
	await mode('다크 모드').click(); await page.waitForTimeout(200);
	check('★ 다크 모드를 고르면 폰이 라이트여도 바로 어두워진다', (await bg()) === 'rgb(0, 0, 0)' && (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
	check('상단 바 색도 검정', (await bar()) === '#000000,#000000', await bar());
	check('이 기기에 저장', (await page.evaluate(() => localStorage.getItem('theme-v1'))) === 'dark');
	await page.screenshot({ path: `${SP}/settings-theme-dark.png` });
	await page.reload(); await page.getByRole('radiogroup', { name: '화면' }).waitFor({ timeout: 8000 });
	check('★ 다시 켜도 그대로 (첫 화면부터)', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await mode('다크 모드').getAttribute('aria-checked')) === 'true');
	await page.emulateMedia({ colorScheme: 'dark' });
	await mode('라이트 모드').click(); await page.waitForTimeout(200);
	check('★ 라이트 모드 — 폰이 다크여도 밝게', (await bg()) === 'rgb(255, 255, 255)' && (await bar()) === '#ffffff,#ffffff', await bar());
	await mode('기기 설정 따르기').click(); await page.waitForTimeout(200);
	check('기기 설정 따르기 → 폰 설정(다크)대로 · 저장값 지움', (await bg()) === 'rgb(0, 0, 0)' && (await page.evaluate(() => localStorage.getItem('theme-v1'))) === null
		&& (await page.evaluate(() => document.documentElement.dataset.theme)) === undefined && (await bar()) === '#ffffff,#000000', await bar());
	await page.emulateMedia({ colorScheme: 'light' });
	check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
} finally { await browser.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
