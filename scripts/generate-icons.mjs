import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PWA 아이콘 생성 — branding/icon-source.webp 를 헤드리스 Chrome 으로 잘라 PNG 로 만든다.
 * 외부 의존성(sharp 등) 없이 동작.
 *
 *   node scripts/generate-icons.mjs
 *
 * 원본은 검은 배경 위에 둥근 사각형이 올라간 그림이라 그대로 쓰면 모서리에 검은색이 남는다.
 * → 둥근 사각형 부분만 잘라내고, 모서리 뒤는 원본 네 모서리 색으로 만든 그라디언트로 채운다.
 *   (iOS·안드로이드가 각자 모양으로 다시 깎으므로 아이콘은 꽉 찬 정사각형이어야 한다)
 *
 * ⚠️ Windows 헤드리스 Chrome 은 DPI 스케일 때문에 --window-size 보다 크게 그려져
 *    잘릴 수 있으므로 --force-device-scale-factor=1 을 반드시 준다.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const STATIC = join(root, 'static');
const SOURCE = join(root, 'branding', 'icon-source.webp');

// 원본(1254×1254)에서 잰 값 — 둥근 사각형은 x 80~1174, y 80~1147, 모서리 반경 약 19%
const SRC = { size: 1254, x: 101, y: 88, side: 1052 }; // 가장자리 어두운 테두리 8px 은 버린다
// 원본 네 모서리 근처 색
const CORNER = { tl: '#4868f4', tr: '#e92ecb', bl: '#fddb50', br: '#f62e8d' };

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
function html(size) {
	const k = size / SRC.side; // 원본 → 출력 배율
	return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#000;overflow:hidden}
    .i{position:relative;width:${size}px;height:${size}px;overflow:hidden}
    .a,.b{position:absolute;inset:0}
    .a{background:linear-gradient(to right,${CORNER.tl},${CORNER.tr})}
    .b{background:linear-gradient(to right,${CORNER.bl},${CORNER.br});
       -webkit-mask-image:linear-gradient(to bottom,transparent,#000);mask-image:linear-gradient(to bottom,transparent,#000)}
    .c{position:absolute;inset:0;border-radius:24%;overflow:hidden}
    .blur{position:absolute;inset:-10%;filter:blur(${Math.round(size*0.06)}px)}
    .blur img{width:100%;height:100%}
    .c img{position:absolute;width:${SRC.size * k}px;height:${SRC.size * k}px;
       left:${-SRC.x * k}px;top:${-SRC.y * k}px}
  </style><div class="i"><div class="a"></div><div class="b"></div>
  <div class="blur"><img src="${dataUrl}" style="object-fit:cover;object-position:50% 50%;transform:scale(1.6)"></div>
  <div class="c"><img src="${dataUrl}"></div></div>`;
}

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
// 마스커블: 안드로이드가 가장자리 최대 20% 를 깎는다. 도형이 가운데 68% 안에 있어 같은 그림으로 충분하다.
render('icon-maskable-512', 512);
render('apple-touch-icon', 180);
render('favicon-32', 32);
console.log('완료 — static/ 에 저장했습니다.');
