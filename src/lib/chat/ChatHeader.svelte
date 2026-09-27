<script lang="ts">
	/**
	 * 대화방 머리글 — 뒤로 · 상대(아바타 · 이름 · 상태) · 남은 시간(멈춤이면 ⏸, 고정한 대화면 "고정됨") · 메뉴.
	 * 상태 문구 · 시간은 ChatView 가 계산해서 넘긴다 (여기는 그리기만).
	 */
	import Avatar from '$lib/ui/Avatar.svelte';
	import BackButton from '$lib/ui/BackButton.svelte';

	let {
		alias,
		status,
		online,
		closed,
		pinned,
		paused,
		pending,
		urgent,
		mmss,
		onprofile,
		onmenu
	}: {
		alias: string | null;
		status: string;
		online: boolean;
		closed: boolean;
		pinned: boolean;
		paused: boolean;
		pending: boolean;
		urgent: boolean;
		mmss: string;
		onprofile: () => void;
		onmenu: () => void;
	} = $props();
</script>

<header class="topbar">
	<BackButton href="/" history />

	{#if alias}
		<button class="who" onclick={onprofile} aria-label="상대 프로필 보기">
			<Avatar name={alias} size={32} online={online && !closed} />
			<span class="names">
				<span class="alias">{alias}</span>
				<span class="sub">{status}</span>
			</span>
		</button>
		{#if !closed && pinned}
			<span class="pinned-tag" aria-label="고정한 대화">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5h6l-1 5.5 3.5 3.5v1.5h-11V12.5L10 9 9 3.5zM12 14v6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" /></svg>
				고정됨
			</span>
		{:else if !closed}
			<span class="timer num" class:urgent={urgent && !paused} class:dim={pending || paused} aria-label={paused ? `멈춤 ${mmss}` : mmss}
				>{#if paused}<svg class="pause-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>{/if}{mmss}</span
			>
		{/if}
		{#if !closed}
			<button class="more" onclick={onmenu} aria-label="메뉴">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="5" cy="12" r="1.6" fill="currentColor" />
					<circle cx="12" cy="12" r="1.6" fill="currentColor" />
					<circle cx="19" cy="12" r="1.6" fill="currentColor" />
				</svg>
			</button>
		{/if}
	{/if}
</header>

<style>
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		text-align: left;
	}
	.names {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.2;
	}
	.alias {
		font-weight: 700;
		font-size: 15px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 12px;
		color: var(--text-2);
	}
	.timer {
		margin-left: auto;
		font-size: 15px;
		font-weight: 700;
	}
	.timer .pause-ic {
		width: 12px;
		height: 12px;
		margin-right: 3px;
		vertical-align: -1px;
	}
	.timer.urgent {
		color: var(--danger);
	}
	.timer.dim {
		color: var(--text-2);
	}
	.pinned-tag {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 3px;
		color: var(--accent);
		font-size: 13px;
		font-weight: 700;
		white-space: nowrap;
	}
	.pinned-tag svg {
		width: 16px;
		height: 16px;
	}
	.more {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		margin-right: -6px;
	}
	.more svg {
		width: 22px;
		height: 22px;
	}
</style>
