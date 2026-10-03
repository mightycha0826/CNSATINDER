import app from '../.svelte-kit/cloudflare-tmp/app-worker.js';
import { createClient } from '@supabase/supabase-js';
import { cleanupBadgePhotos } from '../src/lib/server/badgePhotoCleanup.ts';
import { drainModeration } from '../src/lib/server/moderationRunner.ts';
import { moderationPrompt } from '../src/lib/server/moderation.ts';
import { sendDelivery } from '../src/lib/server/pushDelivery.ts';
import { callModels } from '../src/lib/server/aiFold.ts';

/** SvelteKit fetch와 개인정보 정리·콘텐츠 검토·푸시 재시도를 함께 제공한다. */
export default {
	...app,
	scheduled(_event, env, ctx) {
		ctx.waitUntil((async () => {
			if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('사진 정리용 Supabase 설정 누락');
			if (env.PUBLIC_SUPABASE_URL && new URL(env.PUBLIC_SUPABASE_URL).origin !== new URL(env.SUPABASE_URL).origin) {
				throw new Error('사진 정리용 Supabase 프로젝트 불일치');
			}
			const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
				auth: { persistSession: false, autoRefreshToken: false }
			});
			const rpc = async (name, args) => { const { data, error } = await client.rpc(name, args); if (error) throw new Error('scheduled_rpc_failed'); return data; };
			const vapid = env.PUBLIC_VAPID_KEY && env.VAPID_PRIVATE_KEY ? { publicKey: env.PUBLIC_VAPID_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || 'https://cnsatinder.mightycha0826.workers.dev' } : null;
			const jobs = [
				(async () => { if (!vapid) return; const pending = await rpc('push_retry_jobs', {}); for (const p of pending ?? []) await sendDelivery(p, rpc, vapid); })(),
				client.rpc('review_cleanup').then(({ error }) => { if (error) throw new Error('review_cleanup_failed'); }),
				(env.AI ? drainModeration(client, async (item) => {
					const result = await callModels(env.AI, moderationPrompt(item), [
						{ id: env.AI_MODEL || '@cf/google/gemma-4-26b-a4b-it', extra: { chat_template_kwargs: { enable_thinking: false } } },
						{ id: '@cf/zai-org/glm-4.7-flash' }
					], null, { max_tokens: 80, temperature: 0 });
					if (!result.ok) { console.error('[scheduled] moderation AI unavailable'); return null; }
					const out = result.out;
					return typeof out === 'string' ? out : out?.response || out?.choices?.[0]?.message?.content || null;
				}) : Promise.resolve({claimed: 0})).then((result) => { if (result.claimed) console.info('[scheduled] moderation', result); })
			];
			if (new Date(_event.scheduledTime ?? Date.now()).getUTCMinutes() % 15 === 0) jobs.push(cleanupBadgePhotos(client));
			const results = await Promise.allSettled(jobs);
			if (results.some((r) => r.status === 'rejected')) throw new Error('scheduled_job_failed');
		})());
	}
};
