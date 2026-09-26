import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { CHROME, ROOT } from './e2e/_env.mjs';

/**
 * 알림 배지 — 안드로이드 상태바 · 알림 왼쪽 위의 작은 아이콘 (static/badge-96.png).
 *
 *   node scripts/generate-badge.mjs
 *
 * 안드로이드는 배지 이미지의 "투명도만" 쓰고 색은 버린다 → 꽉 찬 컬러 아이콘(icon-192.png)을 주면 흰 사각형이 된다.
 * 그래서 앱 아이콘(static/icon-512.png)에서 흰 로고 부분만 남기고 나머지(그라디언트 바탕)는 투명하게 만든다.
 * 흰색에 가까울수록(가장 어두운 채널이 밝을수록) 불투명 — 가장자리 부드러움도 그대로 살아난다. 로고만 잘라 배지를 채운다.
 */
const SIZE = 96;
const src = `data:image/png;base64,${readFileSync(join(ROOT, 'static', 'icon-512.png')).toString('base64')}`;

const browser = await chromium.launch({ executablePath: CHROME });
try {
	const page = await browser.newPage();
	const png = await page.evaluate(
		async ({ src, SIZE }) => {
			const img = new Image();
			img.src = src;
			await img.decode();
			// 1) 원본 크기에서 흰 로고만 남긴다
			const N = img.naturalWidth;
			const a = document.createElement('canvas');
			a.width = a.height = N;
			const ga = a.getContext('2d');
			ga.drawImage(img, 0, 0);
			const d = ga.getImageData(0, 0, N, N);
			const p = d.data;
			let x0 = N, y0 = N, x1 = 0, y1 = 0;
			for (let i = 0; i < p.length; i += 4) {
				const lo = Math.min(p[i], p[i + 1], p[i + 2]); // 바탕(주황~핑크)은 파랑 채널이 낮다, 로고(흰색)는 모두 높다
				const al = Math.max(0, Math.min(1, (lo - 150) / (235 - 150)));
				p[i] = p[i + 1] = p[i + 2] = 255;
				p[i + 3] = Math.round(al * 255);
				if (al > 0.5) {
					const x = (i / 4) % N, y = Math.floor(i / 4 / N);
					x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
				}
			}
			ga.putImageData(d, 0, 0);
			// 2) 로고가 배지를 거의 채우게 (둘레 8% 여백) — 상태바에서 24dp 로 작게 보이므로
			const side = Math.max(x1 - x0, y1 - y0) / 0.84;
			const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
			const c = document.createElement('canvas');
			c.width = c.height = SIZE;
			const g = c.getContext('2d');
			g.imageSmoothingQuality = 'high';
			g.drawImage(a, cx - side / 2, cy - side / 2, side, side, 0, 0, SIZE, SIZE);
			return c.toDataURL('image/png').split(',')[1];
		},
		{ src, SIZE }
	);
	writeFileSync(join(ROOT, 'static', 'badge-96.png'), Buffer.from(png, 'base64'));
	console.log(`static/badge-96.png  ${SIZE}x${SIZE}`);
} finally {
	await browser.close();
}
