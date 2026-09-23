<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import '$lib/admin/admin.css';

	let { data, children } = $props();

	// 운영자 화면은 데스크톱 폭을 쓴다 (학생 앱은 520px 캔버스)
	$effect(() => {
		document.body.classList.add('admin');
		return () => document.body.classList.remove('admin');
	});

	// 예전 서비스워커(cnsatinder-v6 까지)는 운영자 데이터까지 캐시해서 옛 화면을 계속 돌려줬다.
	// 새 워커를 바로 받아오게 하고, 그 사이에 쓰일 수 있는 캐시된 운영자 응답은 지금 지운다.
	$effect(() => {
		void (async () => {
			try {
				await (await navigator.serviceWorker?.getRegistration())?.update();
			} catch {
				/* 오프라인 등 — 다음에 다시 */
			}
			try {
				for (const name of await caches.keys()) {
					const c = await caches.open(name);
					for (const req of await c.keys())
						if (new URL(req.url).pathname.startsWith('/admin')) await c.delete(req);
				}
			} catch {
				/* caches 를 못 쓰는 환경 */
			}
		})();
	});

	const NAV = $derived(
		[
			{ href: '/admin/live', label: '실시간' },
			{ href: '/admin', label: '채팅 신고' },
			{ href: '/admin/letters', label: '편지 신고' },
			{ href: '/admin/users', label: '사용자' },
			{ href: '/admin/rooms', label: '전체 대화', admin: true },
			{ href: '/admin/notices', label: '공지사항' },
			{ href: '/admin/settings', label: '운영 설정' },
			{ href: '/admin/audit', label: '활동 기록' }
		].filter((n) => !n.admin || data.staff?.role === 'admin')
	);
	const active = (href: string) =>
		href === '/admin'
			? page.url.pathname === '/admin' || page.url.pathname.startsWith('/admin/reports')
			: href === '/admin/letters'
				? page.url.pathname.startsWith(href) || page.url.pathname.startsWith('/admin/posts')
				: page.url.pathname.startsWith(href);

	async function logout() {
		await fetch('/admin/session', { method: 'DELETE' });
		void goto('/admin/login', { replaceState: true });
	}
</script>

<svelte:head>
	<title>CNSATINDER 운영</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.staff}
	<header class="bar">
		<a class="brand" href="/admin">CNSATINDER <span>운영</span></a>
		<nav>
			{#each NAV as n (n.href)}
				<a href={n.href} class:on={active(n.href)}>{n.label}</a>
			{/each}
		</nav>
		<span class="who">{data.staff.role === 'admin' ? '관리자' : '운영진'}</span>
		<button class="out" onclick={logout}>로그아웃</button>
	</header>
{/if}

<main class="wrap">
	{@render children()}
</main>

<style>
	:global(body.admin #app) {
		max-width: 1080px;
	}
	.bar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 4px 20px;
		min-height: 52px;
		padding: 0 24px;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}
	.brand {
		flex: none;
		white-space: nowrap;
		color: var(--text);
		font-weight: 800;
		font-size: 17px;
		letter-spacing: -0.03em;
	}
	.brand span {
		color: var(--text-2);
		font-weight: 600;
	}
	/* 메뉴가 화면보다 길면 옆으로 민다 — 좁은 화면에서 글자가 한 자씩 줄바꿈되지 않게 */
	nav {
		display: flex;
		gap: 4px;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}
	nav::-webkit-scrollbar {
		display: none;
	}
	nav a {
		flex: none;
		white-space: nowrap;
		padding: 6px 10px;
		border-radius: var(--r-sm);
		color: var(--text-2);
		font-size: 14px;
		font-weight: 600;
	}
	nav a.on {
		color: var(--text);
		background: var(--field);
	}
	.who {
		margin-left: auto;
		flex: none;
		font-size: 13px;
		color: var(--text-2);
	}
	.out {
		flex: none;
		font-size: 13px;
		font-weight: 600;
	}
	.wrap {
		flex: 1;
		padding: 24px;
	}
	/* 좁은 화면: 첫 줄 = 이름 · 로그아웃, 둘째 줄 = 메뉴(옆으로 밀기) */
	@media (max-width: 900px) {
		.bar {
			flex-wrap: wrap;
			padding: 8px 24px 6px;
		}
		nav {
			order: 3;
			flex: 1 1 100%;
			margin: 0 -10px;
		}
		.who {
			margin-left: auto;
		}
	}
	@media (max-width: 640px) {
		.bar {
			padding: 8px var(--pad) 6px;
		}
		nav {
			margin: 0 calc(-1 * var(--pad));
			padding: 0 calc(var(--pad) - 10px);
		}
		.wrap {
			padding: var(--pad);
		}
	}
</style>
