import app from '../.svelte-kit/cloudflare-tmp/app-worker.js';
import { createClient } from '@supabase/supabase-js';
import { cleanupBadgePhotos } from '../src/lib/server/badgePhotoCleanup.ts';

/** SvelteKit fetch 처리에 개인정보 사진 정리 예약 작업을 추가한다. */
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
			await cleanupBadgePhotos(client);
		})());
	}
};