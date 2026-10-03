import { error, json } from '@sveltejs/kit';
import { clearSession, issueSession, readSessionDetails } from '$lib/server/adminSession';
import { adminRpc, supabaseAdmin } from '$lib/server/supabaseAdmin';
import { jsonObject, sameOriginJson } from '$lib/server/request';
import type { RequestHandler } from './$types';

/**
 * 운영자 로그인 확정.
 * 클라이언트가 Supabase 로 로그인한 뒤 access token 을 보내면,
 * 서버가 그 토큰을 Supabase 에 직접 검증하고(클라이언트 주장을 믿지 않는다) 운영진 명단을 확인한 뒤
 * 서명 쿠키를 발급한다.
 *
 * Origin과 JSON 형식을 확인해 다른 사이트의 세션 변경을 거부한다.
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	sameOriginJson(request, url);
	const token = (await jsonObject(request, 16 * 1024)).token;
	if (!token || typeof token !== 'string' || token.length > 8192) error(400, '토큰이 없습니다');

	const { data, error: e } = await supabaseAdmin().auth.getUser(token);
	if (e || !data.user) error(401, '로그인을 확인할 수 없습니다');

	const role = await adminRpc<string | null>('admin_staff_role', { p_uid: data.user.id });
	if (!role) error(403, '운영진으로 등록되지 않은 계정입니다');

	const { data: claims, error: claimsError } = await supabaseAdmin().auth.getClaims(token);
	const authSession = claims?.claims?.session_id;
	if (claimsError || typeof authSession !== 'string' || !/^[0-9a-f-]{36}$/i.test(authSession)) error(401, '로그인 세션을 확인해 주세요');
	const sessionId = await adminRpc<string>('admin_session_issue', { p_user: data.user.id, p_auth_session: authSession });
	await issueSession(cookies, data.user.id, url.protocol === 'https:', sessionId);
	return json({ ok: true, role });
};

export const DELETE: RequestHandler = async ({ cookies, request, url }) => {
	if (request.headers.get('origin') !== url.origin) error(403, '다른 출처의 요청');
	const session = await readSessionDetails(cookies);
	if (session) await adminRpc('admin_session_revoke', { p_user: session.userId, p_session: session.sessionId });
	clearSession(cookies);
	return json({ ok: true });
};
