<script lang="ts">
	import { setLetterLike } from './api';
	import { errMsg, toast } from '../state.svelte';

	/**
	 * 편지 하트. 누르면 화면을 먼저 바꾸고(낙관적) 서버 결과로 맞춘다.
	 * 빠르게 여러 번 눌러도 마지막 요청의 결과만 반영한다.
	 */
	let {
		id,
		liked,
		count,
		onchange
	}: { id: number; liked: boolean; count: number; onchange: (liked: boolean, count: number) => void } = $props();

	let seq = 0;
	let pop = $state(false);

	async function toggle(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const before = { liked, count };
		const want = !liked;
		onchange(want, Math.max(0, count + (want ? 1 : -1)));
		if (want) {
			pop = false;
			requestAnimationFrame(() => (pop = true));
		}
		const my = ++seq;
		try {
			const r = await setLetterLike(id, want);
			if (my !== seq) return;
			if (r.status === 'ok') return onchange(r.liked, r.like_count);
			onchange(before.liked, before.count);
			toast(
				r.status === 'closed'
					? '볼 수 없는 편지'
					: r.status === 'service_closed'
						? '지금은 열려 있지 않아요'
						: '지금은 하트를 누를 수 없는 계정입니다'
			);
		} catch (err) {
			if (my !== seq) return;
			onchange(before.liked, before.count);
			toast(errMsg(err));
		}
	}
</script>

<button class="like" class:on={liked} onclick={toggle} aria-pressed={liked} aria-label={liked ? '하트 취소' : '하트'}>
	<svg class:pop viewBox="0 0 24 24" aria-hidden="true" onanimationend={() => (pop = false)}>
		<path
			d="M12 20.3l-1.2-1.1C6.4 15.2 3.5 12.6 3.5 9.4 3.5 6.8 5.5 4.8 8.1 4.8c1.5 0 2.9.7 3.9 1.8 1-1.1 2.4-1.8 3.9-1.8 2.6 0 4.6 2 4.6 4.6 0 3.2-2.9 5.8-7.3 9.8L12 20.3z"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linejoin="round"
		/>
	</svg>
	<span class="num">{count}</span>
</button>

<style>
	.like {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 32px;
		padding: 0 4px;
		margin-left: -4px;
		font-size: 13px;
		color: inherit;
	}
	svg {
		width: 19px;
		height: 19px;
		fill: none;
	}
	.on {
		color: #ff3b5c;
	}
	.on svg {
		fill: currentColor;
	}
	.pop {
		animation: pop 0.32s ease-out;
	}
	@keyframes pop {
		0% {
			transform: scale(1);
		}
		40% {
			transform: scale(1.3);
		}
		100% {
			transform: scale(1);
		}
	}
</style>
