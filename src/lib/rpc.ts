import { supabase } from './supabase';

/**
 * 학생 앱 RPC 한 번 — 오류면 던지고, 아니면 응답을 그대로 T 로.
 * (편지 · 업적 · 매너 온도 모듈이 같이 쓴다. 채팅방은 전송 계층(chat/supabase-transport)이 따로 맡는다)
 */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
	const { data, error } = await supabase.rpc(fn, args);
	if (error) throw error;
	return data as T;
}
