import { json } from '@sveltejs/kit';
import { adminRpc } from './supabaseAdmin';

/** DB가 사용자별 창을 직렬화한다. 학교 공용 IP로 학생 전체를 제한하지 않는다. */
export async function rateLimit(user: string, endpoint: 'ai-chat' | 'moderate' | 'push'): Promise<Response | null> {
	const result = await adminRpc<{ allowed: boolean; retry_after: number }>('api_rate_take', { p_user: user, p_endpoint: endpoint });
	return result.allowed ? null : json({ status: 'rate_limited', retry_after: result.retry_after }, {
		status: 429, headers: { 'Retry-After': String(result.retry_after), 'Cache-Control': 'no-store' }
	});
}
