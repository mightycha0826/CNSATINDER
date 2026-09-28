<script lang="ts">
	/**
	 * 개발 전용 — 업적 화면 미리보기 (Phase 31). Supabase 없이 가짜 데이터로.
	 *   /dev/achievements            업적 전체
	 *   /dev/achievements?celebrate  새 업적 축하 시트 (&one = 하나만)
	 * 배포 빌드에서는 아무것도 그리지 않고 홈으로 보낸다.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AchievementsView from '$lib/ui/AchievementsView.svelte';
	import AchievementCelebrate from '$lib/ui/AchievementCelebrate.svelte';
	import type { Achievement, BadgeLite, Category, MyAchievements, Tier } from '$lib/achievements';

	const A = (
		code: string,
		title: string,
		icon: string,
		category: Category,
		tiers: [number, number, number],
		value: number,
		tier: Tier,
		opts: Partial<Achievement> = {}
	): Achievement => ({
		code,
		title,
		icon,
		category,
		tiers,
		value,
		tier,
		description: opts.description ?? title,
		unit: opts.unit ?? '번',
		lower_better: opts.lower_better ?? false,
		earned_at: tier ? new Date().toISOString() : null,
		new: opts.new ?? false,
		granted: opts.granted ?? false
	});
	const items: Achievement[] = [
		A('warm', '따뜻한 사람', '🌡️', 'manner', [42, 45, 50], 45.2, 2, { unit: '도', description: '매너 온도', new: true }),
		A('good', '호평 수집가', '👍', 'manner', [10, 50, 200], 12, 1, { description: '"좋았어요" 평가 받기' }),
		A('kind', '친절왕', '🤝', 'manner', [10, 50, 200], 4, 0, { description: '"친절해요" 받기' }),
		A('fun', '이야기꾼', '🎉', 'manner', [10, 50, 200], 210, 3, { description: '"대화가 재밌어요" 받기' }),
		A('chats', '대화 여행자', '💬', 'chat', [5, 25, 100], 31, 2, { description: '끝까지 이어간 대화' }),
		A('extend', '연장의 달인', '⏳', 'chat', [5, 20, 50], 7, 1, { description: '둘 다 원해서 연장한 횟수' }),
		A('pin', '고정 친구', '📌', 'chat', [1, 3, 10], 1, 1, { unit: '명', description: '둘 다 고정한 채팅', new: true }),
		A('owl', '밤 올빼미', '🦉', 'chat', [5, 20, 50], 2, 0, { description: '밤 10시~12시에 시작한 대화' }),
		A('letter_got', '인기 편지함', '💌', 'letter', [5, 20, 50], 3, 0, { unit: '통', description: '받은 편지' }),
		A('deco', '꾸미기 장인', '🎨', 'letter', [3, 10, 30], 11, 2, { unit: '통', description: '글자를 꾸며 쓴 편지' }),
		// 운영진이 주는 특별 업적 (Phase 44) — 무지갯빛 · 등급 대신 "특별"
		A('beta', '베타 테스터', '🧪', 'special', [1, 1, 1], 0, 3, { unit: '', description: '출시 전 베타 테스트에 함께한 사람', granted: true }),
		A('streak', '개근상', '📅', 'special', [3, 7, 30], 5, 1, { unit: '일', description: '며칠 연속으로 접속' }),
		A('pioneer', '개척자', '🚩', 'special', [1000, 300, 100], 42, 3, { unit: '번째', description: '가입한 순서', lower_better: true })
	];
	const feat = (c: string): BadgeLite => {
		const a = items.find((x) => x.code === c)!;
		return { code: a.code, title: a.title, icon: a.icon, tier: a.tier };
	};
	let data = $state<MyAchievements>({ items, featured: [feat('fun'), feat('pioneer'), feat('warm')], chosen: [] });
	const celebrate = page.url.searchParams.has('celebrate');
	const fresh = page.url.searchParams.has('one') ? [feat('pin')] : [feat('warm'), feat('pin'), feat('fun')];

	async function feature(codes: string[]) {
		(window as unknown as { __featured: unknown }).__featured = codes;
		data = { ...data, chosen: codes, featured: codes.map(feat) };
		return true;
	}

	$effect(() => {
		if (!import.meta.env.DEV) void goto('/', { replaceState: true });
	});
</script>

{#if import.meta.env.DEV}
	<div class="topbar"><span class="title">업적 (미리보기)</span></div>
	<div class="page ach">
		<AchievementsView {data} onfeature={feature} />
	</div>
	{#if celebrate}<AchievementCelebrate preview={fresh} />{/if}
{/if}

<style>
	.ach {
		gap: 14px;
		padding-top: 12px;
	}
</style>
