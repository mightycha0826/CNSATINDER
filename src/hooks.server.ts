import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { readSession } from '$lib/server/adminSession';
import { adminRpc } from '$lib/server/supabaseAdmin';

/**
 * /admin 가드 (dabang-kiosk hooks.server.ts 구조 + 강화된 인증).
 *
 * 매 요청마다: ① 서명 쿠키 검증 → ② private.staff 명단 재확인.
 * 명단에서 빠지면 쿠키가 살아 있어도 즉시 차단된다.
 * 학생 앱 경로는 전혀 건드리지 않는다.
 */
const OPEN = new Set(['/admin/login', '/admin/session']);

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.staff = null;
	const path = event.url.pathname;
	const isAdmin = path === '/admin' || path.startsWith('/admin/');

	if (isAdmin) {
		let setupError: string | null = null;
		try {
			const uid = await readSession(event.cookies);
			if (uid) {
				const role = await adminRpc<string | null>('admin_staff_role', { p_uid: uid });
				if (role === 'admin' || role === 'moderator') event.locals.staff = { id: uid, role };
			}
		} catch (e) {
			// 설정 누락(서버 키·세션 비밀)은 로그인 화면에서 안내한다
			setupError = e instanceof Error ? e.message : String(e);
		}

		if (!event.locals.staff && !OPEN.has(path)) {
			const q = setupError ? `?setup=${encodeURIComponent(setupError)}` : '';
			redirect(303, `/admin/login${q}`);
		}
	}

	// 운영자 화면은 서버에서 그릴 때부터 넓은 레이아웃(body.admin) — 스크립트가 늦게 떠도 모양이 깨지지 않게
	const res = await resolve(
		event,
		isAdmin ? { transformPageChunk: ({ html }) => html.replace('<body ', '<body class="admin" ') } : undefined
	);
	if (isAdmin) {
		// 운영자 화면은 신원 정보를 다루므로 어디에도 캐시되거나 검색되면 안 된다
		try {
			res.headers.set('Cache-Control', 'no-store');
			res.headers.set('X-Robots-Tag', 'noindex, nofollow');
			res.headers.set('Referrer-Policy', 'no-referrer');
			res.headers.set('X-Frame-Options', 'DENY');
		} catch {
			/* 불변 헤더인 응답(리다이렉트 등)은 건너뛴다 */
		}
	}
	return res;
};

/**
 * 예상 못 한 서버 오류 — 원인은 서버 로그(Cloudflare Workers 로그)에 남기고, 화면에는 짧은 번호만.
 * 운영자가 번호를 알려 주면 로그에서 같은 번호로 찾을 수 있다.
 */
export const handleError: HandleServerError = ({ error, event, status }) => {
	const id = crypto.randomUUID().slice(0, 8);
	if (status !== 404) console.error(`[${id}] ${event.request.method} ${event.url.pathname}`, error);
	return { message: status === 404 ? '찾을 수 없는 주소' : `서버 오류 (${id})` };
};
