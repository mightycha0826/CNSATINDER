<script lang="ts">
	/** 익명 이름 옆 "(학번 이름)" — 관리자에게만 값이 온다 */
	let { label }: { label?: string } = $props();
</script>

{#if label}<span class="rname sid">({label})</span>{/if}
