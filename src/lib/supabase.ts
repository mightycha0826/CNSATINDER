import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

// 구형(anon key, eyJ...)·신형(publishable key, sb_publishable_...) 키 이름 모두 지원
const url = env.PUBLIC_SUPABASE_URL ?? '';
const key = env.PUBLIC_SUPABASE_ANON_KEY ?? env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const hasSupabase = url.startsWith('http') && key.length > 20;

// ★ 싱글톤. 웹소켓 연결 수가 곧 Supabase Realtime 요금제 한도이므로
//   클라이언트를 두 번 만들지 않는다 (계획 H-1단계).
export const supabase: SupabaseClient = hasSupabase
	? createClient(url, key, {
			auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
			realtime: { params: { eventsPerSecond: 10 } }
		})
	: (null as unknown as SupabaseClient);
