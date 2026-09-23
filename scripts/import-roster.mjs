import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/**
 * 학번-이름 명렬표를 private.student_roster 에 반영한다 (관리자 화면의 "이메일 확인" 옆에
 * 이름을 보여주는 용도). 실명이 들어 있으므로 원본 파일(xlsx/csv)은 절대 git 에 커밋하지 않는다 —
 * 로컬에서 이 스크립트로 서비스 키를 이용해 DB 에 바로 넣는다.
 *
 *   node scripts/import-roster.mjs <csv 경로> <학년 1|2|3>
 *
 * CSV 형식 (헤더 한 줄 + 학번,이름. 엑셀에서 "다른 이름으로 저장 → CSV" 로 바로 만들 수 있다):
 *   학번,이름
 *   10101,홍길동
 *
 * 이미 있는 학번은 이름·학년을 새 값으로 덮어쓴다 (전학·정정 반영).
 */
const [csvPath, gradeArg] = process.argv.slice(2);
const grade = Number(gradeArg);
if (!csvPath || ![1, 2, 3].includes(grade)) {
	console.log('사용법: node scripts/import-roster.mjs <csv 경로> <학년 1|2|3>');
	process.exit(1);
}

const env = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const lines = readFileSync(csvPath, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const [header, ...body] = lines;
if (!header || !/학번/.test(header)) {
	console.error('첫 줄은 헤더(학번,이름)여야 합니다.');
	process.exit(1);
}
const rows = body
	.map((line) => {
		const [no, name] = line.split(',').map((s) => s?.trim());
		return { no: Number(no), name };
	})
	.filter((r) => Number.isInteger(r.no) && r.name);

if (rows.length === 0) {
	console.error('가져올 행이 없습니다.');
	process.exit(1);
}

const { data, error } = await admin.rpc('admin_roster_import', { p_grade: grade, p_rows: rows });
if (error) {
	console.error('실패:', error.message);
	process.exit(1);
}
console.log(`${grade}학년 ${data}명 반영 완료 (전체 ${rows.length}행 중).`);
