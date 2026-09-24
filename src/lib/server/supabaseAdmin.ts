import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';

/**
 * service_role 클라이언트 — 서버 전용($lib/server). 클라이언트 번들에 들어갈 경로가 없다.
 * (dabang-kiosk supabaseAdmin 패턴)
 *
 * private 스키마는 PostgREST 에 노출되지 않으므로 이 클라이언트로도 직접 읽지 못한다.
 * 운영 기능은 전부 service_role 전용 public.admin_* RPC 를 거친다.
 */
let client: SupabaseClient | null = null;

const ref = (u?: string) => (u ?? '').match(/\/\/([^.]+)/)?.[1];

export function supabaseAdmin(): SupabaseClient {
	if (client) return client;
	const url = env.SUPABASE_URL;
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.');
	// 앱과 다른 프로젝트의 키를 넣는 실수를 여기서 막는다
	if (pub.PUBLIC_SUPABASE_URL && ref(url) !== ref(pub.PUBLIC_SUPABASE_URL)) {
		throw new Error(
			`서버 키가 앱과 다른 Supabase 프로젝트를 가리킵니다 (앱=${ref(pub.PUBLIC_SUPABASE_URL)}, 서버=${ref(url)}).`
		);
	}
	client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
	return client;
}

export async function adminRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
	const { data, error } = await supabaseAdmin().rpc(fn, args);
	if (error) throw new Error(`${fn}: ${error.message}`);
	return data as T;
}

/** 신원(이메일) 조회 — 반드시 audit 기록과 함께 호출할 것 */
export async function emailOf(userId: string): Promise<string | null> {
	const { data } = await supabaseAdmin().auth.admin.getUserById(userId);
	return data.user?.email ?? null;
}

/** 학교 이메일 앞자리(학번)로 명렬표(private.student_roster)에서 이름 찾기 — emailOf 로 이미 열람한 뒤에만 의미가 있다 */
export async function rosterNameOf(email: string | null, staffId: string): Promise<string | null> {
	if (!email) return null;
	return adminRpc<string | null>('admin_roster_name', { p_staff: staffId, p_email: email });
}

/** 요청한 학생 — Authorization: Bearer <access token> 에서. 클라가 주장하는 id 는 믿지 않는다. */
export async function userFromBearer(request: Request): Promise<string | null> {
	const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	if (!token) return null;
	const { data } = await supabaseAdmin().auth.getUser(token);
	return data.user?.id ?? null;
}
