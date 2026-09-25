import { supabase } from './supabase';
import { S } from './state.svelte';

/**
 * 검열봇 2단 — 글(채팅 메시지 · 편지 · 댓글)을 올린 뒤 "검토할 게 있으면 해 줘"라고 서버에 알린다.
 * 기다리지 않는다. 어떤 글을 볼지는 서버의 대기열이 정한다 (내 글만이 아니라 쌓인 순서대로, 한 번에 5개까지).
 *
 * 요청을 아낀다 (Workers 무료 한도 하루 10만):
 *  · 연달아 보내도 20초에 한 번만 — 그사이 쌓인 글은 다음 호출이나 다른 사람의 호출이 가져간다
 *  · 서버가 "가져갈 게 없다"(대기열이 비었거나 오늘 AI 한도 끝)고 하면 2분 동안 부르지 않는다
 *  · 운영 설정에서 AI 검토가 꺼져 있으면 아예 부르지 않는다
 */
const GAP_MS = 20_000;
const IDLE_MS = 120_000;
let timer: ReturnType<typeof setTimeout> | null = null;
let nextAt = 0;

export function requestModeration() {
	if (!S.settings?.ai_moderation || timer) return;
	timer = setTimeout(() => {
		timer = null;
		void call();
	}, Math.max(1500, nextAt - Date.now()));
}

async function call() {
	nextAt = Date.now() + GAP_MS;
	try {
		const { data } = await supabase.auth.getSession();
		const token = data.session?.access_token;
		if (!token) return;
		const res = await fetch('/api/moderate', {
			method: 'POST',
			keepalive: true,
			headers: { authorization: `Bearer ${token}` }
		});
		const body = (await res.json().catch(() => null)) as { claimed?: number } | null;
		if (body?.claimed === 0) nextAt = Date.now() + IDLE_MS;
	} catch {
		/* 다음 글을 올릴 때 다시 */
	}
}
