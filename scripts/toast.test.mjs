import { compileModule } from 'svelte/compiler';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * 알림(토스트) 테스트 — Svelte '브라우저 모드'로 컴파일해서 Node 에서 실행한다.
 *
 *   npm run test:toast
 *
 * 왜 브라우저 모드인가: 다른 클라이언트 테스트(test:chat)는 서버 모드로 컴파일돼 $state 가 그냥 값이다.
 * 이번 버그("알림이 사라지지 않음")는 브라우저에서만 생기는 $state proxy 때문이라 거기선 안 잡힌다.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = [];
function build(name, source, filename) {
	const { js } = compileModule(source, { generate: 'client', filename, dev: false });
	const out = `${root}scripts/.${name}.tmp.mjs`;
	writeFileSync(out, js.code);
	tmp.push(out);
	return pathToFileURL(out).href;
}

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
	const { flushSync } = await import('svelte');

	console.log('\n[1] 고치기 전 코드 — 버그 재현');
	{
		const old = build(
			'toast-old',
			`
			export const S = $state({ toasts: [] });
			let seq = 0;
			export function toast(text) {
				const t = { id: ++seq, text };
				S.toasts.push(t);
				return { t, indexOfOriginal: () => S.toasts.indexOf(t) };
			}`,
			'toast-old.svelte.js'
		);
		const M = await import(old);
		const { indexOfOriginal } = M.toast('옛날 알림');
		check('★ 원본 객체로 찾으면 -1 — 그래서 지워지지 않았다 (원인 확인)', indexOfOriginal() === -1, `indexOf=${indexOfOriginal()}`);
	}

	console.log('\n[2] 고친 코드');
	// Svelte 컴파일러는 모듈의 TS 문법을 직접 읽지 못한다 — Node 내장 기능으로 타입만 벗겨낸다
	const { stripTypeScriptTypes } = await import('node:module');
	const src = stripTypeScriptTypes(readFileSync(`${root}src/lib/toast.svelte.ts`, 'utf8'));
	const url = build('toast', src, 'toast.svelte.ts');
	const T = await import(url);

	T.toast('첫 알림', 300);
	check('알림이 나타난다', T.toasts.length === 1 && T.toasts[0].text === '첫 알림');
	check('처음엔 사라지는 중이 아니다', T.toasts[0].out === false);
	await sleep(330);
	check('표시 시간이 지나면 사라지는 애니메이션이 시작된다 (out=true)', T.toasts[0]?.out === true);
	await sleep(320);
	check('★ 잠시 뒤 목록에서 완전히 사라진다', T.toasts.length === 0, `남은 수 ${T.toasts.length}`);

	console.log('\n[3] 여러 개');
	for (let i = 1; i <= 5; i++) T.toast(`알림 ${i}`, 200);
	check('한꺼번에 최대 3개까지만 보인다 (오래된 것부터 밀려남)', T.toasts.length === 3 && T.toasts[0].text === '알림 3');
	await sleep(550);
	check('★ 전부 사라진다 (밀려난 것의 타이머가 남은 것을 잘못 지우지 않음)', T.toasts.length === 0, `남은 수 ${T.toasts.length}`);

	console.log('\n[4] ★ $effect 안에서 불러도 무한 반복하지 않는다');
	{
		const probe = build(
			'toast-effect',
			`
			import { toast, toasts } from ${JSON.stringify(url)};
			export function run() {
				const state = { runs: 0 };
				const stop = $effect.root(() => {
					$effect(() => {
						state.runs++;
						if (state.runs < 50) toast('effect 안에서', 100);
					});
				});
				return { state, stop };
			}`,
			'toast-effect.svelte.js'
		);
		const P = await import(probe);
		const { state, stop } = P.run();
		flushSync();
		await sleep(50);
		flushSync();
		check('effect 가 한 번만 돈다 (알림 목록 변화에 다시 반응하지 않음)', state.runs === 1, `${state.runs}회`);
		await sleep(450);
		flushSync();
		check('알림이 사라진 뒤에도 effect 가 다시 돌지 않는다', state.runs === 1, `${state.runs}회`);
		stop();
	}
} catch (e) {
	fail++;
	console.error(e);
} finally {
	for (const f of tmp) rmSync(f, { force: true });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
