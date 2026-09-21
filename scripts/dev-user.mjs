import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/**
 * 개발용 테스트 계정 만들기 (메일 발송 없음).
 *
 *   node scripts/dev-user.mjs simbun-test3@cnsa.hs.kr 비밀번호 [m|f] [m|f|any]
 *
 * 성별·선호를 주면 온보딩까지 끝낸 상태로 만든다.
 *
 * 왜 대시보드 "Add user" 대신 이걸 쓰나:
 *   계정 선점 방지 트리거가 "이메일 확인 전인 계정의 비밀번호"를 지운다. Supabase 는 Add user(Auto Confirm)를
 *   내부적으로 '미확인 생성 → 확인' 순서로 처리하므로 거기서 넣은 비밀번호는 지워진다.
 *   여기서는 확인된 계정을 먼저 만들고 비밀번호를 그다음에 넣는다.
 */
const [email, password, gender, want] = process.argv.slice(2);
if (!email || !password) {
	console.log('사용법: node scripts/dev-user.mjs <이메일@cnsa.hs.kr> <비밀번호> [m|f] [m|f|any]');
	process.exit(1);
}

const env = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
if (error) {
	console.error('생성 실패:', error.message);
	process.exit(1);
}
const { error: pe } = await admin.auth.admin.updateUserById(data.user.id, { password });
if (pe) {
	console.error('비밀번호 설정 실패:', pe.message);
	process.exit(1);
}
if (gender) {
	await admin
		.from('profiles')
		.update({ gender, want: want ?? (gender === 'm' ? 'f' : 'm'), onboarded: true })
		.eq('id', data.user.id);
}
console.log(`만들었어요: ${email}${gender ? ` (성별 ${gender}, 온보딩 완료)` : ' (첫 로그인 때 온보딩)'}`);
