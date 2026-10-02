import type { SupabaseClient } from '@supabase/supabase-js';

type PhotoTask = { path: string; lease: string };

/** Storage API 성공 뒤에만 완료 처리한다. 실패/프로세스 종료 시 DB 임대 만료 후 다시 가져온다. */
export async function cleanupBadgePhotos(client: Pick<SupabaseClient, 'rpc' | 'storage'>): Promise<number> {
	const { data, error } = await client.rpc('admin_badge_photo_claim');
	if (error) throw new Error('사진 삭제 작업 조회 실패');
	const tasks = (data ?? []) as PhotoTask[];
	let deleted = 0;
	for (let start = 0; start < tasks.length; start += 20) {
		const batch = tasks.slice(start, start + 20);
		const paths = batch.map((t) => t.path);
		const result = await client.storage.from('badge-proofs').remove(paths);
		if (result.error) throw new Error('사진 삭제 실패 · 다음 예약 작업에서 재시도');
		const completed = await client.rpc('admin_badge_photo_complete', { p_paths: paths, p_lease: batch[0].lease });
		if (completed.error) throw new Error('사진 삭제 완료 기록 실패 · 다음 예약 작업에서 재확인');
		deleted += paths.length;
	}
	return deleted;
}
