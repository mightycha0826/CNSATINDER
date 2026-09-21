<script lang="ts">
	import { goto } from '$app/navigation';

	// 예전 주소(/chat) — 이제 대화마다 /chat/[id] 를 쓴다. 대화 목록으로 보낸다.
	$effect(() => {
		void goto('/', { replaceState: true });
	});
</script>
