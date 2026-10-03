import { error } from '@sveltejs/kit';

/** 학생 API가 공유하는 요청 파싱. 호출자 신원은 Supabase가 검증한 토큰에서만 얻는다. */
export function bearerToken(request: Request): string {
	const raw = request.headers.get('authorization') ?? '';
	if (raw.length > 8192 || !/^Bearer\s+/i.test(raw)) return '';
	return raw.replace(/^Bearer\s+/i, '').trim();
}

/** 잘못된 JSON·null·배열·원시값은 필드가 없는 본문으로 취급한다. */
export async function jsonObject(request: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
	const size = request.headers.get('content-length');
	if (size && Number(size) > maxBytes) error(413, '요청이 너무 커요');
	const reader = request.body?.getReader();
	if (!reader) return {};
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) { await reader.cancel(); error(413, '요청이 너무 커요'); }
			chunks.push(value);
		}
	} finally { reader.releaseLock(); }
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
	let body: unknown;
	try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return {}; }
	return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

export function sameOriginJson(request: Request, url: URL) {
	if (request.headers.get('origin') !== url.origin) error(403, '다른 출처의 요청');
	if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) error(415, 'JSON 요청이 필요해요');
}

export const positiveId = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
