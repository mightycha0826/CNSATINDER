<script lang="ts">
	/**
	 * 대화 목록에서 길게 누르면(마우스는 오른쪽 클릭) 뜨는 메뉴 — 신고하기 · 차단하기 · 대화 나가기.
	 * 내용은 대화방 ⋯ 와 같은 RoomActions, 여기서는 RPC 를 바로 부른다. 셋 다 대화를 끝내므로 ondone 에서 목록을 다시 읽는다.
	 */
	import Sheet from '$lib/ui/Sheet.svelte';
	import { rpc } from '$lib/rpc';
	import RoomActions from './RoomActions.svelte';

	let {
		roomId,
		alias,
		pinned = false,
		onclose,
		ondone
	}: { roomId: string; alias: string; pinned?: boolean; onclose: () => void; ondone: () => void } = $props();
</script>

<Sheet {onclose} label="{alias} 메뉴">
	<RoomActions
		title={alias}
		{pinned}
		actions={{
			leave: () => rpc<void>('leave_room', { p_room: roomId, p_skip: false }),
			block: () => rpc<void>('block_partner', { p_room: roomId }),
			report: (reason, note) => rpc<void>('report_partner', { p_room: roomId, p_reason: reason, p_note: note })
		}}
		{onclose}
		{ondone}
	/>
</Sheet>
