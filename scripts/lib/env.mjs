import { readFileSync } from 'node:fs';

/** 운영 스크립트들이 쓰던 .env 형식. 값에 든 '='와 빈 값도 그대로 보존한다. */
export function parseScriptEnv(source) {
	return Object.fromEntries(source.split(/\r?\n/)
		.filter((line) => /^[A-Z_]+=/.test(line))
		.map((line) => {
			const separator = line.indexOf('=');
			return [line.slice(0, separator), line.slice(separator + 1).trim()];
		}));
}

/** 작업 디렉터리와 무관하게 저장소 설정을 읽는다. 비밀 값은 로그로 남기지 않는다. */
export const readScriptEnv = (path = new URL('../../.env', import.meta.url)) =>
	parseScriptEnv(readFileSync(path, 'utf8'));
