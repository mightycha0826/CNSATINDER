import tls from 'node:tls';

/**
 * Gmail SMTP 로그인만 따로 시험한다 — Supabase 를 거치지 않는다.
 * 여기서 성공하면 비밀번호는 맞고 Supabase 쪽 저장이 문제, 실패하면 비밀번호/계정 자체가 문제.
 *
 *   node scripts/smtp-check.mjs
 *
 * 비밀번호는 화면에 표시되지 않고, 어디에도 저장·전송되지 않는다 (Gmail 서버에만 보낸다).
 * 메일은 보내지 않는다 — 로그인까지만 확인하고 끊는다.
 */
const HOST = 'smtp.gmail.com';
const PORT = 465;

// 한 번에 여러 줄이 들어와도(붙여넣기·파이프) 다음 질문 몫을 버리지 않도록 남은 입력을 보관한다
let leftover = '';
function ask(q, hidden = false) {
	return new Promise((resolve) => {
		process.stdout.write(q);
		const stdin = process.stdin;
		let buf = '';
		const finish = () => {
			stdin.off('data', on);
			if (hidden && stdin.isTTY) stdin.setRawMode(false);
			stdin.pause();
			process.stdout.write('\n');
			resolve(buf);
		};
		const feed = (chunk) => {
			for (let i = 0; i < chunk.length; i++) {
				const c = chunk[i];
				if (c === '\r' || c === '\n') {
					let j = i + 1;
					if (c === '\r' && chunk[j] === '\n') j++;
					leftover = chunk.slice(j);
					return true;
				}
				if (c === '') process.exit(130); // Ctrl+C
				if (c === '' || c === '\b') {
					buf = buf.slice(0, -1);
					continue;
				}
				buf += c;
				if (hidden) process.stdout.write('*');
			}
			return false;
		};
		const on = (ch) => {
			if (feed(ch)) finish();
		};
		const pre = leftover;
		leftover = '';
		if (pre && feed(pre)) return finish();
		if (hidden && stdin.isTTY) stdin.setRawMode(true);
		stdin.setEncoding('utf8');
		stdin.on('data', on);
		stdin.resume();
	});
}

const user = (await ask('Gmail 주소 (Supabase 의 Username 과 같게): ')).trim();
const raw = await ask('앱 비밀번호 16자리 (입력이 * 로 보임): ', true);
const pass = raw.replace(/\s+/g, '');

console.log('');
if (!/@gmail\.com$|@googlemail\.com$/i.test(user)) console.log('  ⚠ 주소가 @gmail.com 으로 끝나지 않습니다. 개인 Gmail 이 맞는지 확인하세요.');
if (raw !== pass) console.log(`  ℹ 입력에 띄어쓰기가 있어 제거했습니다. Supabase 에도 띄어쓰기 없이 넣어야 합니다.`);
if (pass.length !== 16) console.log(`  ⚠ 비밀번호가 ${pass.length}자입니다. 앱 비밀번호는 16자입니다 — Gmail 로그인 비밀번호를 넣은 것 아닌지 확인하세요.`);

const sock = tls.connect({ host: HOST, port: PORT, servername: HOST });
sock.setEncoding('utf8');
let pending = '';
const waiters = [];
sock.on('data', (d) => {
	pending += d;
	// SMTP 응답: 마지막 줄이 "NNN " 으로 시작하면 한 응답이 끝난 것
	const lines = pending.split('\r\n');
	const done = lines.findIndex((l) => /^\d{3} /.test(l));
	if (done >= 0 && waiters.length) {
		const resp = lines.slice(0, done + 1).join('\n');
		pending = lines.slice(done + 1).join('\r\n');
		waiters.shift()(resp);
	}
});
sock.on('error', (e) => {
	console.log('  ✕ Gmail 서버에 연결하지 못했습니다:', e.message);
	process.exit(1);
});
const next = () => new Promise((r) => waiters.push(r));
const send = (line) => {
	sock.write(line + '\r\n');
	return next();
};

await next(); // 220 인사
await send('EHLO simbun-check');
await send('AUTH LOGIN');
await send(Buffer.from(user).toString('base64'));
const res = await send(Buffer.from(pass).toString('base64'));
sock.write('QUIT\r\n');
sock.end();

if (res.startsWith('235')) {
	console.log('  ✓ 로그인 성공 — 이 주소와 앱 비밀번호는 맞습니다.');
	console.log('    → Supabase SMTP 설정에 이 두 값을 그대로 다시 넣고 Save changes 를 눌러 주세요.');
	console.log('      (Password 칸은 저장 후 비어 보이므로, 다른 칸을 고쳐 저장할 때 비밀번호가 빠졌을 수 있습니다)');
} else if (res.startsWith('534')) {
	console.log('  ✕ 534 — 앱 비밀번호가 필요합니다. 2단계 인증을 켜고 앱 비밀번호를 만들어 쓰세요.');
} else if (res.startsWith('535')) {
	console.log('  ✕ 535 — Gmail 이 이 주소/비밀번호 조합을 거절했습니다. Supabase 와 같은 증상입니다.');
	console.log('    가장 흔한 원인:');
	console.log('    1) 앱 비밀번호를 다른 Google 계정에서 만듦 (예: 학교 계정으로 로그인된 크롬)');
	console.log('       → https://myaccount.google.com/apppasswords 오른쪽 위 프로필이 위 Gmail 주소인지 확인');
	console.log('    2) Gmail 로그인 비밀번호를 넣음 (앱 비밀번호가 아님)');
	console.log('    3) 앱 비밀번호를 만든 뒤 Google 계정 비밀번호를 바꿈 (그러면 앱 비밀번호가 전부 무효가 됨)');
} else {
	console.log('  ? 예상하지 못한 응답:', res.split('\n').pop());
}
process.exit(0);
