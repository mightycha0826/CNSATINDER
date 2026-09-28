<script lang="ts">
	/**
	 * 당겨서 새로고침 (Phase 37) — 탭 첫 화면(익명편지 · 채팅 · 프로필) 맨 위에서 아래로 당겼다 놓으면 앱을 다시 불러온다.
	 * 설치한 앱(홈 화면 앱)에는 브라우저의 새로고침 단추가 없어서, 인스타처럼 당기는 몸짓으로 대신한다.
	 * 머리글 아래에서 동그라미가 따라 내려오고, 충분히 당기면 화살표가 돌아 색이 차고, 놓으면 돌면서 새로 불러온다.
	 * 다시 불러오면 서비스워커도 새 버전을 확인한다 (화면은 네트워크 먼저라 최신을 받는다).
	 * 창(시트 · 모달)이 떠 있거나 두 손가락이면 움직이지 않는다.
	 */
	import { reloadApp } from '$lib/reload';

	const MAX = 120; // 당길 수 있는 최대 거리 (px)
	const GO = 72; // 이만큼 당기면 놓았을 때 새로고침

	let pull = $state(0);
	let busy = $state(false);
	let dragging = $state(false);
	const ready = $derived(pull >= GO);

	$effect(() => {
		let y0 = 0;
		let x0 = 0;
		let armed = false; // 맨 위에서 시작한 한 손가락 터치
		let locked: 'y' | 'x' | null = null;

		const blocked = () => !!document.querySelector('[aria-modal="true"], dialog[open]');
		const start = (e: TouchEvent) => {
			if (busy || e.touches.length !== 1 || window.scrollY > 0 || blocked()) return;
			const t = e.touches[0];
			y0 = t.clientY;
			x0 = t.clientX;
			armed = true;
			locked = null;
		};
		const move = (e: TouchEvent) => {
			if (!armed) return;
			if (e.touches.length !== 1) return end();
			const t = e.touches[0];
			const dy = t.clientY - y0;
			const dx = t.clientX - x0;
			if (!locked && Math.abs(dy) + Math.abs(dx) > 8) locked = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
			if (locked !== 'y' || dy <= 0 || window.scrollY > 0) {
				if (locked === 'x' || window.scrollY > 0) armed = false;
				pull = 0;
				dragging = false;
				return;
			}
			dragging = true;
			// 당길수록 무거워진다 (고무줄)
			const next = Math.min(MAX, dy * 0.55 - (dy * dy) / 9000);
			if (next >= GO && pull < GO) navigator.vibrate?.(8);
			pull = Math.max(0, next);
		};
		const end = () => {
			if (!armed) return;
			armed = false;
			dragging = false;
			if (pull >= GO) {
				busy = true;
				pull = GO;
				void reloadApp();
			} else pull = 0;
		};

		window.addEventListener('touchstart', start, { passive: true });
		window.addEventListener('touchmove', move, { passive: true });
		window.addEventListener('touchend', end);
		window.addEventListener('touchcancel', end);
		return () => {
			window.removeEventListener('touchstart', start);
			window.removeEventListener('touchmove', move);
			window.removeEventListener('touchend', end);
			window.removeEventListener('touchcancel', end);
		};
	});
</script>

<div
	class="ptr"
	class:dragging
	class:ready
	class:busy
	style:--pull="{pull}px"
	style:--p={Math.min(1, pull / GO)}
	style:--o={Math.min(1, pull / 40)}
	style:--turn="{Math.min(1, pull / GO) * 270}deg"
	role="status"
	aria-live="polite"
	aria-label={busy ? '새로고침 중' : ''}
>
	<span class="ring">
		{#if busy}
			<svg class="spin" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="36 60" />
			</svg>
		{:else}
			<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true">
				<path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
				<path d="M17.6 3.6v4.2h-4.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		{/if}
	</span>
</div>

<style>
	.ptr {
		position: fixed;
		left: 50%;
		top: calc(var(--safe-top) + var(--header-h) - 44px);
		z-index: 30;
		pointer-events: none;
		transform: translate(-50%, var(--pull)) scale(calc(0.6 + var(--p) * 0.4));
		opacity: var(--o);
		transition:
			transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.2),
			opacity 0.2s;
	}
	.ptr.dragging {
		transition: none;
	}
	.ring {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--surface);
		color: var(--text-2);
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.08),
			0 6px 18px -6px rgb(0 0 0 / 0.3);
		transition:
			color 0.2s,
			background 0.2s;
	}
	.ready .ring,
	.busy .ring {
		color: var(--accent);
	}
	svg {
		width: 22px;
		height: 22px;
	}
	.arrow {
		transform: rotate(var(--turn));
	}
	.spin {
		animation: ptr-spin 0.8s linear infinite;
	}
	@keyframes ptr-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
