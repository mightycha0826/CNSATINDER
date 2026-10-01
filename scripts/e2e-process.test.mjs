// 외부 서비스·브라우저 없이 UI runner의 경로, 실행 파일, 자식 프로세스 정리를 검증한다.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { connect } from 'node:net';
import { spawn, stopProcess } from './e2e/_process.mjs';
import { ROOT } from './e2e/_env.mjs';
import { fileURLToPath } from 'node:url';

async function output(command, args) {
	const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
	let text = '';
	child.stdout.on('data', (d) => (text += d));
	child.stderr.on('data', (d) => (text += d));
	const [code] = await once(child, 'exit');
	return { code, text };
}

const path = fileURLToPath(new URL('./e2e/run.mjs', import.meta.url));
const listing = await output('node', [path, 'nonexistent']);
assert.equal(listing.code, 2);
assert.match(listing.text, /있는 것: .*bot/);
console.log('  PASS  한글 작업 경로에서 runner가 suite 목록을 읽는다');

const argument = '한글과 공백이 있는 경로';
const echoed = await output('node', ['-e', 'console.log(process.argv[1])', argument]);
assert.equal(echoed.code, 0);
assert.equal(echoed.text.trim(), argument);
const vite = await output('npx', ['vite', '--version']);
assert.equal(vite.code, 0, vite.text);
assert.match(vite.text, /vite\//);
console.log('  PASS  Node·Vite를 .cmd 셸 없이 실행하고 인수를 보존한다');

const grandchild = `require('node:net').createServer().listen(0, '127.0.0.1', function () { console.log(JSON.stringify({ port: this.address().port, pid: process.pid })); });`;
const parent = spawn('node', ['-e', `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'inherit', windowsHide: true });`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let descendant;
try {
	const [data] = await once(parent.stdout, 'data', { signal: AbortSignal.timeout(5000) });
	descendant = JSON.parse(String(data));
	const exited = once(parent, 'exit');
	stopProcess(parent);
	await exited;
	const listening = await new Promise((resolve) => {
		const socket = connect(descendant.port, '127.0.0.1');
		socket.once('connect', () => { socket.destroy(); resolve(true); });
		socket.once('error', () => resolve(false));
	});
	assert.equal(listening, false, '자식 서버가 포트를 계속 잡고 있다');
	console.log('  PASS  스위트 종료 시 자식 서버까지 정리한다');
} finally {
	stopProcess(parent);
	if (descendant) try { process.kill(descendant.pid); } catch { /* 이미 종료 */ }
}
console.log('\n3 passed, 0 failed');
