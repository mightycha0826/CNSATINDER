<script lang="ts">
	/**
	 * 대화 목록에서 길게 누르면 뜨는 메뉴 — 신고하기 · 차단하기 · 나가기 (대화방 ⋯ 메뉴와 같은 일, 같은 RPC).
	 * 셋 다 대화를 끝내므로, 끝나면 ondone 에서 목록을 다시 읽는다.
	 */
	import Sheet from '$lib/ui/Sheet.svelte';
	import ReportPicker from '$lib/ui/ReportPicker.svelte';
	import { supabase } from '$lib/supabase';
	import { errMsg, toast } from '$lib/state.svelte';
	import type { ReportReason } from './types';

	let {
		roomId,
		alias,
		onclose,
		ondone
	}: { roomId: string; alias: string; onclose: () => void; ondone: () => void } = $props();

	let step = $state<'menu' | 'leave' | 'block' | 'report'>('menu');
	let reason = $state<ReportReason | null>(null);
	let note = $state('');
	let acting = $state(false);

	async function run(fn: string, args: Record<string, unknown>, done: string) {
		if (acting) return;
		acting = true;
		try {
			const { error } = await supabase.rpc(fn, args);
			if (error) throw error;
			toast(done);
			ondone();
		} catch (e) {
			toast(errMsg(e));
		} finally {
			acting = false;
		}
	}
</script>

<Sheet {onclose} label="{alias} 메뉴">
	{#if step === 'menu'}
		<p class="who muted">{alias}</p>
		<button class="item danger" onclick={() => (step = 'report')}>신고하기</button>
		<button class="item danger" onclick={() => (step = 'block')}>차단하기</button>
		<button class="item" onclick={() => (step = 'leave')}>대화 나가기</button>
		<button class="item" onclick={onclose}>취소</button>
	{:else if step === 'leave'}
		<p class="warn">나가면 이 대화는 두 사람 모두에게서 끝나고<br />다시 볼 수 없어요.</p>
		<button class="item danger" onclick={() => run('leave_room', { p_room: roomId, p_skip: false }, '대화에서 나왔어요')} disabled={acting}>나가기</button>
		<button class="item" onclick={onclose}>취소</button>
	{:else if step === 'block'}
		<p class="warn">
			차단하면 대화가 바로 끝나고 <strong>다시는 이 사람과 연결되지 않아요.</strong><br />
			상대에게는 차단했다는 사실이 알려지지 않아요.
		</p>
		<button class="item danger" onclick={() => run('block_partner', { p_room: roomId }, '차단 완료 · 다시는 만나지 않아요')} disabled={acting}>차단하기</button>
		<button class="item" onclick={onclose}>취소</button>
	{:else}
		<ReportPicker
			bind:reason
			bind:note
			title="무엇이 문제였나요?"
			intro="신고하면 대화가 끝나고 자동으로 차단돼요. 대화 내용은 운영진만 확인하고, 상대는 누가 신고했는지 알 수 없어요."
		/>
		<button
			class="item danger"
			onclick={() => run('report_partner', { p_room: roomId, p_reason: reason, p_note: note.trim() }, '신고 접수 · 운영진이 확인할게요')}
			disabled={!reason || acting}
		>
			{acting ? '신고하는 중…' : '신고하기'}
		</button>
		<button class="item" onclick={onclose}>취소</button>
	{/if}
</Sheet>

<style>
	.who {
		margin: 6px var(--pad) 10px;
		text-align: center;
		font-size: 13px;
	}
</style>
