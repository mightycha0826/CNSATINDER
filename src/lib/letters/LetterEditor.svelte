<script lang="ts">
	import { Editor } from '@tiptap/core';
	import { Fragment, Slice } from '@tiptap/pm/model';
	import { Document } from '@tiptap/extension-document';
	import { Paragraph } from '@tiptap/extension-paragraph';
	import { Text } from '@tiptap/extension-text';
	import { Bold } from '@tiptap/extension-bold';
	import { Italic } from '@tiptap/extension-italic';
	import { Underline } from '@tiptap/extension-underline';
	import { Strike } from '@tiptap/extension-strike';
	import { Highlight } from '@tiptap/extension-highlight';
	import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';
	import { TextAlign } from '@tiptap/extension-text-align';
	import { Placeholder, UndoRedo } from '@tiptap/extensions';
	import { COLOR, COLOR_LABEL, HIGHLIGHT, HIGHLIGHT_LABEL, SIZE, SIZE_LABEL, fromDoc, type LetterFmt } from './rich';

	/**
	 * 편지 서식 편집기 — 굵게·기울임·밑줄·취소선·형광펜·글자색·크기·정렬·되돌리기.
	 * 문단 하나 = 본문 한 줄. 붙여넣기는 글자만 받는다(다른 곳의 서식·색은 버린다).
	 * 결과는 body(순수 텍스트) + fmt(서식 범위)로 내보낸다 — 서버에는 이 둘만 간다.
	 * before · after 를 주면 글 쓰는 칸을 편지지(app.css .letter-paper)로 감싸고 그 위 · 아래에 그린다 (To. · From.)
	 */
	import type { Snippet } from 'svelte';
	let {
		body = $bindable(''),
		fmt = $bindable<LetterFmt | null>(null),
		placeholder = '',
		before,
		after
	}: { body?: string; fmt?: LetterFmt | null; placeholder?: string; before?: Snippet; after?: Snippet } = $props();

	let el: HTMLDivElement | undefined = $state();
	let editor: Editor | null = $state(null);
	let tick = $state(0);
	let panel = $state<'hl' | 'color' | 'size' | null>(null);

	$effect(() => {
		if (!el) return;
		const ed = new Editor({
			element: el,
			extensions: [
				Document,
				Paragraph,
				Text,
				Bold,
				Italic,
				Underline,
				Strike,
				Highlight.configure({ multicolor: true }),
				TextStyle,
				Color,
				FontSize,
				TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right'] }),
				UndoRedo,
				Placeholder.configure({ placeholder })
			],
			autofocus: 'end',
			editorProps: {
				attributes: { class: 'le-doc', role: 'textbox', 'aria-multiline': 'true', 'aria-label': '편지 내용', spellcheck: 'false' },
				// 붙여넣기는 글자만 — 줄마다 문단으로
				handlePaste(view, event) {
					const text = event.clipboardData?.getData('text/plain');
					if (text == null) return false;
					const { schema } = view.state;
					const paras = text
						.replace(/\r\n?/g, '\n')
						.split('\n')
						.map((t) => schema.nodes.paragraph.create(null, t ? schema.text(t) : null));
					view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(paras), 1, 1)).scrollIntoView());
					return true;
				}
			},
			onTransaction: () => tick++,
			onUpdate: ({ editor: e }) => {
				const r = fromDoc(e.getJSON());
				body = r.body;
				fmt = r.fmt;
			}
		});
		editor = ed;
		return () => ed.destroy();
	});

	/** 툴바 상태 — tick 을 읽어야 편집할 때마다 다시 계산된다 */
	function is(name: string | Record<string, unknown>, attrs?: Record<string, unknown>) {
		void tick;
		if (!editor) return false;
		return typeof name === 'string' ? editor.isActive(name, attrs) : editor.isActive(name);
	}
	const cmd = () => editor!.chain().focus();
	function can(what: 'undo' | 'redo') {
		void tick;
		return !!editor && (what === 'undo' ? editor.can().undo() : editor.can().redo());
	}
	const toggle = (p: typeof panel) => (panel = panel === p ? null : p);

	const hlNow = $derived.by(() => {
		void tick;
		return (Object.keys(HIGHLIGHT) as (keyof typeof HIGHLIGHT)[]).find((k) => is('highlight', { color: HIGHLIGHT[k] }));
	});
	const colorNow = $derived.by(() => {
		void tick;
		return (Object.keys(COLOR) as (keyof typeof COLOR)[]).find((k) => is('textStyle', { color: COLOR[k] }));
	});
	const sizeNow = $derived.by(() => {
		void tick;
		const v = editor?.getAttributes('textStyle').fontSize;
		return (Object.keys(SIZE) as (keyof typeof SIZE)[]).find((k) => SIZE[k] === v) ?? 'md';
	});

	/** 툴바를 눌러도 편집 영역의 선택·키보드가 유지되게 */
	const keep = (e: PointerEvent) => e.preventDefault();
