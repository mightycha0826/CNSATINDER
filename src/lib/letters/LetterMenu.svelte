<script lang="ts">
	/**
	 * 편지 메뉴 — 편지 목록에서 길게 누르기 · 편지 화면의 ⋯ 가 같이 쓴다.
	 * 신고하기 · 차단하기 · 나가기. 셋 다 하고 나면 그 편지는 내 목록에서 사라진다 (Phase 25) → ondone.
	 */
	import Sheet from '$lib/ui/Sheet.svelte';
	import ReportPicker from '$lib/ui/ReportPicker.svelte';
	import type { ReportReason } from '$lib/chat/types';
	import { errMsg, toast } from '$lib/state.svelte';
	import { blockThread, closeThread, reportThread, type DmRole } from './api';

	let {
		thread,
		title = '',
		onclose,
		ondone
	}: { thread: { id: number; role: DmRole }; title?: string; onclose: () => void; ondone: () => void } = $props();

	let step = $state<'menu' | 'leave' | 'block' | 'report'>('menu');
	let reason = $state<ReportReason | null>(null);
	let note = $state('');
	let acting = $state(false);

	async function act(fn: () => Promise<unknown>, done: string) {
		if (acting) return;
		acting = true;
		try {
			await fn();
			toast(done);
			ondone();
		} catch (e) {
			toast(errMsg(e));
		} finally {
			acting = false;
		}
	}
</script>

<Sheet {onclose} label={title ? `${title} 메뉴` : '편지 메뉴'}>
	{#if step === 'menu'}
		{#if title}<p class="who muted">{title}</p>{/if}
		<button class="item danger" onclick={() => (step = 'report')}>신고하기</button>
		<button class="item danger" onclick={() => (step = 'block')}>차단하기</button>
		<button class="item" onclick={() => (step = 'leave')}>나가기</button>
		<button class="item" onclick={onclose}>취소</button>
	{:else if step === 'leave'}
		<p class="warn">목록에서 사라져요.{#if thread.role === 'received'}<br /><strong>이 사람은 다시 편지를 보낼 수 없어요.</strong>{/if}</p>
		<button class="item danger" onclick={() => act(() => closeThread(thread.id), '편지에서 나왔어요')} disabled={acting}>나가기</button>
		<button class="item" onclick={onclose}>취소</button>
	{:else if step === 'block'}
		<p class="warn">차단하면 서로 편지 · 채팅이 안 돼요.</p>
		<button class="item danger" onclick={() => act(() => blockThread(thread.id), '차단했어요')} disabled={acting}>차단하기</button>
		<button class="item" onclick={onclose}>취소</button>
	{:else}
		<ReportPicker
			bind:reason
			bind:note
			title="무엇이 문제인가요?"
			intro="신고하면 자동으로 차단돼요."
		/>
		<button
			class="item danger"
			onclick={() =>
				act(async () => {
					const r = await reportThread(thread.id, reason!, note.trim());
					if (r.status === 'already') throw new Error('이미 신고한 편지예요');
				}, '신고했어요')}
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
