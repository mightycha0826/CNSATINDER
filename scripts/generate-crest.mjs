import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { CHROME, ROOT } from './e2e/_env.mjs';

/**
 * 교표 (충남삼성고 · 교복 가슴에 다는 것) — 프로필 교복 그림의 주머니 위 (static/school-crest.png, Phase 60).
 *
 *   node scripts/generate-crest.mjs
 *
 * 원본(branding/school-crest-source.jpg)은 흰 바탕 사진이다. 그림은 그대로 두고 바탕만 투명하게:
 *  1) 가장자리에서 이어진 흰 칸만 채우기(flood fill)로 바탕이라 본다 — 교표 안쪽의 흰 부분(잎 · 글자)은 그대로.
 *  2) 바탕에 닿은 테두리 몇 픽셀은 흰색을 빼서 반투명으로 (color to alpha) — 가장자리가 흰 테 없이 부드럽게.
 *  3) 여백을 잘라 높이 256 으로.
 */
const H = 256;
const src = `data:image/jpeg;base64,${readFileSync(join(ROOT, 'branding', 'school-crest-source.jpg')).toString('base64')}`;

const browser = await chromium.launch({ executablePath: CHROME });
try {
	const page = await browser.newPage();
	const out = await page.evaluate(
		async ({ src, H }) => {
			const img = new Image();
			img.src = src;
			await img.decode();
			const W0 = img.naturalWidth, H0 = img.naturalHeight;
			const a = document.createElement('canvas');
			a.width = W0;
			a.height = H0;
			const ga = a.getContext('2d');
			ga.drawImage(img, 0, 0);
			const d = ga.getImageData(0, 0, W0, H0);
			const p = d.data;
			const lo = (i) => Math.min(p[i], p[i + 1], p[i + 2]);
			const hi = (i) => Math.max(p[i], p[i + 1], p[i + 2]);
			// 바탕 = 밝고(가장 어두운 채널 ≥ 232) 색이 거의 없는(채널 차 ≤ 18) 칸
			const white = (k) => lo(k * 4) >= 232 && hi(k * 4) - lo(k * 4) <= 18;

			// 1) 가장자리에서 채우기
			const bg = new Uint8Array(W0 * H0);
			const stack = [];
			for (let x = 0; x < W0; x++) stack.push(x, (H0 - 1) * W0 + x);
			for (let y = 0; y < H0; y++) stack.push(y * W0, y * W0 + W0 - 1);
			while (stack.length) {
				const k = stack.pop();
				if (bg[k] || !white(k)) continue;
				bg[k] = 1;
				const x = k % W0, y = (k - x) / W0;
				if (x > 0) stack.push(k - 1);
				if (x < W0 - 1) stack.push(k + 1);
				if (y > 0) stack.push(k - W0);
				if (y < H0 - 1) stack.push(k + W0);
			}

			// 2) 바탕은 투명, 바탕에서 2칸 안의 테두리는 흰색을 빼서 반투명
			const near = (k) => {
				const x = k % W0, y = (k - x) / W0;
				for (let dy = -2; dy <= 2; dy++)
					for (let dx = -2; dx <= 2; dx++) {
						const xx = x + dx, yy = y + dy;
						if (xx >= 0 && yy >= 0 && xx < W0 && yy < H0 && bg[yy * W0 + xx]) return true;
					}
				return false;
			};
			let x0 = W0, y0 = H0, x1 = 0, y1 = 0;
			for (let k = 0; k < W0 * H0; k++) {
				const i = k * 4;
				if (bg[k]) {
					p[i + 3] = 0;
					continue;
				}
				if (near(k)) {
					const al = (255 - lo(i)) / 255; // 흰색에서 가장 먼 채널만큼 불투명
					if (al < 0.02) {
						p[i + 3] = 0;
						continue;
					}
					for (let c = 0; c < 3; c++) p[i + c] = Math.round(Math.max(0, Math.min(255, (p[i + c] - 255 * (1 - al)) / al)));
					p[i + 3] = Math.round(al * 255);
				}
				const x = k % W0, y = (k - x) / W0;
				x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
			}
			ga.putImageData(d, 0, 0);

			// 3) 여백을 잘라 높이 H
			const w = x1 - x0 + 1, h = y1 - y0 + 1;
			const W = Math.round((w / h) * H);
			const c = document.createElement('canvas');
			c.width = W;
			c.height = H;
			const g = c.getContext('2d');
			g.imageSmoothingQuality = 'high';
			g.drawImage(a, x0, y0, w, h, 0, 0, W, H);
			return { png: c.toDataURL('image/png').split(',')[1], W };
		},
		{ src, H }
	);
	writeFileSync(join(ROOT, 'static', 'school-crest.png'), Buffer.from(out.png, 'base64'));
	console.log(`static/school-crest.png  ${out.W}x${H}`);
} finally {
	await browser.close();
}
