/** 학생 API가 공유하는 요청 파싱. 호출자 신원은 Supabase가 검증한 토큰에서만 얻는다. */
export function bearerToken(request: Request): string {
	return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
}

/** 잘못된 JSON·null·배열·원시값은 필드가 없는 본문으로 취급한다. */
export async function jsonObject(request: Request): Promise<Record<string, unknown>> {
	const body: unknown = await request.json().catch(() => null);
	return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

export const positiveId = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
