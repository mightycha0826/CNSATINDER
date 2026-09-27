<script lang="ts">
	// 서체 — Pretendard (자체 호스팅, 쓰는 글자만 나눠 받는 동적 서브셋 · CSP font-src 'self' 그대로)
	import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
	import '../app.css';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { hasSupabase } from '$lib/supabase';
	import { S, UI, init, toasts } from '$lib/state.svelte';
	import { loadThemeColor } from '$lib/themeColor.svelte';
	import { loadTheme } from '$lib/theme.svelte';
	import { listenServiceWorker } from '$lib/push';
	import { notifyInApp } from '$lib/inapp.svelte';
	import InAppBanner from '$lib/ui/InAppBanner.svelte';
	import { onNavigate } from '$app/navigation';
	import { reducedMotion } from '$lib/motion';

	let { children } = $props();

	// 테마 색상 · 화면 모드(설정) — 첫 화면을 그리기 전에 입힌다 (운영자 화면은 서버에서도 그려지므로 브라우저에서만)
	if (browser) {
		loadThemeColor();
		loadTheme();
	}

	const isAdmin = $derived(page.url.pathname === '/admin' || page.url.pathname.startsWith('/admin/'));

	// 운영자 화면에서는 학생 앱을 부팅하지 않는다 — 접속 신호(heartbeat)·알림 구독이
	// 이 브라우저의 학생 계정으로 나가면 실시간 현황에 운영진이 "접속 중"으로 잘못 뜬다
	$effect(() => {
		if (!isAdmin) void init();
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
			// 설치한 앱(홈 화면 앱)으로 떠 있으면 서비스워커에 알린다 — 알림을 누르면 브라우저 탭 말고 이 앱으로 열게
			if (window.matchMedia('(display-mode: standalone)').matches) {
				navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: 'standalone' })).catch(() => {});
			}
		}
		return () => window.removeEventListener('beforeinstallprompt', onPrompt);
	});

	// ── 서비스워커 (Phase 35) — 앱이 떠 있을 때 온 푸시는 앱 안 알림으로, 알림을 누르면 새로고침 없이 그 화면으로 ──
	$effect(() => {
		if (isAdmin) return;
		return listenServiceWorker({
			push: (n) =>
				notifyInApp(
					{ key: n.tag, title: n.title, body: n.body, url: n.url, kind: n.kind === 'other' ? 'notice' : n.kind },
					`${n.tag}|${n.body.slice(0, 60)}`
				),
			open: (url) => void goto(url)
		});
	});

	// ── 개발자 도구 열기 막기 (Phase 35) — F12 · Ctrl+Shift+I/J/C · Ctrl+U(소스 보기) · 오른쪽 클릭 메뉴.
	//    학생 앱만(운영자 화면은 그대로). 보안 장치는 아니다 — 브라우저 메뉴로는 여전히 열 수 있고, 모든 보호는 서버(RLS)가 한다.
	$effect(() => {
		if (isAdmin || import.meta.env.DEV) return;
		const key = (e: KeyboardEvent) => {
			const k = e.key.toUpperCase();
			const mod = e.ctrlKey || e.metaKey;
			if (k === 'F12' || (mod && e.shiftKey && ['I', 'J', 'C'].includes(k)) || (mod && e.altKey && ['I', 'J', 'C'].includes(k)) || (mod && k === 'U')) {
				e.preventDefault();
				e.stopPropagation();
			}
		};
		const menu = (e: MouseEvent) => {
			const t = e.target as HTMLElement | null;
			if (!t?.closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
		};
		window.addEventListener('keydown', key, true);
		window.addEventListener('contextmenu', menu);
		return () => {
			window.removeEventListener('keydown', key, true);
			window.removeEventListener('contextmenu', menu);
		};
	});

	// ── 화면 넘김 (Phase 35) — 새 화면이 뜰 때 이전 화면이 부드럽게 겹쳐 사라진다 (View Transitions, 지원 브라우저만).
	//    데이터를 받는 동안에도 이전 화면이 남아 있다가 넘어가서, 빈 화면이 번쩍이지 않는다.
	onNavigate((nav) => {
		if (!document.startViewTransition || reducedMotion() || isAdmin) return;
		const from = nav.from?.url.pathname ?? '';
		const to = nav.to?.url.pathname ?? '';
		if (from === to) return;
		// 하위 화면으로 들어가면 오른쪽에서, 돌아오면 왼쪽에서 (탭끼리는 겹쳐 사라지기만)
		const depth = (p: string) => (p === '/' || p === '/letters' || p === '/me' ? 0 : p.split('/').filter(Boolean).length);
		const dir = depth(to) > depth(from) ? 'push' : depth(to) < depth(from) ? 'pop' : 'fade';
		document.documentElement.dataset.nav = dir;
		return new Promise((resolve) => {
			const vt = document.startViewTransition(async () => {
				resolve();
				await nav.complete.catch(() => {}); // 다른 곳으로 곧바로 옮겨 가 이 이동이 취소돼도 오류로 남기지 않는다
			});
			vt.ready.catch(() => {});
			void vt.finished.catch(() => {}).finally(() => delete document.documentElement.dataset.nav);
		});
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
			void goto(UI.afterLogin ?? '/', { replaceState: true });
			return;
		}
		UI.afterLogin = null;

		// 3) 온보딩 (성별·선호를 정해야 매칭이 가능하다) · 이름 (명단에 없으면 적어야 편지를 쓸 수 있다, Phase 23)
		const onOnboarding = path === '/onboarding';
		if (S.profile && (!S.profile.onboarded || S.me === null)) {
			if (!onOnboarding) void goto('/onboarding', { replaceState: true });
		} else if (onOnboarding && S.profile?.onboarded) {
			void goto('/', { replaceState: true });
		}
	});
</script>

{#if isAdmin}
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
	<div class="splash">
		<img class="appicon" src="/icon-192.png" alt="" width="72" height="72" />
		<span class="wordmark">CNSATINDER</span>
	</div>
{:else}
	{@render children()}
{/if}

{#if !isAdmin}<InAppBanner />{/if}

<!-- 화면 아래 알림 — 한 장만, 새 알림이 오면 그 자리에서 바뀐다 (Phase 35) -->
<div class="toasts" aria-live="polite">
	{#each toasts as t (t.id)}
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
