<script lang="ts">
	import { page } from '$app/state';
	import LegalDocument from '$lib/ui/LegalDocument.svelte';
	import { LEGAL, type LegalId } from '$lib/legal';
	const doc = $derived(LEGAL[page.params.doc as LegalId]);
</script>

<svelte:head><title>{doc?.title ?? '약관 및 정책'} · Landy</title></svelte:head>
<div class="topbar"><a href="/install">← Landy</a><span class="title">약관 및 정책</span></div>
<LegalDocument {doc} />
