import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 같은 주소의 아이콘·manifest·서비스워커만 바뀌어도 새 캐시를 만든다.
 * @param {string} directory
 * @param {string | Uint8Array} workerSource
 */
export function buildVersion(directory, workerSource) {
	const hash = createHash('sha256').update(workerSource);
	/** @param {string} path @param {string} [relative] */
	const visit = (path, relative = '') => {
		const entries = readdirSync(path, {withFileTypes:true}).sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
		for (const entry of entries) {
			const file = join(path, entry.name);
			const name = relative + entry.name;
			if (entry.isDirectory()) visit(file, name + '/');
			else if (entry.isFile()) hash.update(name).update('\0').update(readFileSync(file)).update('\0');
		}
	};
	visit(directory);
	return hash.digest('hex').slice(0,16);
}
