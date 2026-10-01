<script lang="ts">
	import UserDetail from './UserDetail.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

{#key data.d.profile.id}
	<UserDetail {data} {form} />
{/key}
