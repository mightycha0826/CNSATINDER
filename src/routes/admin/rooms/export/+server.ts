import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/adminAuth';
import { adminRpc } from '$lib/server/supabaseAdmin';

/**
 * GET /admin/rooms/export?from=YYYY-MM-DD&to=YYYY-MM-DD&after=N   (관리자만)
 *
 * 대화 백업 (CSV) 한 조각. 날짜는 한국 시간 기준, to 는 그날까지 포함.
 * 한 번에 5,000줄 — 화면(/admin/rooms)이 last_id 를 이어 가며 다 받아서 한 파일로 만든다.
 * CSV 문자열은 DB 가 만든다 (여기서는 넘기기만 — Workers 의 요청당 CPU 한도 안에서 끝나게).
 * 첫 조각(after=0)을 받을 때 DB 가 활동 기록(export_messages)에 기간과 함께 남긴다.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ url, locals }) => {
	requireAdmin(locals);
	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
	const after = Number(url.searchParams.get('after') ?? 0);
	if (!DAY.test(from) || !DAY.test(to) || !Number.isSafeInteger(after) || after < 0) error(400, '날짜를 확인해 주세요');
	const start = new Date(`${from}T00:00:00+09:00`);
	const end = new Date(`${to}T00:00:00+09:00`);
	end.setUTCDate(end.getUTCDate() + 1); // 끝 날짜의 하루 전체
	if (!(end > start)) error(400, '시작 날짜가 끝 날짜보다 늦어요');

	const chunk = await adminRpc<{ csv: string; last_id: number | null; count: number }>('admin_export_messages', {
		p_staff: locals.staff!.id,
		p_from: start.toISOString(),
		p_to: end.toISOString(),
		p_after: after,
		p_limit: 5000
	});
	// 운영자 화면 응답은 어디에도 캐시되면 안 된다 (hooks 가 no-store 를 붙인다)
	return json(chunk);
};
