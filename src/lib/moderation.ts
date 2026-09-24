import { supabase } from './supabase';
import { S } from './state.svelte';

/**
 * 검열봇 2단 — 글(채팅 메시지 · 편지 · 댓글)을 올린 직후 "검토할 게 있으면 해 줘"라고 서버에 알린다.
 * 기다리지 않는다. 어떤 글을 볼지는 서버의 대기열이 정한다 (내 글만이 아니라 쌓인 순서대로).
 * 연달아 보내면 한 번으로 묶는다. 운영 설정에서 AI 검토가 꺼져 있으면 부르지 않는다.
 */
let timer: ReturnType<typeof setTimeout> | null = null;

export function requestModeration() {
	if (!S.settings?.ai_moderation || timer) return;
	timer = setTimeout(() => {
		timer = null;
		void (async () => {
			const { data } = await supabase.auth.getSession();
			const token = data.session?.access_token;
			if (!token) return;
			await fetch('/api/moderate', {
				method: 'POST',
				keepalive: true,
				headers: { authorization: `Bearer ${token}` }
			});
		})().catch(() => {});
	}, 1500);
}