</script>

<div class="le">
	<div class="bar" role="toolbar" aria-label="서식">
		<button class="t" class:on={is('bold')} onpointerdown={keep} onclick={() => cmd().toggleBold().run()} aria-label="굵게" title="굵게"><b>B</b></button>
		<button class="t" class:on={is('italic')} onpointerdown={keep} onclick={() => cmd().toggleItalic().run()} aria-label="기울임" title="기울임"><i>I</i></button>
		<button class="t" class:on={is('underline')} onpointerdown={keep} onclick={() => cmd().toggleUnderline().run()} aria-label="밑줄" title="밑줄"><u>U</u></button>
		<button class="t" class:on={is('strike')} onpointerdown={keep} onclick={() => cmd().toggleStrike().run()} aria-label="취소선" title="취소선"><s>S</s></button>
		<span class="sep"></span>
		<button class="t" class:on={panel === 'hl'} onpointerdown={keep} onclick={() => toggle('hl')} aria-label="형광펜" title="형광펜" aria-expanded={panel === 'hl'}>
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.5 4.5l5 5L10 19H5v-5l9.5-9.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
			<span class="swatch" style:background={hlNow ? HIGHLIGHT[hlNow] : HIGHLIGHT.yellow}></span>
		</button>
		<button class="t" class:on={panel === 'color'} onpointerdown={keep} onclick={() => toggle('color')} aria-label="글자색" title="글자색" aria-expanded={panel === 'color'}>
			<span class="ga" style:color={colorNow ? COLOR[colorNow] : null}>가</span>
			<span class="swatch" style:background={colorNow ? COLOR[colorNow] : 'currentColor'}></span>
		</button>
		<button class="t wide" class:on={panel === 'size'} onpointerdown={keep} onclick={() => toggle('size')} aria-label="글자 크기" title="글자 크기" aria-expanded={panel === 'size'}>
			{SIZE_LABEL[sizeNow]}
		</button>
		<span class="sep"></span>
		{#each [['left', '왼쪽 정렬', 'M4 6h16M4 10h10M4 14h16M4 18h10'], ['center', '가운데 정렬', 'M4 6h16M7 10h10M4 14h16M7 18h10'], ['right', '오른쪽 정렬', 'M4 6h16M10 10h10M4 14h16M10 18h10']] as [al, label, d] (al)}
			<button
				class="t"
				class:on={al === 'left' ? !is({ textAlign: 'center' }) && !is({ textAlign: 'right' }) : is({ textAlign: al })}
				onpointerdown={keep}
				onclick={() => (al === 'left' ? cmd().unsetTextAlign().run() : cmd().setTextAlign(al).run())}
				aria-label={label}
				title={label}
			>
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path {d} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
			</button>
		{/each}
		<span class="sep"></span>
		<button class="t" onpointerdown={keep} onclick={() => cmd().undo().run()} disabled={!can('undo')} aria-label="되돌리기" title="되돌리기">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</button>
		<button class="t" onpointerdown={keep} onclick={() => cmd().redo().run()} disabled={!can('redo')} aria-label="다시 하기" title="다시 하기">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 000 11H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</button>
	</div>

	{#if panel}
		<div class="panel" role="group" aria-label={panel === 'hl' ? '형광펜 색' : panel === 'color' ? '글자색' : '글자 크기'}>
			{#if panel === 'hl'}
				{#each Object.entries(HIGHLIGHT) as [k, v] (k)}
					<button class="chip" class:on={hlNow === k} onpointerdown={keep} onclick={() => cmd().setHighlight({ color: v }).run()} aria-label="형광펜 {HIGHLIGHT_LABEL[k as keyof typeof HIGHLIGHT]}">
						<span class="dot" style:background={v}></span>{HIGHLIGHT_LABEL[k as keyof typeof HIGHLIGHT]}
					</button>
				{/each}
				<button class="chip" onpointerdown={keep} onclick={() => cmd().unsetHighlight().run()}>지우기</button>
			{:else if panel === 'color'}
				{#each Object.entries(COLOR) as [k, v] (k)}
					<button class="chip" class:on={colorNow === k} onpointerdown={keep} onclick={() => cmd().setColor(v).run()} aria-label="글자색 {COLOR_LABEL[k as keyof typeof COLOR]}">
						<span class="dot" style:background={v}></span>{COLOR_LABEL[k as keyof typeof COLOR]}
					</button>
				{/each}
				<button class="chip" class:on={!colorNow} onpointerdown={keep} onclick={() => cmd().unsetColor().removeEmptyTextStyle().run()}>기본</button>
			{:else}
				{#each ['sm', 'md', 'lg', 'xl'] as const as k (k)}
					<button
						class="chip"
						class:on={sizeNow === k}
						onpointerdown={keep}
						onclick={() => (k === 'md' ? cmd().unsetFontSize().removeEmptyTextStyle().run() : cmd().setFontSize(SIZE[k]).run())}
						style:font-size={k === 'md' ? null : `calc(13px * ${parseFloat(SIZE[k])})`}
					>
						{SIZE_LABEL[k]}
					</button>
				{/each}
			{/if}
		</div>
	{/if}

	<div class="sheet" class:letter-paper={!!(before || after)}>
		{@render before?.()}
		<div class="area" bind:this={el}></div>
		{@render after?.()}
	</div>
</div>

<style>
	.le {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.bar {
		position: sticky;
		top: calc(var(--header-h) + var(--safe-top)); /* 스크롤해도 머리글 바로 아래에 붙는다 */
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 6px 0;
		overflow-x: auto;
		scrollbar-width: none;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}
	.bar::-webkit-scrollbar {
		display: none;
	}
	.t {
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		min-width: 34px;
		height: 34px;
		padding: 0 6px;
		border-radius: var(--r-sm);
		font-size: 16px;
		color: var(--text);
	}
	.t.wide {
		font-size: 13px;
		font-weight: 600;
	}
	.t.on {
		background: var(--field);
	}
	.t:disabled {
		opacity: 0.3;
	}
	.t svg {
		width: 20px;
		height: 20px;
	}
	.t .ga {
		font-weight: 700;
		line-height: 1;
	}
	.swatch {
		position: absolute;
		left: 9px;
		right: 9px;
		bottom: 4px;
		height: 3px;
		border-radius: 2px;
	}
	.sep {
		flex: none;
		width: 1px;
		height: 18px;
		margin: 0 4px;
		background: var(--line);
	}
	.panel {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 13px;
		color: var(--text);
	}
	.chip.on {
		border-color: var(--text);
		font-weight: 700;
	}
	.chip .dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
	}
	.sheet {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	.sheet.letter-paper {
		margin-top: 12px;
	}
	.sheet.letter-paper .area {
		padding-top: 0;
	}
	.sheet.letter-paper .area :global(.le-doc) {
		min-height: 36dvh;
		line-height: 1.8;
	}
	.area {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding-top: 10px;
	}
	.area :global(.le-doc) {
		flex: 1;
		min-height: 40dvh;
		outline: none;
		font-size: 16px;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.area :global(.le-doc p) {
		margin: 0;
	}
	.area :global(.le-doc p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		height: 0;
		color: var(--text-2);
		pointer-events: none;
		white-space: pre-line;
	}
</style>
