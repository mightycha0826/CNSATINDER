<script lang="ts">
	/**
	 * 개발 전용 — AI 대화 상대 화면 미리보기. 가짜 서버로 상태를 재현한다 (계정 · Workers AI 불필요).
	 *
	 *   /dev/ai?s=ok | limit | full | off | restricted   (&turns=2 턴 한도, &short 20초 뒤 시간 끝, &down AI 오류)
	 *
	 * 배포 빌드에서는 아무것도 그리지 않고 홈으로 보낸다.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AiChat from '$lib/ai/AiChat.svelte';
	import type { AiApi, StartResult } from '$lib/ai/api';

	const q = page.url.searchParams;
	const scenario = q.get('s') ?? 'ok';
	const maxTurns = Number(q.get('turns') ?? 30);
	let used = 0;
	let closed = $state(false);

	const api: AiApi = {
		async start() {
			const now = Date.now();
			if (scenario === 'limit') return { status: 'limit', per_user: 3 };
			if (scenario !== 'ok') return { status: scenario } as StartResult;
			return {
				status: 'ok',
				id: '00000000-0000-4000-8000-000000000000',
				expires_at: new Date(now + (q.has('short') ? 20_000 : 600_000)).toISOString(),
				turns: 0,
				max_turns: maxTurns,
				left_today: 2,
				server_now: new Date(now).toISOString()
			};
		},
		async turn(_id, lines) {
			await new Promise((r) => setTimeout(r, 400));
			const last = lines.at(-1)?.content ?? '';
			if (/01[016789]\d{7,8}/.test(last.replace(/[\s.-]/g, ''))) return { status: 'blocked', code: 'personal_info' };
			if (q.has('down')) return { status: 'ai_unavailable' };
			used++;
			return { status: 'ok', reply: `AI 답: ${last}`, turns: used, max_turns: maxTurns };
		}
	};

	$effect(() => {
		if (!import.meta.env.DEV) void goto('/', { replaceState: true });
	});
</script>

{#if import.meta.env.DEV}
	{#if closed}
		<p class="closed">닫힘</p>
	{:else}
		<AiChat {api} seeking="0:42" onclose={() => (closed = true)} />
	{/if}
{/if}
