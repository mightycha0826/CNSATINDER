import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildVersion } from './build-version.mjs';
import { contrast, readableColor } from '../src/lib/contrast.ts';
import { COLOR_LIGHT, COLOR_DARK, toDoc, fromDoc } from '../src/lib/letters/rich.ts';

test('편지 글자색은 양쪽 종이에서 일반 텍스트 대비 4.5 이상', () => {
	for (const color of Object.values(COLOR_LIGHT)) assert.ok(contrast(color, '#fffaf0') >= 4.5, color);
	for (const color of Object.values(COLOR_DARK)) assert.ok(contrast(color, '#1f1c17') >= 4.5, color);
});
test('모든 테마 색은 흰 글자·밝고 어두운 바탕에서 조정 가능', () => {
	const colors = readFileSync(new URL('../src/lib/themeColor.svelte.ts', import.meta.url), 'utf8').match(/#[0-9a-f]{6}/gi);
	for (const c of colors) {
		assert.ok(contrast(readableColor(c, '#ffffff'), '#ffffff') >= 4.7);
		assert.ok(contrast(readableColor(c, '#171416', true), '#171416') >= 4.7);
	}
});
test('복원된 편지 서식은 유니코드 범위를 보존하고 HTML을 실행하지 않음', () => {
	const body = '안녕😀\n<script>내용</script>';
	const fmt = { m: [[0, 3, 'b'], [4, 10, 'c:red']], a: [[1, 'center']] };
	assert.deepEqual(fromDoc(toDoc(body, fmt)), { body, fmt });
	assert.ok(JSON.stringify(toDoc('글', { m: [[0, 1, 'javascript:alert(1)']] })).includes('글'));
});

test('아이콘만 바뀌어도 배포 캐시 버전이 바뀌고 동일 내용은 유지', () => {
	const dir = mkdtempSync(join(tmpdir(),'landy-build-version-'));
	try {
		writeFileSync(join(dir,'icon.png'),'old fixture');
		const first=buildVersion(dir,'worker');
		assert.equal(buildVersion(dir,'worker'),first);
		writeFileSync(join(dir,'icon.png'),'new fixture');
		assert.notEqual(buildVersion(dir,'worker'),first);
	} finally {
		assert.equal(dirname(dir),tmpdir());
		rmSync(dir,{recursive:true,force:true});
	}
});
