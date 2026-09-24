<script lang="ts">
	/**
	 * 대화의 맨 처음 — 인스타 DM 첫 화면처럼 상대 소개 (위로 끝까지 올리면 보인다).
	 * 큰 아바타 · 익명 이름 · "MBTI · 관심사 두 개" 한 줄 · 프로필 보기. 적어 둔 게 없으면 앱 이름.
	 */
	import Avatar from '$lib/ui/Avatar.svelte';
	import type { PartnerProfile } from './types';

	let {
		alias,
		online,
		profile,
		onprofile
	}: { alias: string; online: boolean; profile: PartnerProfile | null; onprofile: () => void } = $props();

	const line = $derived(
		[profile?.mbti, ...(profile?.interests ?? []).slice(0, 2)].filter(Boolean).join(' · ') || 'CNSATINDER 익명 대화'
	);
</script>

<div class="intro">
	<Avatar name={alias} size={88} {online} />
	<h2>{alias}</h2>
	<p>{line}</p>
	<button class="intro-btn" onclick={onprofile}>프로필 보기</button>
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 20px 0 12px;
		text-align: center;
	}
	h2 {
		margin: 10px 0 0;
		font-size: 20px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	p {
		margin: 0;
		font-size: 14px;
		color: var(--text-2);
	}
	.intro-btn {
		margin-top: 12px;
		height: 34px;
		padding: 0 16px;
		border-radius: 10px;
		background: var(--field);
		font-size: 14px;
		font-weight: 600;
	}
</style>
