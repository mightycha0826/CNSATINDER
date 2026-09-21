import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * 설치 안내 환경 판별 테스트 — 실제 기기 UA 문자열로 확인한다.
 *
 *   npm run test:platform
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}scripts/.platform.tmp.mjs`;
writeFileSync(out, stripTypeScriptTypes(readFileSync(`${root}src/lib/platform.ts`, 'utf8')));

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
};

const UA = {
	iosSafari:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
	iosChrome:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1',
	iosKakao:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.6.0',
	iosInsta:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 385.0.0.28.84 (iPhone15,3; iOS 18_5; ko_KR; ko; scale=3.00; 1290x2796; 745129203)',
	iosWebview:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
	ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
	androidChrome:
		'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
	androidKakao:
		'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 KAKAOTALK 25060',
	androidSamsung:
		'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36'
};

try {
	const { detectEnv, openExternalUrl } = await import(pathToFileURL(out).href);
	const e = (ua, platform = '', touch = 0) => detectEnv(ua, platform, touch);
	const URL_ = 'https://cnsatinder.mightycha0826.workers.dev/';

	let v = e(UA.iosSafari, 'iPhone', 5);
	check('iOS Safari → 설치 안내 (인앱 아님)', v.os === 'ios' && v.browser === 'safari' && v.inApp === null, JSON.stringify(v));
	v = e(UA.iosChrome, 'iPhone', 5);
	check('iOS Chrome → chrome 으로 구분', v.os === 'ios' && v.browser === 'chrome' && v.inApp === null, JSON.stringify(v));
	v = e(UA.iosKakao, 'iPhone', 5);
	check('★ iOS 카카오톡 인앱 → kakao', v.inApp === 'kakao', JSON.stringify(v));
	check('★ 카카오톡은 Safari 로 여는 스킴 제공', openExternalUrl(v, URL_) === `kakaotalk://web/openExternal?url=${encodeURIComponent(URL_)}`);
	v = e(UA.iosInsta, 'iPhone', 5);
	check('iOS 인스타 인앱 → instagram, 스킴 없음(메뉴 안내)', v.inApp === 'instagram' && openExternalUrl(v, URL_) === null, JSON.stringify(v));
	v = e(UA.iosWebview, 'iPhone', 5);
	check('iOS 알 수 없는 앱 웹뷰 (Safari/ 없음) → webview', v.inApp === 'webview', JSON.stringify(v));
	v = e(UA.ipad, 'MacIntel', 5);
	check('iPadOS (Mac 으로 위장) → ios', v.os === 'ios' && v.browser === 'safari' && v.inApp === null, JSON.stringify(v));
	v = e(UA.ipad, 'MacIntel', 0);
	check('진짜 Mac Safari → ios 아님', v.os === 'other', JSON.stringify(v));
	v = e(UA.androidChrome);
	check('안드로이드 Chrome → 인앱 아님', v.os === 'android' && v.browser === 'chrome' && v.inApp === null, JSON.stringify(v));
	v = e(UA.androidKakao);
	check('안드로이드 카카오톡 → kakao', v.os === 'android' && v.inApp === 'kakao', JSON.stringify(v));
	v = e(UA.androidSamsung);
	check('삼성 인터넷 → samsung, 인앱 아님', v.browser === 'samsung' && v.inApp === null, JSON.stringify(v));
	const intent = openExternalUrl({ os: 'android', browser: 'chrome', inApp: 'webview' }, URL_);
	check('안드로이드 인앱 → Chrome intent', intent === 'intent://cnsatinder.mightycha0826.workers.dev/#Intent;scheme=https;package=com.android.chrome;end', intent);
} catch (err) {
	fail++;
	console.error(err);
} finally {
	rmSync(out, { force: true });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
