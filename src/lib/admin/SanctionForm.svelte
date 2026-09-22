<script lang="ts">
	import { enhance } from '$app/forms';

	/**
	 * 제재 폼 — 신고 상세(채팅·편지)와 사용자 상세에서 같이 쓴다.
	 * targets 가 2개 이상이면 대상 선택 라디오가 나온다 (피신고자/신고자).
	 * 운영진은 영구 정지가 없고, 정지는 최대 7일.
	 */
	let {
		isAdmin,
		targets = [],
		banned = false
	}: {
		isAdmin: boolean;
		targets?: { v: string; label: string }[];
		/** 대상이 이미 영구 정지 상태인지 — 운영진은 해제할 수 없다 */
		banned?: boolean;
	} = $props();

	const MOD_MAX = 7;
	const ACTIONS = $derived(
		[
			{ v: 'warn', label: '경고' },
			{ v: 'suspend', label: isAdmin ? '기간 정지' : `기간 정지 (최대 ${MOD_MAX}일)` },
			{ v: 'ban', label: '영구 정지', admin: true },
			{ v: 'reinstate', label: '제한 해제', admin: banned }
		].filter((a) => isAdmin || !a.admin)
	);

	// 처음 값만 쓰면 된다 (대상 목록은 화면이 떠 있는 동안 바뀌지 않음)
	// svelte-ignore state_referenced_locally
	let target = $state(targets[0]?.v ?? '');
	let action = $state('suspend');
	let days = $state(3);
	let note = $state('');

	function confirmSanction(e: SubmitEvent) {
		const who = targets.find((t) => t.v === target)?.label ?? '이 계정';
		const what = ACTIONS.find((a) => a.v === action)!.label.replace(/ \(.*\)$/, '') + (action === 'suspend' ? ` ${days}일` : '');
		if (!confirm(`${who}에게 "${what}" 조치를 할까요? 이 조치는 기록됩니다.`)) e.preventDefault();
	}
</script>

<form method="POST" action="?/sanction" use:enhance onsubmit={confirmSanction}>
	{#if targets.length > 1}
		<div class="seg">
			{#each targets as t (t.v)}
				<label><input type="radio" name="target" value={t.v} bind:group={target} /> {t.label}</label>
			{/each}
		</div>
	{/if}
	<select class="field" name="action" bind:value={action}>
		{#each ACTIONS as a (a.v)}<option value={a.v}>{a.label}</option>{/each}
	</select>
	{#if action === 'suspend'}
		<label class="days">
			<input class="field num" type="number" name="days" min="1" max={isAdmin ? 365 : MOD_MAX} bind:value={days} /> 일
		</label>
	{/if}
	<textarea class="field ta" name="note" rows="2" placeholder="조치 사유 (기록용)" bind:value={note}></textarea>
	<button class="btn" class:danger-btn={action === 'ban'}>조치하기</button>
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 4px;
	}
	.seg {
		display: flex;
		gap: 14px;
		font-size: 13px;
	}
	.days {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	.days .field {
		width: 90px;
	}
	.ta {
		height: auto;
		padding: 8px 12px;
		resize: vertical;
	}
	.danger-btn {
		background: var(--danger);
	}
</style>
