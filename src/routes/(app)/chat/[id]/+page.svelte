<script lang="ts">
	import { goBack } from '$lib/nav';
	import { page } from '$app/state';
	import { ChatRoom } from '$lib/chat/room.svelte';
	import ChatView from '$lib/chat/ChatView.svelte';
	import { toast } from '$lib/state.svelte';

	/** 대화방 하나. 여러 대화가 동시에 열려 있을 수 있어 주소에 방 id 를 싣는다. */
	let room = $state<ChatRoom | null>(null);
	let loading = $state(true);

	$effect(() => {
		const id = page.params.id ?? '';
		let r: ChatRoom | null = null;
		let cancelled = false;
		loading = true;
		(async () => {
			r = new ChatRoom(id);
			try {
				await r.open(); // 화면을 연 것 자체가 입장 확인(ack_room)
			} catch {
				// 내 방이 아니거나 없는 방 — 목록으로
				if (!cancelled) {
					toast('대화를 찾을 수 없어요');
					goBack('/'); // 홈 위에 홈을 쌓지 않게 (lib/nav.ts)
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

<ChatView {room} {loading} />
