<script lang="ts">
	import '../app.css';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { hasSupabase } from '$lib/supabase';
	import { S, UI, init } from '$lib/state.svelte';

	let { children } = $props();

	$effect(() => {
		void init();
	});

	// PWA 설치 프롬프트를 잡아둔다 (Android/Chrome)
	$effect(() => {
		const onPrompt = (e: Event) => {
			e.preventDefault();
			UI.installEvt = e as BeforeInstallPromptEvent;
		};
		window.addEventListener('beforeinstallprompt', onPrompt);

		if (import.meta.env.PROD && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch(() => {});
		}
		return () => window.removeEventListener('beforeinstallprompt', onPrompt);
	});

	// ── 라우팅 가드 ───────────────────────────────────────────────
	// !S.booted 동안에는 판단을 보류하고 스플래시를 띄운다 (리다이렉트 플리커 방지)
	$effect(() => {
		if (!S.booted) return;

		const path = page.url.pathname;
		if (path.startsWith('/admin')) return; // 운영자 대시보드는 자체 가드를 쓴다
		if (import.meta.env.DEV && path.startsWith('/dev')) return; // 개발용 미리보기는 로그인 불필요

		// 1) 브라우저에서 열면 설치 안내만 보여준다
		if (!UI.standalone) {
			if (path !== '/install') void goto('/install', { replaceState: true });
			return;
		}
		if (path === '/install') {
			void goto('/', { replaceState: true });
			return;
		}

		// 2) 로그인
		const onLogin = path === '/login';
		if (!S.session) {
			if (!onLogin) void goto('/login', { replaceState: true });
			return;
		}
		if (onLogin) {
			void goto('/', { replaceState: true });
			return;
		}

		// 3) 온보딩 (성별·선호를 정해야 매칭이 가능하다)
		const onOnboarding = path === '/onboarding';
		if (S.profile && !S.profile.onboarded) {
			if (!onOnboarding) void goto('/onboarding', { replaceState: true });
		} else if (onOnboarding && S.profile?.onboarded) {
			void goto('/', { replaceState: true });
		}
	});
</script>

{#if page.url.pathname === '/admin' || page.url.pathname.startsWith('/admin/')}
	<!-- 운영자 화면: 서버에서 그려지고 자체 가드(hooks.server.ts)를 쓴다. 학생용 부팅·설치 게이트 없음. -->
	{@render children()}
{:else if !hasSupabase}
	<div class="page setup">
		<h1 class="title">설정이 필요해요</h1>
		<p class="muted">
			프로젝트 루트에 <code>.env</code> 파일을 만들고
			<code>PUBLIC_SUPABASE_URL</code> 과 <code>PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> 를 넣어 주세요.
			<code>.env.example</code> 을 복사하면 됩니다.
		</p>
	</div>
{:else if !S.booted}
	<div class="splash">십분</div>
{:else}
	{@render children()}
{/if}

<div class="toasts">
	{#each S.toasts as t (t.id)}
		<div class="toast" class:out={t.out}>{t.text}</div>
	{/each}
</div>

<style>
	.setup {
		justify-content: center;
		gap: 12px;
	}
	.setup code {
		font-size: 13px;
		background: var(--field);
		border-radius: 4px;
		padding: 1px 5px;
	}
	.setup p {
		color: var(--text-2);
		line-height: 1.7;
		margin: 0;
	}
</style>
