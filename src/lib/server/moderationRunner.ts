import type { SupabaseClient } from '@supabase/supabase-js';
import { moderateBatch } from './moderationBatch.ts';
import type { ModItem } from './moderation.ts';

/** HTTP 힌트와 예약 소비자가 같은 DB claim/예산/재시도 규칙을 사용한다. */
export async function drainModeration(client: Pick<SupabaseClient, 'rpc'>, review: (item: ModItem) => Promise<string | null>) {
	const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
		const { data, error } = await client.rpc(fn, args);
		if (error) throw new Error(`${fn}_failed`);
		return data as T;
	};
	const items = await rpc<ModItem[]>('mod_claim', { p_n: 5 });
	if (!items.length) return { claimed: 0, checked: 0, flagged: 0 };
	const result = await moderateBatch(items, {
		review,
		save: (id, verdict) => rpc('mod_verdict', { p_id: id, p_flag: verdict.flag, p_category: verdict.category, p_reason: verdict.reason }),
		release: (ids) => rpc('mod_release', { p_ids: ids })
	});
	return { claimed: items.length, ...result };
}
