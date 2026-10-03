import type { BotApi, Line, TurnResult } from './api';

export type ChatLine = { id: number; who: 'me' | 'bot' | 'sys'; text: string };

/**
 * 전송하는 기록과 답할 메시지 ID를 한 번에 확정한다.
 * 이전 요청을 기다리는 동안 보낸 말은 화면상 앞서 있어도 이전 봇 답 뒤의 새 사용자 턴으로 보낸다.
 */
export function snapshotTurn(lines: ChatLine[], answeredUpTo: number) {
	const batch = lines.filter((l) => l.who === 'me' && l.id > answeredUpTo);
	const previous = lines.filter((l) => l.who === 'bot' || (l.who === 'me' && l.id <= answeredUpTo));
	const history: Line[] = [...previous, ...batch].map((l) => ({ role: l.who === 'me' ? 'user' : 'assistant', content: l.text }));
	return { batch, upTo: batch.at(-1)?.id ?? answeredUpTo, history };
}

/** 같은 기록을 한 번만 재시도한다. 창을 닫거나 시간이 끝나면 다음 요청을 보내지 않는다. */
export async function requestTurn(
	api: BotApi,
	chatId: string,
	history: Line[],
	options: {
		requestId?: string;
		isActive(): boolean;
		wait(): Promise<void>;
		onRetry(waiting: boolean): void;
	}
): Promise<TurnResult | null> {
	const requestId = options.requestId ?? crypto.randomUUID();
	const request = () => api.turn(chatId, history, requestId).catch((): TurnResult => ({ status: 'network' }));
	let result = await request();
	if (!options.isActive()) return null;
	if (result.status === 'network' || result.status === 'ai_unavailable' || result.status === 'pending') {
		options.onRetry(true);
		await options.wait();
		if (!options.isActive()) return null;
		options.onRetry(false);
		result = await request();
	}
	return options.isActive() ? result : null;
}
