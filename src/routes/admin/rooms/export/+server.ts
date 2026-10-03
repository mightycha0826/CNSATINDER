import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/adminAuth';
import { adminRpc } from '$lib/server/supabaseAdmin';
import { exportDay } from '$lib/server/adminExport';

/** 첫 요청의 ID 상한·기간·신원을 고정하고 같은 작업의 조각만 읽는다. */
export const GET: RequestHandler = async ({ url, locals }) => {
	requireAdmin(locals);
	const after = Number(url.searchParams.get('after') ?? 0);
	if (!Number.isSafeInteger(after) || after < 0) error(400, '날짜를 확인해 주세요');
	let job = url.searchParams.get('job');
	if (job && !/^[0-9a-f-]{36}$/i.test(job)) error(400, '추출 작업을 확인해 주세요');
	if (!job) {
		if (after !== 0) error(400, '처음부터 내려받아 주세요');
		const start = exportDay(url.searchParams.get('from') ?? '');
		const last = exportDay(url.searchParams.get('to') ?? '');
		if (!start || !last) error(400, '날짜를 확인해 주세요');
		const end = new Date(+last + 86_400_000);
		if (+end <= +start || +end - +start > 31 * 86_400_000) error(400, '한 번에 최대 31일을 내려받을 수 있어요');
		const created = await adminRpc<{ id: string }>('admin_export_start', { p_staff: locals.staff!.id, p_from: start.toISOString(), p_to: end.toISOString() });
		job = created.id;
	}
	return json(await adminRpc('admin_export_chunk', { p_staff: locals.staff!.id, p_job: job, p_after: after }));
};
