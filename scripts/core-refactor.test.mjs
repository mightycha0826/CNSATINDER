import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const load = async (name) => {
	const source = stripTypeScriptTypes(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'));
	return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
};
const { readWithFallback } = await load('schemaCompatibility');
const { errMsg } = await load('errors');

test('새 스키마는 모든 열을 한 번만 조회한다', async () => {
	const calls = [];
	const expected = { data: { id: 1 }, error: null };
	const actual = await readWithFallback(async (columns) => { calls.push(columns); return expected; }, 'id', ['old', 'new']);
	assert.equal(actual, expected);
	assert.deepEqual(calls, ['id, old, new']);
});

test('구형 스키마는 도입 순서의 역순으로 열 묶음을 빼고 성공하면 멈춘다', async () => {
	const calls = [];
	const actual = await readWithFallback(async (columns) => {
		calls.push(columns);
		return columns.includes('new') ? { data: null, error: new Error('column missing') } : { data: 7, error: null };
	}, 'id', ['old', 'new_a, new_b']);
	assert.equal(actual.data, 7);
	assert.deepEqual(calls, ['id, old, new_a, new_b', 'id, old']);
});

test('모든 조회가 실패해도 기본 열까지 한 번씩만 시도하고 마지막 오류를 보존한다', async () => {
	const calls = [];
	const error = new Error('unavailable');
	const actual = await readWithFallback(async (columns) => { calls.push(columns); return { data: null, error }; }, 'id', ['old', 'new']);
	assert.equal(actual.error, error);
	assert.deepEqual(calls, ['id, old, new', 'id, old', 'id']);
});

test('전송 예외는 추가 요청 없이 호출자에게 전달한다', async () => {
	let calls = 0;
	const error = new Error('network');
	await assert.rejects(readWithFallback(async () => { calls++; throw error; }, 'id', ['old']), error);
	assert.equal(calls, 1);
});

test('선택 열이 없는 조회도 한 번만 실행한다', async () => {
	let calls = 0;
	await readWithFallback(async (columns) => { calls++; assert.equal(columns, 'id'); return { data: null, error: 'missing' }; }, 'id', []);
	assert.equal(calls, 1);
});

test('구체적인 오류는 일반적인 부분 문자열보다 우선한다', () => {
	assert.equal(errMsg(new Error('Request rate limit reached')), '지금 들어오는 사람이 많아요. 몇 초 뒤에 다시 눌러 주세요');
	assert.equal(errMsg({ message: 'Email rate limit exceeded' }), '메일 요청이 너무 잦아요. 1분 뒤에 다시 받아 주세요');
	assert.equal(errMsg('bio_too_long'), '소개는 60자까지 쓸 수 있어요');
	assert.equal(errMsg('interest_too_long'), '관심사 하나는 12자까지 담을 수 있어요');
	assert.equal(errMsg('invalid_mbti'), 'MBTI 를 다시 확인해 주세요');
	assert.equal(errMsg('Invalid login credentials'), '이메일 또는 비밀번호가 맞지 않아요');
});

test('알 수 없는 오류는 원문을, 빈 오류는 기본 안내를 사용한다', () => {
	assert.equal(errMsg(new Error('custom failure')), 'custom failure');
	assert.equal(errMsg(null), '알 수 없는 오류');
	assert.equal(errMsg(undefined), '알 수 없는 오류');
	assert.equal(errMsg(''), '알 수 없는 오류');
});
