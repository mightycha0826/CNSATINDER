<script lang="ts">
	/**
	 * 매너 평가 대기 (Phase 30 · 35) — 방금 끝난 대화 · 고정한 대화 중 아직 평가 안 한 것 하나를 화면 가운데 큰 카드로 (RateModal).
	 * 홈이 띄운다. paused = 다른 창(알림 안내 · AI 대화 · 업적 축하)이 떠 있는 동안은 기다린다.
	 */
	import { INBOX } from '$lib/inbox.svelte';
	import { toast } from '$lib/state.svelte';
	import { fetchPendingRatings, ratePartner, skipRating, skippedRatings, type PendingRating, type Reason, type Score } from '$lib/manner';
	import RateModal from './RateModal.svelte';

	let { paused = false }: { paused?: boolean } = $props();

	let pending = $state<PendingRating[]>([]);
	let skipped = $state(new Set<string>());
	const toRate = $derived(pending.find((p) => !skipped.has(p.room_id)) ?? null);
	// 평가할 대화가 생기는 때 = 대화가 끝나거나 고정될 때뿐 — 그때(대화 목록에서 끝난 · 고정된 방이 바뀔 때)만 다시 묻는다.
	// 예전엔 1분마다 물었다 (요청 하나하나가 Supabase 로그 사용량이 된다, Phase 36)
	const doneKey = $derived(
		INBOX.rooms
			.filter((r) => r.status === 'closed' || r.pinned)
			.map((r) => r.room_id)
			.sort()
			.join(',')
	);
	$effect(() => {
		skipped = skippedRatings();
	});
	$effect(() => {
		if (!INBOX.loaded) return;
		void doneKey;
		void fetchPendingRatings().then((r) => (pending = r));
	});
	function skip(p: PendingRating) {
		skipRating(p.room_id);
		skipped = new Set([...skipped, p.room_id]);
	}
	async function sendRate(p: PendingRating, score: Score, reasons: Reason[]) {
		try {
			const r = await ratePartner(p.room_id, score, reasons);
			if (r === 'ok' || r === 'already') return true;
			toast('이 대화는 평가할 수 없어요');
		} catch {
			toast('연결을 확인해 주세요');
			return false;
		}
		pending = pending.filter((x) => x.room_id !== p.room_id);
		return false;
	}
	function rateClosed(p: PendingRating, how: 'sent' | 'skip') {
		if (how === 'skip') skip(p);
		else pending = pending.filter((x) => x.room_id !== p.room_id);
	}
</script>

{#if toRate && !paused}
	{#key toRate.room_id}
		{@const p = toRate}
		<RateModal {p} onsubmit={(s, r) => sendRate(p, s, r)} onclose={(how) => rateClosed(p, how)} />
	{/key}
{/if}
