import { json, type RequestHandler } from '@sveltejs/kit';
import { AiUnavailable, runAi } from '$lib/server/ai';
import { fakeVerdict, moderationPrompt, parseVerdict, type ModItem } from '$lib/server/moderation';
import { adminRpc, userFromBearer } from '$lib/server/supabaseAdmin';

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

	const work = (async () => {
		const items = await adminRpc<ModItem[]>('mod_claim', { p_n: 3 });
		let checked = 0;
		let flagged = 0;
		for (let i = 0; i < items.length; i++) {
			const it = items[i];
			let raw: string;
			try {
				raw = await runAi(platform?.env?.AI, moderationPrompt(it), { maxTokens: 80, temperature: 0, fake: fakeVerdict });
			} catch (e) {
				if (!(e instanceof AiUnavailable)) throw e;
				// 남은 것은 돌려놓는다 (시도 횟수를 쓰지 않고) — 다음 호출이나 내일
				await adminRpc('mod_release', { p_ids: items.slice(i).map((x) => x.id) });
				break;
			}
			const v = parseVerdict(raw);
			// 알아볼 수 없는 답 — 그대로 두면 2분 뒤 다시 시도되고, 세 번 실패하면 DB 가 '오류'로 접는다
			if (!v) continue;
			await adminRpc('mod_verdict', { p_id: it.id, p_flag: v.flag, p_category: v.category, p_reason: v.reason });
			checked++;
			if (v.flag) flagged++;
		}
		return { checked, flagged };
	})();

	// Workers: 응답을 먼저 돌려주고 검토는 뒤에서 마저 한다
	if (platform?.context?.waitUntil) {
		platform.context.waitUntil(work.catch(() => {}));
		return json({ queued: true });
	}
	return json(await work.catch(() => ({ checked: 0, flagged: 0 })));
};
