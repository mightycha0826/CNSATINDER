import { createServer } from 'vite';

/**
 * 운영자 세션 쿠키(HMAC) 테스트 — 위조·변조·만료가 모두 거부되는지.
 *
 *   npm run test:admin
 */
/** 실제 .env를 읽지 않고 세션 코드에 가짜 비밀키만 넣는다. 키 교체 검사는 별도 서버로 격리한다. */
function serverForSecret(secret) {
	return createServer({
		configFile: false,
		envFile: false,
		server: { middlewareMode: true, hmr: false, ws: false },
		appType: 'custom',
		logLevel: 'error',
		plugins: [{
			name: 'admin-session-test-secret',
			resolveId: (id) => id === '$env/dynamic/private' ? '\0admin-session-test-secret' : undefined,
			load: (id) => id === '\0admin-session-test-secret' ? `export const env = { ADMIN_SESSION_SECRET: ${JSON.stringify(secret)} };` : undefined
		}]
	});
}

const vite = await serverForSecret('test-secret-'.padEnd(48, 'x'));
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
};

/** SvelteKit Cookies 의 최소 흉내 */
function jar() {
	const m = new Map();
	return {
		m,
		get: (k) => m.get(k)?.value,
		set: (k, value, opts) => m.set(k, { value, opts }),
		delete: (k) => m.delete(k)
	};
}

try {
	const S = await vite.ssrLoadModule('/src/lib/server/adminSession.ts');
	const uid = '3f1c2b4a-1111-4222-8333-944455556666';

	console.log('\n[1] 정상 발급 · 검증');
	const c = jar();
	await S.issueSession(c, uid, true);
	const opts = c.m.get(S.ADMIN_COOKIE).opts;
	check('발급한 쿠키를 읽으면 같은 사용자', (await S.readSession(c)) === uid);
	check('httpOnly — 스크립트로 못 읽는다', opts.httpOnly === true);
	check('sameSite=strict — 다른 사이트에서 딸려오지 않는다', opts.sameSite === 'strict');
	check('경로가 /admin 으로 한정된다', opts.path === '/admin');
	check('secure', opts.secure === true);
	check('8시간 만료', opts.maxAge === 8 * 3600);

	const raw = c.get(S.ADMIN_COOKIE);
	const [, exp, sig] = raw.split('.');

	console.log('\n[2] ★ 위조 · 변조');
	const forge = async (v) => {
		const j = jar();
		j.set(S.ADMIN_COOKIE, v);
		return S.readSession(j);
	};
	const other = '9f9f9f9f-2222-4333-8444-955566667777';
	check('★ 사용자 id 만 바꿔치기 → 거부', (await forge(`${other}.${exp}.${sig}`)) === null);
	check('★ 만료 시각을 늘리기 → 거부', (await forge(`${uid}.${Number(exp) + 999999}.${sig}`)) === null);
	const flipped = sig.slice(0, -2) + (sig.at(-2) === 'A' ? 'B' : 'A') + sig.at(-1);
	check('★ 서명 한 글자 변조 → 거부', (await forge(`${uid}.${exp}.${flipped}`)) === null);
	check('서명 없음 → 거부', (await forge(`${uid}.${exp}`)) === null);
	check('빈 서명 → 거부', (await forge(`${uid}.${exp}.`)) === null);
	check('쓰레기 값 → 거부', (await forge('hello')) === null);
	check('uuid 형식이 아닌 id → 거부', (await forge(`admin.${exp}.${sig}`)) === null);

	console.log('\n[3] 만료');
	const past = Math.floor(Date.now() / 1000) - 10;
	check('만료된 쿠키 → 거부 (서명이 맞아도)', (await forge(`${uid}.${past}.${sig}`)) === null);

	// 비밀키마다 모듈을 새로 불러서 이전 서명키가 섞이지 않게 한다.
	console.log('\n[4] ★ 비밀키');
	async function withSecret(secret, fn) {
		const v = await serverForSecret(secret);
		try {
			return await fn(await v.ssrLoadModule('/src/lib/server/adminSession.ts'));
		} finally {
			await v.close();
		}
	}
	await withSecret('another-secret-'.padEnd(48, 'y'), async (S2) => {
		check('★ 다른 비밀키로 서명한 쿠키는 거부 (키 교체 = 전원 로그아웃)', (await S2.readSession(c)) === null);
	});
	await withSecret('short', async (S3) => {
		let threw = false;
		try {
			await S3.issueSession(jar(), uid, true);
		} catch {
			threw = true;
		}
		check('비밀키가 짧으면(32자 미만) 발급 자체를 거부', threw);
		check('비밀키가 짧으면 검증도 통과시키지 않는다', (await S3.readSession(c)) === null);
	});
} catch (e) {
	fail++;
	console.error(e);
} finally {
	await vite.close();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
