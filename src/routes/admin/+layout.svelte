<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data, children } = $props();

	// 운영자 화면은 데스크톱 폭을 쓴다 (학생 앱은 520px 캔버스)
	$effect(() => {
		document.body.classList.add('admin');
		return () => document.body.classList.remove('admin');
	});

	const NAV = [
		{ href: '/admin', label: '신고' },
		{ href: '/admin/settings', label: '운영 설정' },
		{ href: '/admin/audit', label: '활동 기록' }
	];
	const active = (href: string) =>
		href === '/admin'
			? page.url.pathname === '/admin' || page.url.pathname.startsWith('/admin/reports')
			: page.url.pathname.startsWith(href);

	async function logout() {
		await fetch('/admin/session', { method: 'DELETE' });
		void goto('/admin/login', { replaceState: true });
	}
</script>

<svelte:head>
	<title>십분 운영</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.staff}
	<header class="bar">
		<a class="brand" href="/admin">십분 <span>운영</span></a>
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
		gap: 20px;
		height: 52px;
		padding: 0 24px;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}
	.brand {
		color: var(--text);
		font-weight: 800;
		font-size: 17px;
		letter-spacing: -0.03em;
	}
	.brand span {
		color: var(--text-2);
		font-weight: 600;
	}
	nav {
		display: flex;
		gap: 4px;
	}
	nav a {
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
		font-size: 13px;
		color: var(--text-2);
	}
	.out {
		font-size: 13px;
		font-weight: 600;
	}
	.wrap {
		flex: 1;
		padding: 24px;
	}
	@media (max-width: 640px) {
		.bar {
			gap: 10px;
			padding: 0 var(--pad);
		}
		.who {
			display: none;
		}
		.wrap {
			padding: var(--pad);
		}
	}
</style>
