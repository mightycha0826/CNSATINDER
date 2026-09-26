<script lang="ts">
	import { UI, promptInstall, toast } from '$lib/state.svelte';
	import { detectEnv, openExternalUrl, IN_APP_NAME } from '$lib/platform';

	const env =
		typeof navigator === 'undefined'
			? detectEnv('')
			: detectEnv(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
	const ios = env.os === 'ios';
	// 링크는 항상 첫 화면으로 — 설치 후 아이콘이 여기서부터 시작한다
	const appUrl = typeof location === 'undefined' ? '' : location.origin + '/';
	const external = openExternalUrl(env, appUrl);
	const browserName = ios ? 'Safari' : 'Chrome';

	let installing = $state(false);

	async function onInstall() {
		installing = true;
		const ok = await promptInstall();
		installing = false;
		if (!ok) toast('설치 취소됨');
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(appUrl);
			toast(`링크 복사됨 · ${browserName}에 붙여 넣어 주세요`);
		} catch {
			// 인앱 브라우저는 클립보드를 막는 경우가 있다 — 직접 길게 눌러 복사하도록
			toast('아래 주소를 길게 눌러 복사해 주세요');
		}
	}
</script>

{#snippet shareIcon()}
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
{/snippet}

<div class="page gate">
	<img class="appicon" src="/icon-192.png" alt="" width="56" height="56" />
	<div class="mark wordmark">CNSATINDER</div>

	{#if env.inApp}
		<!-- 카카오톡·인스타 등 앱 안 브라우저 — 여기엔 '홈 화면에 추가'가 없다 -->
		<h1>{browserName}에서 열어 주세요</h1>

		{#if external}
			<a class="btn" href={external}>{browserName}로 열기</a>
		{:else}
			<ol class="steps">
				{#if env.inApp === 'instagram' || env.inApp === 'facebook'}
					<li>오른쪽 위 <strong>···</strong> 를 누르세요</li>
					<li><strong>외부 브라우저에서 열기</strong>를 선택하세요</li>
				{:else}
					<li>화면 아래나 위의 <strong>···</strong> 또는 {@render shareIcon()} 버튼을 누르세요</li>
					<li><strong>{browserName}로 열기</strong> 또는 <strong>기본 브라우저로 열기</strong>를 선택하세요</li>
				{/if}
				<li>열린 {browserName}에서 설치 안내를 따라 주세요</li>
			</ol>
		{/if}
		<button class="btn-ghost" onclick={copyLink}>링크 복사하기</button>
		<p class="url muted">{appUrl}</p>
	{:else if ios}
		<h1>앱을 설치해야 시작할 수 있어요</h1>

		{#if env.browser === 'safari'}
			<ol class="steps">
				<li>
					하단의 <strong>공유</strong> 버튼 {@render shareIcon()} 을 누르세요
					<span class="sub">버튼이 안 보이면 주소창 옆 <strong>···</strong> 을 먼저 누르세요</span>
				</li>
				<li>
					목록을 아래로 내려 <strong>홈 화면에 추가</strong>를 누르세요
					<span class="sub">없으면 <strong>더 보기</strong> 안에 있어요</span>
				</li>
				<li>오른쪽 위 <strong>추가</strong>를 누르세요</li>
				<li>홈 화면에 생긴 <strong>CNSATINDER</strong> 아이콘으로 들어오세요</li>
			</ol>
		{:else}
			<!-- iOS 16.4 부터 Chrome·Edge·Firefox 도 공유 메뉴에서 홈 화면 추가를 지원한다 -->
			<ol class="steps">
				<li>주소창 오른쪽의 <strong>공유</strong> 버튼 {@render shareIcon()} 을 누르세요</li>
				<li>
					<strong>홈 화면에 추가</strong>를 누르세요
					<span class="sub">없으면 <strong>더 보기</strong> 안에 있어요</span>
				</li>
				<li>홈 화면에 생긴 <strong>CNSATINDER</strong> 아이콘으로 들어오세요</li>
			</ol>
			<p class="muted note"><strong>홈 화면에 추가</strong>가 없으면 <strong>Safari</strong>에서 열어 주세요.</p>
			<button class="btn-ghost" onclick={copyLink}>링크 복사하기</button>
		{/if}
	{:else}
		<h1>앱을 설치해야 시작할 수 있어요</h1>

		{#if UI.installEvt}
			<button class="btn" onclick={onInstall} disabled={installing}>
				{installing ? '설치 중…' : '홈 화면에 설치하기'}
			</button>
			<p class="muted note">설치 후 생긴 아이콘으로 다시 들어와 주세요.</p>
		{:else}
			<ol class="steps">
				<li>브라우저 메뉴 <strong>⋮</strong> 또는 <strong>≡</strong> 를 누르세요</li>
				<li>
					<strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 선택하세요
					<span class="sub">삼성 인터넷은 <strong>현재 페이지 추가 → 홈 화면</strong></span>
				</li>
				<li>홈 화면에 생긴 <strong>CNSATINDER</strong> 아이콘으로 들어오세요</li>
			</ol>
		{/if}
	{/if}
</div>

<style>
	.gate {
		justify-content: center;
		gap: 14px;
		padding-bottom: 48px;
	}
	.appicon {
		margin-bottom: 2px;
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
	.note {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
	}
	.note strong {
		color: var(--text);
		font-weight: 600;
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
	.sub {
		display: block;
		margin-top: 2px;
		font-size: 12px;
	}
	.ico {
		width: 16px;
		height: 16px;
		vertical-align: -3px;
		color: var(--text);
	}
	a.btn {
		color: var(--on-accent);
	}
	.url {
		margin: -4px 0 0;
		font-size: 12px;
		text-align: center;
		user-select: all;
		-webkit-user-select: all;
		word-break: break-all;
	}
</style>
