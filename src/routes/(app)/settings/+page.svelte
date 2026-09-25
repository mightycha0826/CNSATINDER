<script lang="ts">
	/**
	 * 설정 — 상단 바 오른쪽 톱니를 누르면 오는 화면.
	 * 채팅 색상: 내 말풍선 색을 고른다. 이 기기에만 저장되고 상대 화면은 그대로다 (lib/chatColor.svelte.ts).
	 */
	import { CHAT_COLOR, CHAT_COLORS, setChatColor } from '$lib/chatColor.svelte';
	import BackButton from '$lib/ui/BackButton.svelte';
</script>

<div class="topbar">
	<BackButton href="/" history />
	<span class="title">설정</span>
</div>

<div class="page settings">
	<section aria-labelledby="chat-color">
		<h2 id="chat-color">채팅 색상</h2>
		<p class="muted small">내 말풍선 색이에요. 이 기기에서만 바뀌고, 상대에게는 원래 색으로 보여요.</p>

		<!-- 미리보기 — 고르는 즉시 바뀐다 -->
		<div class="preview" aria-hidden="true">
			<div class="row"><span class="bubble other">오늘 급식 뭐였어?</span></div>
			<div class="row mine"><span class="bubble">카레! 맛있었어</span></div>
			<div class="row mine"><span class="bubble">너는 뭐 먹었어?</span></div>
		</div>

		<div class="swatches" role="radiogroup" aria-labelledby="chat-color">
			{#each CHAT_COLORS as c (c.id)}
				<label class="swatch" class:on={CHAT_COLOR.id === c.id}>
					<input
						type="radio"
						name="chat-color"
						value={c.id}
						checked={CHAT_COLOR.id === c.id}
						onchange={() => setChatColor(c.id)}
					/>
					<span class="dot" style:background={c.fill}></span>
					<span class="name">{c.label}</span>
				</label>
			{/each}
		</div>
	</section>
</div>

<style>
	.settings {
		gap: 28px;
		padding-top: 20px;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}
	.small {
		margin: 0;
		font-size: 12px;
	}
	.preview {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 12px;
		border: 1px solid var(--line);
		border-radius: 16px;
	}
	.row {
		display: flex;
	}
	.row.mine {
		justify-content: flex-end;
	}
	.row + .row:not(.mine),
	.row:not(.mine) + .row.mine {
		margin-top: 6px;
	}
	.bubble {
		max-width: 78%;
		padding: 8px 13px;
		border-radius: var(--r-bubble);
		background: var(--bubble-fill);
		color: var(--on-accent);
		font-size: 15px;
		line-height: 1.38;
	}
	.bubble.other {
		background: var(--field);
		color: var(--text);
	}
	.swatches {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr)); /* 폰 한 줄에 여섯 개 */
		gap: 12px 8px;
		margin-top: 4px;
	}
	.swatch {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		font-size: 12px;
		color: var(--text-2);
	}
	.swatch input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.dot {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		/* 고른 색은 바깥에 테두리 한 겹 — 바탕색 틈을 두고 */
		box-shadow:
			0 0 0 3px var(--bg),
			0 0 0 4px transparent;
	}
	.swatch.on .dot {
		box-shadow:
			0 0 0 3px var(--bg),
			0 0 0 5px var(--text);
	}
	.swatch.on .name {
		color: var(--text);
		font-weight: 600;
	}
	.swatch input:focus-visible + .dot {
		outline: 2px solid var(--accent);
		outline-offset: 6px;
	}
</style>
