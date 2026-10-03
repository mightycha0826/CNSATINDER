<script lang="ts" module>
	import type { ReportReason } from './types';

	export type RoomStep = 'menu' | 'leave' | 'block' | 'report';
	/**
	 * 무엇을 할지는 부르는 쪽이 정한다 (대화 목록: RPC 를 바로 · 대화방: 방 상태(ChatRoom)를 거쳐).
	 * false 또는 오류를 돌려주면 이유를 표시하고 시트를 유지해 재시도할 수 있다.
	 */
	export type RoomActionFns = {
		leave: () => unknown;
		block: () => Promise<boolean | void>;
		report: (reason: ReportReason, note: string) => Promise<boolean | void>;
	};
</script>

<script lang="ts">
	/**
	 * 대화 메뉴의 내용 (Phase 42 에서 하나로) — 대화 목록에서 길게 누르기(RoomMenu) · 대화방 ⋯ (ChatView) 가 같이 쓴다.
	 * 신고하기 · 차단하기 · 대화 나가기 → 각각 확인 한 단계. 대화방에서는 맨 위에 프로필 보기(onprofile).
	 * 시트(Sheet)는 부르는 쪽이 감싼다 — 대화방은 같은 시트 안에서 프로필 카드로 넘어가야 해서.
	 */
	import ReportPicker from '$lib/ui/ReportPicker.svelte';
	import { errMsg, toast } from '$lib/state.svelte';

	let {
		step = $bindable('menu'),
		title = '',
		pinned = false,
		actions,
		leaveToast = '대화에서 나왔어요',
		onprofile,
		onclose,
		ondone
	}: {
		step?: RoomStep;
		/** 맨 위에 작게 보일 상대 이름 (대화 목록에서) */
		title?: string;
		/** 둘 다 고정한 대화 — 나가면 내용도 사라진다고 알린다 */
		pinned?: boolean;
		actions: RoomActionFns;
		/** 나간 뒤 알림 — 대화방은 화면 자체가 "대화 종료"로 바뀌므로 null */
		leaveToast?: string | null;
		onprofile?: () => void;
		onclose: () => void;
		ondone: () => void;
	} = $props();

	let reason = $state<ReportReason | null>(null);
	let note = $state('');
	let acting = $state(false);
	let actionError = $state('');

	async function act(fn: () => unknown, done: string | null) {
		if (acting) return;
		acting = true;
		actionError = '';
		try {
			if ((await fn()) === false) {
				actionError = '완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
				return;
			}
			if (done) toast(done);
			ondone();
		} catch (e) {
			actionError = errMsg(e);
		} finally {
			acting = false;
		}
	}
</script>

{#if step === 'menu'}
	{#if title}<p class="who muted">{title}</p>{/if}
	{#if onprofile}<button class="item" onclick={onprofile}>프로필 보기</button>{/if}
	<button class="item danger" onclick={() => (step = 'report')}>신고하기</button>
	<button class="item danger" onclick={() => (step = 'block')}>차단하기</button>
	<button class="item" onclick={() => (step = 'leave')}>대화 나가기</button>
	<button class="item" onclick={onclose}>취소</button>
{:else if step === 'leave'}
	<p class="warn">{pinned ? '고정한 대화예요. 나가면 대화가 끝나고 내용도 사라져요.' : '나가면 대화가 끝나요.'}</p>
	<button class="item danger" onclick={() => act(actions.leave, leaveToast)} disabled={acting}>나가기</button>
	<button class="item" onclick={onclose}>취소</button>
{:else if step === 'block'}
	<p class="warn">차단하면 다시 연결되지 않아요.</p>
	<button class="item danger" onclick={() => act(actions.block, '차단 완료 · 다시는 만나지 않아요')} disabled={acting}>차단하기</button>
	<button class="item" onclick={onclose}>취소</button>
{:else}
	<ReportPicker bind:reason bind:note title="무엇이 문제였나요?" intro="신고하면 자동으로 차단돼요." />
	<button
		class="item danger"
		onclick={() => act(() => actions.report(reason!, note.trim()), '신고 접수 · 운영진이 확인할게요')}
		disabled={!reason || acting}
	>
		{acting ? '신고하는 중…' : '신고하기'}
	</button>
	<button class="item" onclick={onclose}>취소</button>
{/if}

{#if actionError}<p class="warn" role="alert">{actionError}</p>{/if}

<style>
	.who {
		margin: 6px var(--pad) 10px;
		text-align: center;
		font-size: 13px;
	}
</style>
