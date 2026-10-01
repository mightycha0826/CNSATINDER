import { spawn as nodeSpawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VITE = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));
const children = new Set();

/** .cmd를 거치지 않고 현재 Node로 Vite/스위트를 실행한다. 한글·공백 경로도 인수 그대로 전달한다. */
export function spawn(command, args, options = {}) {
	if (command === 'npx' && args[0] === 'vite') {
		command = process.execPath;
		args = [VITE, ...args.slice(1)];
	} else if (command === 'node') command = process.execPath;
	const child = nodeSpawn(command, args, { ...options, detached: process.platform !== 'win32', windowsHide: true });
	children.add(child);
	child.once('exit', () => children.delete(child));
	child.once('error', () => children.delete(child));
	return child;
}

/** 직접 띄운 프로세스와 자식만 정리한다. OS별로 프로세스 트리/그룹을 함께 종료한다. */
export function stopProcess(child) {
	children.delete(child);
	if (!child?.pid) return;
	if (process.platform === 'win32') {
		if (child.exitCode !== null || child.signalCode !== null) return;
		try {
			execFileSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
		} catch {
			try { child.kill(); } catch { /* 이미 종료 */ }
		}
	} else {
		try { process.kill(-child.pid, 'SIGTERM'); }
		catch { try { child.kill(); } catch { /* 이미 종료 */ } }
	}
}

// 스위트가 실패하거나 process.exit를 호출해도 자신이 띄운 서버를 남기지 않는다.
process.once('exit', () => { for (const child of [...children]) stopProcess(child); });
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.once(signal, () => {
		for (const child of [...children]) stopProcess(child);
		process.exit(signal === 'SIGINT' ? 130 : 143);
	});
}
