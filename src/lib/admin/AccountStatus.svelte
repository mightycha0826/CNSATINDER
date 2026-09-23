<script lang="ts">
	/**
	 * 계정 상태 — 영구 정지 / 정지 (검토 대기) / ○까지 정지 / 정상 / 탈퇴.
	 * pill = 제목 옆 작은 표시 (정상이면 아무것도 안 보임), 아니면 목록(dd) 안의 글자.
	 */
	import { fmtTime } from '$lib/adminTypes';
	import { suspendedNow } from '$lib/restriction';

	let { account, pill = false }: { account: { status: string; suspended_until: string | null } | null; pill?: boolean } =
		$props();

	const text = $derived.by(() => {
		if (!account) return null;
		if (account.status === 'banned') return pill ? '영구정지' : '영구 정지';
		if (account.status === 'suspended') return '정지 (검토 대기)';
		if (suspendedNow(account)) return `${fmtTime(account.suspended_until!)}까지 정지`;
		return null;
	});
</script>

{#if pill}
	{#if text}<span class="pill red">{text}</span>{/if}
{:else if text}<b class="danger">{text}</b>
{:else if !account}<span class="muted">탈퇴</span>
{:else}정상{/if}
