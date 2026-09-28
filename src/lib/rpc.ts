import { supabase } from './supabase';

/**
 * 학생 앱 RPC 한 번 — 오류면 던지고, 아니면 응답을 그대로 T 로.
 * 오류를 던져야 하는 호출은 모두 이것으로 (편지 · 업적 · 매너 온도 · 채팅 전송 계층 · 프로필).
 * 오류를 일부러 삼키는 호출(접속 신호 · 읽음 · 찾기 멈춤처럼 다음 번에 다시 하면 되는 것)만 supabase.rpc 를 직접 부른다.
 */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
	const { data, error } = await supabase.rpc(fn, args);
	if (error) throw error;
	return data as T;
}
