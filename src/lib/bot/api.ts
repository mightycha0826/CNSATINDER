import { supabase } from '../supabase';

/**
 * 대화 봇 — 서버 호출. 화면(BotChat)은 이 모양만 안다 (개발 미리보기는 가짜를 끼운다).
 * 시작 · 한도는 DB(ai_chat_start), 한 턴은 서버(/api/ai-chat → Workers AI).
 * (DB · 운영 설정 이름은 Phase 19 의 "AI 대화" 그대로 — ai_chat*)
 */
export type Line = { role: 'user' | 'assistant'; content: string };
export type BotStart = { status: 'ok'; id: string; expires_at: string; turns: number; max_turns: number; left_today: number; server_now: string };
type StartResult = BotStart | { status: 'off' | 'full' | 'restricted' } | { status: 'limit'; per_user: number };
export type TurnResult =
	| { status: 'ok'; reply: string; turns: number; max_turns: number }
	| { status: 'blocked'; code: string }
	| { status: 'expired' | 'turns' | 'off' | 'not_found' | 'bad_text' | 'ai_unavailable' | 'network' | 'pending' | 'restricted' };

export type BotApi = {
	start(): Promise<StartResult>;
	turn(chatId: string, lines: Line[], requestId?: string): Promise<TurnResult>;
};

/** 서버에 보내는 기록 — 최근 20개 (서버도 같은 수로 다시 자른다, server/aiChat.ts) */
const HISTORY = 20;

export const botApi: BotApi = {
	async start() {
		const { data, error } = await supabase.rpc('ai_chat_start');
		if (error) return { status: 'off' };
		return data as StartResult;
	},
	async turn(chatId, lines, requestId = crypto.randomUUID()) {
		try {
			const { data } = await supabase.auth.getSession();
			const token = data.session?.access_token;
			if (!token) return { status: 'not_found' };
			const res = await fetch('/api/ai-chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
				body: JSON.stringify({ chat_id: chatId, request_id: requestId, messages: lines.slice(-HISTORY) })
			});
			const body = (await res.json().catch(() => null)) as TurnResult | null;
			// 요청 모양·인증 오류는 같은 기록을 다시 보내도 해결되지 않는다.
			if (res.status === 400) return { status: 'bad_text' };
			if (res.status === 401 || res.status === 403) return { status: 'not_found' };
			return body?.status ? body : { status: 'network' };
		} catch {
			return { status: 'network' };
		}
	}
};
