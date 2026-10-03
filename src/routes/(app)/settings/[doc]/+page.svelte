<script lang="ts">
	/**
	 * 약관 및 정책 문서 한 편 — /settings/terms · /settings/privacy · /settings/policy (내용은 lib/legal.ts).
	 * 설정 > 약관 및 정책 에서 들어온다. 글은 그대로 보여 준다 (HTML 없음).
	 */
	import { page } from '$app/state';
	import LegalDocument from '$lib/ui/LegalDocument.svelte';
	import BackButton from '$lib/ui/BackButton.svelte';
	import { LEGAL, LEGAL_IDS, type LegalId } from '$lib/legal';

	const doc = $derived(LEGAL_IDS.includes(page.params.doc as LegalId) ? LEGAL[page.params.doc as LegalId] : null);
</script>

<div class="topbar">
	<BackButton href="/settings" history />
	<span class="title">{doc?.title ?? '약관 및 정책'}</span>
</div>

<LegalDocument {doc} />
