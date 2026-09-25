<script lang="ts">
	/**
	 * 답장 말풍선 위의 인용 — "↩ 새벽수달의 메시지에 답장" + 원래 메시지 흐리게 두 줄.
	 * 누르면 원래 메시지로 스크롤한다. 원래 메시지를 못 찾으면(아직 안 불러옴) text 가 null.
	 */
	let { label, text, mine, onclick }: { label: string; text: string | null; mine: boolean; onclick: () => void } =
		$props();
</script>

<button class="quote" class:mine {onclick}>
	<span class="label">↩ {label}</span>
	<span class="text" class:gone={text == null}>{text ?? '원래 메시지를 불러오지 못함'}</span>
</button>

<style>
	.quote {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		max-width: 100%;
		margin-bottom: 4px; /* 답장 말풍선과 겹치지 않게 틈을 둔다 */
		text-align: left;
	}
	.quote.mine {
		align-items: flex-end;
		margin-left: auto;
	}
	.label {
		padding: 0 4px;
		font-size: 11px;
		color: var(--text-2);
	}
	.text {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		max-width: 100%;
		padding: 6px 11px;
		border-radius: 14px;
		background: var(--field);
		color: var(--text-2);
		font-size: 13px;
		line-height: 1.35;
		opacity: 0.8;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.text.gone {
		font-style: italic;
	}
</style>
