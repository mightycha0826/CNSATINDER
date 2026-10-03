import { json, type RequestHandler } from '@sveltejs/kit';
import { AiUnavailable, runAi } from '$lib/server/ai';
import { fakeVerdict, moderationPrompt, type ModItem } from '$lib/server/moderation';
import { moderateBatch } from '$lib/server/moderationBatch';
import { adminRpc, userFromBearer } from '$lib/server/supabaseAdmin';
import { rateLimit } from '$lib/server/apiRate';

/**
 * POST /api/moderate   Authorization: Bearer <access token>
 *
 * 검열봇 2단. 학생 앱이 글을 올린 직후 "검토할 게 있으면 해 줘"라고 부른다 (응답은 기다리지 않는다).
 * 어떤 글을 볼지는 DB 대기열이 정한다(mod_claim) — 부른 사람이 고를 수 없고, 누가 불러도 쌓인 순서대로.
 * 그래서 나쁜 글을 쓴 사람이 이 호출을 빼먹어도, 다른 누군가가 글을 올릴 때 같이 검토된다.
 * 하루 한도(ai_mod_daily_cap)는 DB 가 센다. AI 가 안 되면(무료 몫 소진 등) 글을 대기열에 돌려놓는다.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	const uid = await userFromBearer(request).catch(() => null);
	if (!uid) return json({ error: 'unauthorized' }, { status: 401 });
	const limited = await rateLimit(uid, 'moderate');
	if (limited) return limited;

	// 가져가는 것까지는 기다린다 — 몇 개를 가져갔는지(0 = 쌓인 게 없거나 오늘 한도 끝)를 앱이 보고 부르는 간격을 늘린다
	const items = await adminRpc<ModItem[]>('mod_claim', { p_n: 5 });
	if (!items.length) return json({ claimed: 0 });

	const work = moderateBatch(items, {
		review: async (item) => {
			try {
				return await runAi(platform?.env?.AI, moderationPrompt(item), { maxTokens: 80, temperature: 0, fake: fakeVerdict });
			} catch (e) {
				if (!(e instanceof AiUnavailable)) throw e;
				console.error('[moderate] Workers AI unavailable');
				return null;
			}
		},
		save: (id, verdict) => adminRpc('mod_verdict', { p_id: id, p_flag: verdict.flag, p_category: verdict.category, p_reason: verdict.reason }),
		release: (ids) => adminRpc('mod_release', { p_ids: ids })
	});

	// Workers: 응답을 먼저 돌려주고 검토는 뒤에서 마저 한다
	if (platform?.context?.waitUntil) {
		platform.context.waitUntil(work.catch(() => { console.error('[moderate] batch failed'); }));
		return json({ claimed: items.length });
	}
	return json({ claimed: items.length, ...(await work.catch(() => ({ checked: 0, flagged: 0 }))) });
};
