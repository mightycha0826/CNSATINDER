import { error, json } from '@sveltejs/kit';
import { clearSession, issueSession } from '$lib/server/adminSession';
import { adminRpc, supabaseAdmin } from '$lib/server/supabaseAdmin';
import type { RequestHandler } from './$types';

/**
 * 운영자 로그인 확정.
 * 클라이언트가 Supabase 로 로그인한 뒤 access token 을 보내면,
 * 서버가 그 토큰을 Supabase 에 직접 검증하고(클라이언트 주장을 믿지 않는다) 운영진 명단을 확인한 뒤
 * 서명 쿠키를 발급한다.
 *
 * JSON POST 는 CORS preflight 가 필요하므로 다른 사이트에서 대신 보낼 수 없다.
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const body = (await request.json().catch(() => null)) as { token?: string } | null;
	const token = body?.token;
	if (!token || typeof token !== 'string') error(400, '토큰이 없습니다');

	const { data, error: e } = await supabaseAdmin().auth.getUser(token);
	if (e || !data.user) error(401, '로그인을 확인할 수 없습니다');

	const role = await adminRpc<string | null>('admin_staff_role', { p_uid: data.user.id });
	if (!role) error(403, '운영진으로 등록되지 않은 계정입니다');

	await issueSession(cookies, data.user.id, url.protocol === 'https:');
	return json({ ok: true, role });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
	clearSession(cookies);
	return json({ ok: true });
};
