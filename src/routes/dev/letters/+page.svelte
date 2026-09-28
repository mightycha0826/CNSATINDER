<script lang="ts">
	/**
	 * 개발 전용 — 봉투 · 편지지 미리보기 (Phase 43). Supabase 없이 가짜 편지로.
	 *   /dev/letters         편지함 크기 봉투(받은 · 보낸) · 책상 위 작은 봉투 · 봉투 안 편지지 · 읽는 편지지
	 *   /dev/letters?dark    다크 모드로
	 * 배포 빌드에서는 아무것도 그리지 않고 홈으로 보낸다.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Envelope from '$lib/letters/Envelope.svelte';
	import LetterSheet from '$lib/letters/LetterSheet.svelte';
	import { envWidth } from '$lib/letters/stage';

	const w = $derived(envWidth(340, 56));
	const body = '안녕! 오늘 급식 카레 진짜 맛있지 않았어?\n수행평가 끝나면 같이 매점 가자.\n답장 기다릴게 :)';

	$effect(() => {
		if (!import.meta.env.DEV) void goto('/', { replaceState: true });
		else if (page.url.searchParams.has('dark')) document.documentElement.dataset.theme = 'dark';
	});
</script>

{#if import.meta.env.DEV}
	<div class="topbar"><span class="title">편지 (미리보기)</span></div>
	<div class="page preview">
		<h2>받은 편지 · 안 연 봉투</h2>
		<div class="env"><Envelope to="김하늘" from="익명의 여학생" date="9.28" side="back" border="f" glow {w} /></div>

		<h2>받은 편지 · 연 봉투</h2>
		<div class="env"><Envelope to="김하늘" from="별빛소년" date="9.27" side="back" sealed={false} border="m" {w} /></div>

		<h2>보낸 편지 · 주소 쪽</h2>
		<div class="env"><Envelope to="이서준" toSub="2학년" from="김하늘" date="9.26" sticker="읽음" {w} /></div>

		<h2>봉투 안 편지지</h2>
		<div class="env tall"><Envelope to="김하늘" from="익명의 남학생" date="9.28" side="back" open paper="out" sealed={false} border="m" {body} {w} /></div>

		<h2>책상 위 작은 봉투 (176)</h2>
		<div class="env"><Envelope to="김하늘" from="익명의 여학생" date="9.25" border="f" postmark="9.25" w={176} /></div>

		<h2>읽는 편지지</h2>
		<LetterSheet to="김하늘" from="익명의 여학생" date="2026년 9월 28일" {body} />
	</div>
{/if}

<style>
	.preview {
		gap: 14px;
		padding-top: 12px;
		padding-bottom: 60px;
		background: var(--desk);
	}
	h2 {
		margin: 12px 0 0;
		font-size: 13px;
		color: var(--text-2);
	}
	.env {
		display: flex;
		justify-content: center;
		perspective: 1200px;
	}
	.env.tall {
		padding-top: 150px;
	}
</style>
