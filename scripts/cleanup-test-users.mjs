import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/**
 * 테스트 스크립트가 중간에 죽어서 남긴 일회용 계정 정리.
 * 이메일이 아래 접두사로 시작하는 계정만 지운다 — 실제 학생 계정은 절대 건드리지 않는다.
 *
 *   node scripts/cleanup-test-users.mjs          (목록만 보여줌)
 *   node scripts/cleanup-test-users.mjs --delete (삭제)
 */
const PREFIXES = ['simbun-e2e-', 'simbun-stress-', 'simbun-warm-'];

const env = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const found = [];
for (let page = 1; ; page++) {
	const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
	if (error) throw error;
	for (const u of data.users) {
		if (u.email && PREFIXES.some((p) => u.email.startsWith(p)) && u.email.endsWith('@cnsa.hs.kr')) found.push(u);
	}
	if (data.users.length < 1000) break;
}

console.log(`테스트 계정 ${found.length}개`);
for (const u of found) console.log(`  ${u.email}`);
if (process.argv.includes('--delete')) {
	for (const u of found) await admin.auth.admin.deleteUser(u.id);
	console.log(`${found.length}개 삭제했습니다.`);
} else if (found.length) {
	console.log('\n지우려면 --delete 를 붙여 다시 실행하세요.');
}
