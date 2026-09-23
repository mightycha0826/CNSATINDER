import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/**
 * 학번-이름 명렬표를 private.student_roster 에 반영한다 (관리자 화면의 "이메일 확인" 옆에
 * 이름을 보여주는 용도). 실명이 들어 있으므로 원본 파일(xlsx/csv)은 절대 git 에 커밋하지 않는다 —
 * 로컬에서 이 스크립트로 서비스 키를 이용해 DB 에 바로 넣는다.
 *
 *   node scripts/import-roster.mjs <csv 경로> [--dry-run]
 *
 * CSV 형식 (헤더 한 줄 + 학번,이름). 여러 학년을 한 파일에 섞어도 된다 — 학년은 학번 첫 자리로 정한다.
 *   학번,이름
 *   10101,홍길동
 *   20101,김철수
 *
 * 엑셀 "CSV" 저장(CP949)과 "CSV UTF-8" 저장 둘 다 읽는다.
 * 이미 있는 학번은 이름·학년을 새 값으로 덮어쓴다 (전학·정정 반영). 이름이 빈 행은 건너뛴다.
 * --dry-run 이면 DB 에 쓰지 않고 학년별 인원만 보여준다.
 */
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const csvPath = args.find((a) => !a.startsWith('--'));
if (!csvPath) {
	console.log('사용법: node scripts/import-roster.mjs <csv 경로> [--dry-run]');
	process.exit(1);
}

const bytes = readFileSync(csvPath);
let text;
try {
	text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
} catch {
	text = new TextDecoder('euc-kr').decode(bytes); // 한글 윈도우 엑셀 기본 CSV (CP949)
}
const [header, ...body] = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
if (!header || !/학번/.test(header)) {
	console.error('첫 줄은 헤더(학번,이름)여야 합니다.');
	process.exit(1);
}

const byGrade = new Map();
const skipped = [];
for (const line of body) {
	const [noText, name] = line.split(',').map((s) => s?.trim());
	const no = Number(noText);
	const grade = Math.floor(no / 10000);
	if (!Number.isInteger(no) || ![1, 2, 3].includes(grade) || !name) {
		skipped.push(line);
		continue;
	}
	if (!byGrade.has(grade)) byGrade.set(grade, []);
	byGrade.get(grade).push({ no, name });
}

for (const [grade, rows] of [...byGrade].sort()) console.log(`${grade}학년 ${rows.length}명`);
if (skipped.length) console.log(`건너뜀 ${skipped.length}행 (이름 없음·학번 형식 오류): ${skipped.join(' | ')}`);
if (byGrade.size === 0) {
	console.error('가져올 행이 없습니다.');
	process.exit(1);
}
if (dryRun) process.exit(0);

const env = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const [grade, rows] of [...byGrade].sort()) {
	const { data, error } = await admin.rpc('admin_roster_import', { p_grade: grade, p_rows: rows });
	if (error) {
		console.error(`${grade}학년 실패:`, error.message);
		process.exit(1);
	}
	console.log(`${grade}학년 ${data}명 반영 완료.`);
}
