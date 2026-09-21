<script lang="ts">
	import { UI, isIOS, promptInstall, toast } from '$lib/state.svelte';

	const ios = isIOS();
	let installing = $state(false);

	async function onInstall() {
		installing = true;
		const ok = await promptInstall();
		installing = false;
		if (!ok) toast('설치를 취소했어요');
	}
</script>

<div class="page gate">
	<div class="mark">십분</div>
	<h1>앱을 설치해야 시작할 수 있어요</h1>
	<p class="muted lead">
		십분은 홈 화면에 설치한 뒤 아이콘으로 들어와야 동작합니다.<br />브라우저 탭에서는 대화가 열리지
		않아요.
	</p>

	{#if ios}
		<ol class="steps">
			<li>
				하단의 <strong>공유</strong> 버튼
				<svg class="ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M12 15V3m0 0L8.5 6.5M12 3l3.5 3.5"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
					/>
				</svg>
				을 누르세요
			</li>
			<li><strong>홈 화면에 추가</strong>를 선택하세요</li>
			<li>홈 화면에 생긴 <strong>십분</strong> 아이콘으로 들어오세요</li>
		</ol>
	{:else if UI.installEvt}
		<button class="btn" onclick={onInstall} disabled={installing}>
			{installing ? '설치 중…' : '홈 화면에 설치하기'}
		</button>
		<p class="muted note">설치 후 생긴 아이콘으로 다시 들어와 주세요.</p>
	{:else}
		<ol class="steps">
			<li>브라우저 메뉴 <strong>⋮</strong> 를 누르세요</li>
			<li><strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 선택하세요</li>
			<li>홈 화면에 생긴 <strong>십분</strong> 아이콘으로 들어오세요</li>
		</ol>
	{/if}
</div>

<style>
	.gate {
		justify-content: center;
		gap: 14px;
		padding-bottom: 48px;
	}
	.mark {
		font-size: 28px;
		font-weight: 800;
		letter-spacing: -0.04em;
		margin-bottom: 8px;
	}
	h1 {
		font-size: 19px;
		font-weight: 700;
		letter-spacing: -0.02em;
		margin: 0;
	}
	.lead {
		margin: 0;
		line-height: 1.7;
		font-size: 14px;
	}
	.note {
		margin: 0;
		font-size: 13px;
	}
	.steps {
		margin: 6px 0 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 14px;
		color: var(--text-2);
	}
	.steps strong {
		color: var(--text);
		font-weight: 600;
	}
	.ico {
		width: 16px;
		height: 16px;
		vertical-align: -3px;
		color: var(--text);
	}
</style>
