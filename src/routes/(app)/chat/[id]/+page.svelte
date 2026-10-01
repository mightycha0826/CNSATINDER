<script lang="ts">
	import { goBack } from '$lib/nav';
	import { page } from '$app/state';
	import { ChatRoom } from '$lib/chat/room.svelte';
	import ChatView from '$lib/chat/ChatView.svelte';
	import { toast } from '$lib/state.svelte';

	/** 대화방 하나. 여러 대화가 동시에 열려 있을 수 있어 주소에 방 id 를 싣는다. */
	let room = $state<ChatRoom | null>(null);
	let loading = $state(true);
	/** 네트워크 오류로 열지 못함 — 쫓아내지 않고 그 자리에서 다시 시도 (Phase 39) */
	let failed = $state(false);
	let attempt = $state(0);

	/** 정말 없는 방(내 방이 아님 · 잘못된 주소)인가 — 그 밖의 오류(네트워크 등)는 다시 시도할 수 있다 */
	const notFound = (e: unknown) => {
		const err = e as { message?: string; code?: string } | null;
		return err?.message === 'not_member' || err?.code === '22P02';
	};

	$effect(() => {
		const id = page.params.id ?? '';
		void attempt;
		let r: ChatRoom | null = null;
		let cancelled = false;
		room = null;
		loading = true;
		failed = false;
		(async () => {
			r = new ChatRoom(id);
			try {
				await r.open(); // 화면을 연 것 자체가 입장 확인(ack_room)
			} catch (e) {
				if (cancelled) return; // 정리는 아래 cleanup 이 (다시 시도하면 attempt 가 바뀌어 cleanup 이 먼저 돈다)
				if (notFound(e)) {
					// 내 방이 아니거나 없는 방 — 목록으로
					toast('대화를 찾을 수 없어요');
					goBack('/'); // 홈 위에 홈을 쌓지 않게 (lib/nav.ts)
				} else {
					failed = true;
				}
				return;
			}
			if (cancelled) return r.dispose();
			room = r;
			loading = false;
		})();
		return () => {
			cancelled = true;
			r?.dispose();
			room = null;
		};
	});
</script>

{#key page.params.id}
	<ChatView
		room={room?.roomId === page.params.id ? room : null}
		loading={loading || (!!room && room.roomId !== page.params.id)}
		matched={!!page.state.matched}
		onretry={failed ? () => attempt++ : undefined}
	/>
{/key}
