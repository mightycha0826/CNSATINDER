<script lang="ts" module>
	/**
	 * 익명 아바타 (Phase 40 다시 그림) — 이름으로 뽑은 그라데이션 구슬. 글자는 넣지 않는다.
	 * 사진이 없는 앱이라 이름만으로 사람을 구분한다: 같은 이름 = 같은 구슬, 이름이 바뀌면 구슬도 바뀐다
	 * (방·편지마다 이름이 바뀌므로 "매번 새로운 사람"이라는 신호).
	 *   색: 이름에 색 낱말이 있으면 그 색 계열(노란 · 파란/푸른 · 초록 · 보라 · 하얀 · 까만 · 붉은), 없으면 이름 해시로 고른 팔레트
	 *   모양: 팔레트의 네 색을 비스듬한 바탕 + 빛 번짐 세 개(자리 · 크기도 해시로)로 겹친 메시 그라데이션 + 위쪽 빛 반사
	 * online 이면 오른쪽 아래 초록 점.
	 */
	type Palette = [string, string, string, string];
	const PALETTES: Palette[] = [
		['#ff7a59', '#ff3d7f', '#ffc15e', '#ff9ecf'], // 노을
		['#ffb199', '#ff6f91', '#ffd6a5', '#ff9671'], // 복숭아
		['#e0457b', '#8e2de2', '#ff8fab', '#c77dff'], // 베리
		['#b388ff', '#7c4dff', '#ffc2e2', '#8fd3ff'], // 라일락
		['#3a8dff', '#00c6ff', '#8e7dff', '#9ff3ff'], // 바다
		['#12c2c9', '#2f80ed', '#a8ffce', '#6dd5ed'], // 석호
		['#3ddc97', '#12b8a6', '#c6f6a4', '#7fe7ff'], // 민트
		['#a8e063', '#2fc58b', '#fff27a', '#5ee3c1'], // 라임
		['#ffd86b', '#ff9f43', '#fff3a3', '#ffb3c1'], // 레몬
		['#ff6b6b', '#ffa94d', '#ffd3b6', '#f06595'], // 산호
		['#5f5bd8', '#c850c0', '#ffcc70', '#7f7fd5'] // 저녁
	];
	// 이름에 든 색 낱말 → 그 색 계열 (서버의 이름 낱말 목록: 노란 · 파란 · 초록 · 보라 · 하얀 · 까만 · 붉은)
	const WORDS: [string, Palette][] = [
		['노란', PALETTES[8]],
		['파란', PALETTES[4]],
		['푸른', PALETTES[4]],
		['초록', PALETTES[6]],
		['보라', PALETTES[3]],
		['하얀', ['#dcd6f2', '#b9c8f5', '#ffffff', '#f7d6f4']],
		['까만', ['#232a4d', '#4b2a6b', '#6b5bd6', '#1e90a8']],
		['붉은', ['#ff4d5a', '#c9184a', '#ff8a5b', '#ff9ebb']]
	];

	/** FNV-1a — 비슷한 이름도 멀리 흩어지게 */
	function hash(s: string) {
		let h = 0x811c9dc5;
		for (const ch of s) {
			h ^= ch.codePointAt(0)!;
			h = Math.imul(h, 0x01000193) >>> 0;
		}
		return h;
	}

	const cache = new Map<string, string>();
	function meshOf(name: string) {
		const hit = cache.get(name);
		if (hit) return hit;
		const h = hash(name);
		const [a, b, c, d] = WORDS.find(([w]) => name.includes(w))?.[1] ?? PALETTES[h % PALETTES.length];
		const bit = (shift: number, mod: number) => (h >>> shift) % mod;
		const angle = bit(4, 360);
		const bg = [
			`radial-gradient(circle at ${12 + bit(8, 30)}% ${10 + bit(11, 30)}%, ${c} 0, transparent ${52 + bit(14, 14)}%)`,
			`radial-gradient(circle at ${62 + bit(17, 30)}% ${58 + bit(20, 32)}%, ${d} 0, transparent ${48 + bit(23, 16)}%)`,
			`radial-gradient(circle at ${bit(26, 2) ? 85 : 15}% ${80 - bit(27, 20)}%, ${b} 0, transparent 55%)`,
			`linear-gradient(${angle}deg, ${a}, ${b})`
		].join(', ');
		cache.set(name, bg);
		return bg;
	}
</script>

<script lang="ts">
	let { name, size = 32, online = false }: { name: string; size?: number; online?: boolean } = $props();
</script>

<span class="av" style:width="{size}px" style:height="{size}px" style:background={meshOf(name)}>
	{#if online}<span class="dot" style:width="{Math.max(10, size * 0.28)}px" style:height="{Math.max(10, size * 0.28)}px"></span>{/if}
</span>

<style>
	.av {
		position: relative;
		flex: none;
		display: block;
		border-radius: 50%;
		/* 구슬 테두리 — 밝은 바탕에서도 윤곽이 보이게 아주 옅은 안쪽 선 + 아래쪽 그늘 */
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.22),
			inset 0 -0.18em 0.5em rgb(40 0 40 / 0.1);
		font-size: 10px;
	}
	/* 위쪽 빛 반사 — 유리 구슬처럼 */
	.av::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: radial-gradient(60% 45% at 32% 22%, rgb(255 255 255 / 0.42), transparent 70%);
		pointer-events: none;
	}
	.dot {
		position: absolute;
		z-index: 1;
		right: -1px;
		bottom: -1px;
		border-radius: 50%;
		background: #3ec70b;
		border: 2px solid var(--bg);
	}
</style>
