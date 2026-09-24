import { supabase } from '../supabase';

/**
 * AI 대화 상대 — 서버 호출. 화면(AiChat)은 이 모양만 안다 (개발 미리보기는 가짜를 끼운다).
 * 시작 · 한도는 DB(ai_chat_start), 한 턴은 서버(/api/ai-chat → Workers AI).
 */
export type Line = { role: 'user' | 'assistant'; content: string };
export type StartResult =
	| { status: 'ok'; id: string; expires_at: string; turns: number; max_turns: number; left_today: number; server_now: string }
	| { status: 'off' | 'full' | 'restricted' }
	| { status: 'limit'; per_user: number };
export type TurnResult =
	| { status: 'ok'; reply: string; turns: number; max_turns: number }
	| { status: 'blocked'; code: string }
	| { status: 'expired' | 'turns' | 'off' | 'not_found' | 'bad_text' | 'ai_unavailable' | 'network' };

export type AiApi = {
	start(): Promise<StartResult>;
	turn(chatId: string, lines: Line[]): Promise<TurnResult>;
};

/** 첫 인사는 화면에서 바로 — AI 호출 한 번을 아낀다 */
export const GREETING = '안녕하세요! 저는 CNSATINDER 의 AI 예요. 사람 상대를 찾는 동안 같이 얘기해요 🙂 요즘 뭐 하면서 지내요?';

export const aiApi: AiApi = {
	async start() {
		const { data, error } = await supabase.rpc('ai_chat_start');
		if (error) return { status: 'off' };
		return data as StartResult;
	},
	async turn(chatId, lines) {
		try {
			const { data } = await supabase.auth.getSession();
			const token = data.session?.access_token;
			if (!token) return { status: 'network' };
			const res = await fetch('/api/ai-chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
				body: JSON.stringify({ chat_id: chatId, messages: lines.slice(-12) })
			});
			const body = (await res.json().catch(() => null)) as TurnResult | null;
			return body?.status ? body : { status: 'network' };
		} catch {
			return { status: 'network' };
		}
	}
};
