<script lang="ts">
	/**
	 * 익명 아바타 — 이름 해시로 뽑은 단색 원 + 첫 글자.
	 * 사진이 없는 앱이라 이름만으로 사람을 구분한다. online 이면 오른쪽 아래 초록 점.
	 */
	import { avatarColor, avatarInitial } from './avatar';

	let { name, size = 32, online = false }: { name: string; size?: number; online?: boolean } = $props();
</script>

<span
	class="av"
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{Math.round(size * 0.44)}px"
	style:background={avatarColor(name)}
>
	{avatarInitial(name)}
	{#if online}<span class="dot" style:width="{Math.max(10, size * 0.28)}px" style:height="{Math.max(10, size * 0.28)}px"></span>{/if}
</span>

<style>
	.av {
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: #fff;
		font-weight: 600;
		line-height: 1;
	}
	.dot {
		position: absolute;
		right: -1px;
		bottom: -1px;
		border-radius: 50%;
		background: #3ec70b;
		border: 2px solid var(--bg);
	}
</style>
