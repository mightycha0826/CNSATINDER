import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PWA 아이콘 생성 — 헤드리스 Chrome 으로 HTML 을 PNG 로 렌더한다.
 * 외부 의존성(sharp 등) 없이 동작.
 *
 *   node scripts/generate-icons.mjs
 *
 * ⚠️ Windows 헤드리스 Chrome 은 DPI 스케일 때문에 --window-size 보다 넓게 렌더한 뒤
 *    잘라내므로, --force-device-scale-factor=1 을 반드시 준다.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const STATIC = join(root, 'static');

const CHROME = [
	'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
	'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find((p) => existsSync(p));

if (!CHROME) {
	console.error('Chrome/Edge 를 찾지 못했습니다. 아이콘 생성을 건너뜁니다.');
	process.exit(1);
}

/**
 * @param {number} size
 * @param {boolean} maskable  true 면 안전 영역(80%)을 확보한 마스커블 아이콘
 */
function html(size, maskable) {
	const inset = maskable ? 0.2 : 0; // 마스커블은 가장자리 20% 가 잘릴 수 있다
	const fs = Math.round(size * (maskable ? 0.28 : 0.34));
	return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#000}
    .i{width:${size}px;height:${size}px;display:grid;place-items:center;background:#000;
       padding:${Math.round(size * inset * 0.5)}px;box-sizing:border-box}
    .t{color:#fff;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;
       font-weight:800;font-size:${fs}px;letter-spacing:-0.05em;line-height:1}
  </style><div class="i"><div class="t">십분</div></div>`;
}

const tmp = mkdtempSync(join(tmpdir(), 'simbun-icons-'));

/** @param {string} name @param {number} size @param {boolean} maskable */
function render(name, size, maskable) {
	const page = join(tmp, `${name}.html`);
	const out = join(tmp, `${name}.png`);
	writeFileSync(page, html(size, maskable), 'utf8');
	execFileSync(
		CHROME,
		[
			'--headless',
			'--disable-gpu',
			'--hide-scrollbars',
			'--force-device-scale-factor=1',
			`--window-size=${size},${size}`,
			`--screenshot=${out}`,
			`file:///${page.replace(/\\/g, '/')}`
		],
		{ stdio: 'ignore' }
	);
	copyFileSync(out, join(STATIC, `${name}.png`));
	console.log(`  ${name}.png  ${size}x${size}${maskable ? '  (maskable)' : ''}`);
}

console.log('아이콘 생성 중…');
render('icon-192', 192, false);
render('icon-512', 512, false);
render('icon-maskable-512', 512, true);
render('apple-touch-icon', 180, false);
console.log('완료 — static/ 에 저장했습니다.');
