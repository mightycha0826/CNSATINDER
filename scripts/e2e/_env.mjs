import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 저장소 맨 위 (vite 를 여기서 띄운다) */
export const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
/**
 * 브라우저 — CHROMIUM_PATH 가 있으면 그것. 없으면 PLAYWRIGHT_BROWSERS_PATH 에 이미 깔린 Chromium 중 가장 새 것
 * (playwright-core 판과 번호가 달라도 쓸 수 있게). 그것도 없으면 playwright 기본값 — CI 는
 * `npx playwright-core install chromium` 으로 받는다.
 */
function findChrome() {
	if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
	const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
	if (!base || !existsSync(base)) return undefined;
	const found = readdirSync(base)
		.filter((d) => /^chromium-\d+$/.test(d))
		.map((d) => join(base, d, 'chrome-linux', 'chrome'))
		.filter((p) => existsSync(p))
		.sort();
	return found.at(-1);
}
export const CHROME = findChrome();
/** 스크린샷 저장 위치 (저장소 밖) */
export const OUT = process.env.E2E_OUT || join(tmpdir(), 'cnsatinder-e2e');
mkdirSync(OUT, { recursive: true });
