<script lang="ts">
	/**
	 * 개발 전용 — 익명편지 화면 미리보기. Supabase 없이 가짜 서버 응답으로 그린다.
	 *
	 *   /dev/letters?v=feed | detail | task | new
	 *
	 * 배포 빌드에서는 아무것도 그리지 않고 홈으로 보낸다.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppLayout from '../../(app)/+layout.svelte';
	import Feed from '../../(app)/letters/+page.svelte';
	import Detail from '../../(app)/letters/[id]/+page.svelte';
	import Compose from '../../(app)/letters/new/+page.svelte';

	const v = page.url.searchParams.get('v') ?? 'feed';
	const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

	const FEED = [
		{ id: 9, body: '요즘 진로 때문에 고민이 많아요. 다들 하고 싶은 거 확실하게 정했나요?\n저는 아직도 모르겠어서 불안해요.', author_alias: '느린 등대', is_mine: false, reply_status: 'replied', comment_count: 4 },
		{ id: 8, body: '오늘 급식 진짜 맛있었다', author_alias: '포근한 우표', is_mine: true, reply_status: 'assigned', comment_count: 1 },
		{ id: 7, body: '시험 끝나면 뭐 할지 적어 보는 편지. 나는 일단 잠부터 잘 거고, 그 다음엔 밀린 드라마를 볼 거야. 친구들이랑 노래방도 가고 싶고 떡볶이도 먹고 싶어. 생각만 해도 행복하다. 다들 조금만 더 버티자! 우리 모두 고생 많았어. 끝나면 진짜 하고 싶은 거 다 하자. 이번 학기 정말 길었는데 이제 거의 다 왔어. 힘내자 다들.', author_alias: '반짝이는 엽서', is_mine: false, reply_status: 'unassigned', comment_count: 0, assigned_to_me: true },
		{ id: 6, body: '도서관 3층 창가 자리 좋아하는 사람?', author_alias: '조용한 책갈피', is_mine: false, reply_status: 'unassigned', comment_count: 2 }
	].map((l, i) => ({ truncated: l.body.length > 120, assigned_to_me: false, created_at: ago(3 + i * 70), fmt: null as unknown, ...l, body: l.body.slice(0, 120) }));
	// 서식 예시 — "진로" 굵게+노랑 형광펜, "때문에" 밑줄, 둘째 줄 가운데 정렬·파란 글씨
	FEED[0].fmt = { m: [[3, 5, 'b'], [3, 5, 'h:yellow'], [6, 9, 'u'], [41, 58, 'c:blue']], a: [[1, 'center']] };

	const task = v === 'task';
	const DETAIL = {
		letter: {
			id: 9,
			body: FEED[0].body,
			fmt: FEED[0].fmt,
			author_alias: '느린 등대',
			is_mine: false,
			reply_status: task ? 'assigned' : 'replied',
			assigned_to_me: task,
			task_expires_at: task ? new Date(Date.now() + 40 * 3_600_000).toISOString() : null,
			created_at: ago(95)
		},
		comments: task
			? [{ id: 1, parent_id: null, author_alias: '둥근 풍선', is_op: false, is_mine: false, is_designated: false, hidden: null, body: '저도 아직 몰라요! 같이 찾아봐요', created_at: ago(40) }]
			: [
					{ id: 1, parent_id: null, author_alias: '맑은 연필', is_op: false, is_mine: false, is_designated: true, hidden: null, body: '저도 고2 때까지 몰랐어요. 좋아하는 과목부터 적어 보는 게 도움이 됐어요.', created_at: ago(80) },
					{ id: 2, parent_id: 1, author_alias: '느린 등대', is_op: true, is_mine: false, is_designated: false, hidden: null, body: '오 해 볼게요 고마워요', created_at: ago(60) },
					{ id: 3, parent_id: null, author_alias: null, is_op: false, is_mine: false, is_designated: false, hidden: 'removed', body: null, created_at: ago(50) },
					{ id: 4, parent_id: 3, author_alias: '둥근 풍선', is_op: false, is_mine: true, is_designated: false, hidden: null, body: '저도 같은 생각이에요', created_at: ago(30) },
					{ id: 5, parent_id: null, author_alias: '가벼운 구름', is_op: false, is_mine: false, is_designated: false, hidden: null, body: '천천히 해도 괜찮아요 ☺', created_at: ago(5) }
				],
		my_alias: task ? null : '둥근 풍선',
		server_now: new Date().toISOString()
	};

	if (import.meta.env.DEV && typeof window !== 'undefined') {
		(window as unknown as { __LETTERS_FAKE__: unknown }).__LETTERS_FAKE__ = async (fn: string, args?: Record<string, unknown>) => {
			if (fn === 'letter_feed') return { letters: FEED, server_now: new Date().toISOString() };
			if (fn === 'letter_detail') return DETAIL;
			if (fn === 'request_letter_reply_task') return { status: 'waiting', reason: 'empty', poll_ms: 60_000 };
			if (fn === 'post_letter') {
				(window as unknown as { __LAST_POST__: unknown }).__LAST_POST__ = args;
				return { status: 'ok', letter_id: 9, alias: '느린 등대' };
			}
			if (fn === 'post_comment') return { status: 'ok', comment_id: 99, my_alias: '둥근 풍선', designated: false };
			return { status: 'ok' };
		};
	}

	$effect(() => {
		if (!import.meta.env.DEV) void goto('/', { replaceState: true });
	});
</script>

{#if import.meta.env.DEV}
	{#if v === 'feed'}
		<AppLayout><Feed /></AppLayout>
	{:else if v === 'new'}
		<Compose />
	{:else}
		<Detail />
	{/if}
{/if}
