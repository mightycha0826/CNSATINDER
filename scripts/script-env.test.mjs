import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseScriptEnv, readScriptEnv } from './lib/env.mjs';

test('기존 운영 스크립트의 설정 형식과 값 보존 규칙을 유지한다', () => {
	assert.deepEqual(parseScriptEnv('# comment\r\nURL=https://example.test?q=a=b\r\nKEY=  token==  \r\nEMPTY=\r\nlower=ignored\r\n export X=ignored\r\nKEY=last\r\n'), {
		URL: 'https://example.test?q=a=b', KEY: 'last', EMPTY: ''
	});
});

test('일반 텍스트와 빈 입력에서는 설정을 만들지 않는다', () => {
	assert.deepEqual(parseScriptEnv(''), {});
	assert.deepEqual(parseScriptEnv('not an assignment\n#X=comment'), {});
});

test('지정한 파일은 UTF-8로 읽고 읽기 오류는 숨기지 않는다', () => {
	const path = join(tmpdir(), `landy-env-${randomUUID()}.tmp`);
	try {
		writeFileSync(path, 'NAME=테스트\nKEY=fake-test-value');
		assert.deepEqual(readScriptEnv(path), { NAME: '테스트', KEY: 'fake-test-value' });
	} finally {
		unlinkSync(path);
	}
	assert.throws(() => readScriptEnv(path), { code: 'ENOENT' });
});
