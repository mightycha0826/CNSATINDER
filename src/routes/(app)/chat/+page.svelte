<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { ChatRoom } from '$lib/chat/room.svelte';
	import ChatView from '$lib/chat/ChatView.svelte';

	let room = $state<ChatRoom | null>(null);
	let loading = $state(true);

	$effect(() => {
		let r: ChatRoom | null = null;
		let cancelled = false;
		(async () => {
			const { data, error } = await supabase.rpc('my_room');
			if (cancelled) return;
			const id = data?.room?.room_id as string | undefined;
			if (error || !id) {
				void goto('/', { replaceState: true });
				return;
			}
			r = new ChatRoom(id);
			room = r;
			await r.open(); // 화면을 연 것 자체가 입장 확인(ack_room)
			loading = false;
		})();
		return () => {
			cancelled = true;
			r?.dispose();
		};
	});
</script>

<ChatView {room} {loading} />
