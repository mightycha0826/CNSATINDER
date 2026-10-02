import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const load = async (name) => {
	const source = stripTypeScriptTypes(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'));
	return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
};
const { errMsg } = await load('errors');

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
