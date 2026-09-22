import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PWA 아이콘 생성 — branding/icon-source.webp 를 헤드리스 Chrome 으로 줄여 PNG 로 만든다.
 * 외부 의존성(sharp 등) 없이 동작.
 *
 *   node scripts/generate-icons.mjs
 *
 * 원본은 가장자리까지 그라디언트가 꽉 찬 정사각형이어야 한다 (둥근 모서리·테두리 없이).
 * iOS·안드로이드가 각자 모양으로 모서리를 깎는다. 로고 도형은 가운데 약 60% 안에 있어
 * 안드로이드 마스커블 안전 영역(지름 80% 원) 안에 들어가므로 같은 그림을 마스커블로도 쓴다.
 *
 * ⚠️ Windows 헤드리스 Chrome 은 DPI 스케일 때문에 --window-size 보다 크게 그려져
 *    잘릴 수 있으므로 --force-device-scale-factor=1 을 반드시 준다.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const STATIC = join(root, 'static');
const SOURCE = join(root, 'branding', 'icon-source.webp');

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

const dataUrl = `data:image/webp;base64,${readFileSync(SOURCE).toString('base64')}`;

/** @param {number} size */
const html = (size) => `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#000;overflow:hidden}
    img{display:block;width:${size}px;height:${size}px}
  </style><img src="${dataUrl}">`;

const tmp = mkdtempSync(join(tmpdir(), 'cnsatinder-icons-'));

/** @param {string} name @param {number} size */
function render(name, size) {
	const page = join(tmp, `${name}.html`);
	const out = join(tmp, `${name}.png`);
	writeFileSync(page, html(size), 'utf8');
	execFileSync(
		CHROME,
		[
			'--headless',
			'--disable-gpu',
			'--hide-scrollbars',
			'--force-device-scale-factor=1',
			'--virtual-time-budget=2000',
			`--window-size=${size},${size}`,
			`--screenshot=${out}`,
			pathToFileURL(page).href
		],
		{ stdio: 'ignore' }
	);
	copyFileSync(out, join(STATIC, `${name}.png`));
	console.log(`  ${name}.png  ${size}x${size}`);
}

console.log('아이콘 생성 중…');
render('icon-192', 192);
render('icon-512', 512);
render('icon-maskable-512', 512);
render('apple-touch-icon', 180);
render('favicon-32', 32);
console.log('완료 — static/ 에 저장했습니다.');
