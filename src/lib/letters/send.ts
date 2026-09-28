import { goto } from '$app/navigation';
import { errMsg, toast } from '../state.svelte';
import { sendError, type SendResult } from './api';
import { LIST } from './unread.svelte';

/**
 * 편지 보내기 — 새 편지 · 답장이 같이 쓴다 (EnvelopeCompose 의 onsend · ondone).
 * 서버가 받지 않으면(한도 · 서명 · 끝난 편지 …) 이유를 알리고 false — 연출이 멈추고 쓰던 편지지로 돌아간다.
 */
export async function deliver(send: () => Promise<SendResult>): Promise<boolean> {
	try {
		const err = sendError(await send());
		if (err) toast(err);
		return !err;
	} catch (e) {
		toast(errMsg(e));
		return false;
	}
}

/** 봉투가 날아간 뒤 — 편지함으로 (보관함을 열면 보낸 편지 칸) */
export function afterSent(message: string) {
	LIST.tab = 'sent';
	toast(message);
	void goto('/letters', { replaceState: true });
}
