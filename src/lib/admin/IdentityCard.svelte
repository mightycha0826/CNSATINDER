<script lang="ts">
	/**
	 * 신고 상세 — 신원 확인 (관리자만). ?/identity 액션 결과(form.identity)가 있으면 이메일과 명렬표 이름을,
	 * 없으면 확인 버튼을 보인다. 열람은 서버가 먼저 활동 기록에 남긴다.
	 */
	import { enhance } from '$app/forms';
	import type { Identity } from '$lib/adminTypes';
	import { confirmed } from './confirm';

	let { form, reportedLabel }: { form: unknown; reportedLabel: string } = $props();
	const identity = $derived((form as { identity?: { reported: Identity; reporter: Identity | null } } | null)?.identity);

	const ask = confirmed(() => '두 사람의 학교 이메일을 확인합니다. 열람 기록이 남습니다. 계속할까요?');
</script>

{#snippet row(label: string, who: Identity)}
	<dt>{label}</dt>
	<dd class="mono">{who.email ?? '(탈퇴)'}{#if who.name}<span class="rname">({who.name})</span>{/if}</dd>
{/snippet}

<section class="a-card">
	<h2 class="a-h2">신원 확인</h2>
	{#if identity}
		<dl class="a-dl">
			{@render row(reportedLabel, identity.reported)}
			{#if identity.reporter}{@render row('신고자', identity.reporter)}{/if}
		</dl>
		<p class="a-hint">이 열람은 활동 기록에 남습니다. 학생에게 조치를 전달할 때만 사용하세요.</p>
	{:else}
		<p class="a-hint first">학교 이메일은 꼭 필요할 때만 확인하세요.<br />열람하면 누가 언제 봤는지 기록됩니다.</p>
		<form method="POST" action="?/identity" use:enhance={ask}>
			<button class="btn-ghost">이메일 확인</button>
		</form>
	{/if}
</section>

<style>
	.first {
		margin-top: 0;
	}
	form {
		margin-top: 8px;
	}
</style>
