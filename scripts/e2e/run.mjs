/**
 * 화면(브라우저) 테스트 전부 — 가짜 Supabase · /dev 미리보기로 돌아서 실서버·계정이 필요 없다.
 *
 *   npm run test:ui                 전부
 *   npm run test:ui -- react sheet  골라서
 *
 * 스위트마다 자기 포트에 vite dev 를 띄운다. back · login · notices · letters 는 여기서 5199 에 띄워 준다.
 * 스크린샷은 저장소 밖(E2E_OUT, 기본 OS 임시 폴더/cnsatinder-e2e)에.
 */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { ROOT, OUT } from './_env.mjs';

const DIR = new URL('.', import.meta.url).pathname;
const ALL = readdirSync(DIR)
	.filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'run.mjs')
	.map((f) => f.replace(/\.mjs$/, ''))
	.sort();
const NEEDS_SERVER = new Set(['back', 'login', 'notices', 'letters']);
const pick = process.argv.slice(2);
const unknown = pick.filter((p) => !ALL.includes(p));
if (unknown.length) {
	console.error(`없는 테스트: ${unknown.join(', ')}\n있는 것: ${ALL.join(', ')}`);
	process.exit(2);
}
const suites = pick.length ? pick : ALL;

const env = {
	...process.env,
	PUBLIC_SUPABASE_URL: 'https://fake-proj.supabase.co',
	PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest'
};

async function devServer(port) {
	// 프로세스 그룹째 띄우고 그룹째 끈다 — npx 만 끄면 그 아래 vite 가 남아 포트를 붙든다
	const vite = spawn('npx', ['vite', 'dev', '--port', String(port), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
	let out = '';
	vite.stdout.on('data', (d) => (out += d));
	vite.stderr.on('data', (d) => (out += d));
	for (let i = 0; i < 120 && !out.includes('ready'); i++) await new Promise((r) => setTimeout(r, 500));
	const stop = () => {
		try {
			process.kill(-vite.pid);
		} catch {
			/* 이미 꺼짐 */
		}
	};
	if (!out.includes('ready')) {
		stop();
		throw new Error(`vite dev (${port}) 가 뜨지 않았다\n${out}`);
	}
	return { stop };
}

function run(name) {
	return new Promise((resolve) => {
		let log = '';
		// 스위트도 자기 프로세스 그룹에서 — 끝나면 그룹째 정리해서, 스위트가 띄운 vite 가 남아 다음 스위트의 포트를 막지 않게
		const p = spawn('node', [`${DIR}${name}.mjs`], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
		p.stdout.on('data', (d) => (log += d));
		p.stderr.on('data', (d) => (log += d));
		p.on('exit', (code) => {
			try {
				process.kill(-p.pid);
			} catch {
				/* 이미 다 꺼짐 */
			}
			setTimeout(() => resolve({ code, log }), 300);
		});
	});
}

let server = null;
const results = [];
try {
	for (const name of suites) {
		if (NEEDS_SERVER.has(name) && !server) server = await devServer(5199);
		const t0 = Date.now();
		const { code, log } = await run(name);
		const pass = (log.match(/\bPASS\b/g) ?? []).length;
		const fail = (log.match(/\bFAIL\b/g) ?? []).length;
		const ok = code === 0 && fail === 0;
		results.push({ name, ok });
		console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(14)} ${pass} passed, ${fail} failed  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
		if (!ok) console.log(log.replace(/^/gm, '      '));
	}
} finally {
	server?.stop();
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} suites ok${bad.length ? ` — 실패: ${bad.map((r) => r.name).join(', ')}` : ''}  (스크린샷: ${OUT})`);
process.exit(bad.length ? 1 : 0);
