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
	const names = readdirSync(base)
		.filter((d) => /^chromium-\d+$/.test(d))
		.sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
	const binaries = process.platform === 'win32'
		? [['chrome-win', 'chrome.exe'], ['chrome-win64', 'chrome.exe']]
		: process.platform === 'darwin'
			? [['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'], ['chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium']]
			: [['chrome-linux', 'chrome'], ['chrome-linux64', 'chrome']];
	for (const d of names) {
		for (const binary of binaries) {
			const path = join(base, d, ...binary);
			if (existsSync(path)) return path;
		}
	}
	return undefined;
}
export const CHROME = findChrome();
/** 스크린샷 저장 위치 (저장소 밖) */
export const OUT = process.env.E2E_OUT || join(tmpdir(), 'landy-e2e');
mkdirSync(OUT, { recursive: true });

/**
 * 운영 확인창(ConfirmDialog — 브라우저 confirm() 대신) 자동 응답. 예전 `page.on('dialog', …)` 자리.
 * 확인창이 뜨면 answer() 가 참이면 확인, 아니면 취소를 누른다. 지금 페이지와 이후 새로 여는 페이지 모두.
 * 다시 부르면 answer 만 바꾼다.
 */
const answers = new WeakMap();
export async function answerDialogs(page, answer) {
	const first = !answers.has(page);
	answers.set(page, answer);
	if (!first) return;
	await page.exposeFunction('__e2eAnswer', () => !!answers.get(page)());
	const watch = () => {
		if (window.__e2eWatch) return;
		window.__e2eWatch = true;
		new MutationObserver(() => {
			const box = document.querySelector('[role="alertdialog"]:not([data-e2e])');
			if (!box) return;
			box.setAttribute('data-e2e', '');
			void window.__e2eAnswer().then((yes) => box.querySelector(yes ? '.btn' : '.cancel')?.click());
		}).observe(document, { childList: true, subtree: true });
	};
	await page.addInitScript(watch);
	await page.evaluate(watch);
}
