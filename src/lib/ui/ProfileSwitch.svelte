<script lang="ts">
	import { onDestroy } from 'svelte';
	import { S, errMsg, setProfileField, toast } from '$lib/state.svelte';
	import { accountIsCurrent, accountToken } from '$lib/accountScope';

	let { field, label, messages, disabled = false }: {
		field: 'allow_rematch' | 'letters_open' | 'letters_recommend';
		label: string;
		messages: readonly [string, string];
		disabled?: boolean;
	} = $props();
	const token = accountToken();
	let alive = true;
	let busy = $state(false);
	const checked = $derived(S.profile?.[field] ?? field !== 'allow_rematch');
	const unavailable = $derived(!S.session || !S.profile || (field !== 'allow_rematch' && S.profile[field] === undefined));
	onDestroy(() => { alive = false; });

	async function change(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const next = input.checked;
		input.checked = checked;
		if (busy || disabled || unavailable) return;
		busy = true;
		try {
			await setProfileField({ [field]: next });
			if (alive && accountIsCurrent(token)) toast(messages[next ? 0 : 1]);
		} catch (error) {
			if (alive && accountIsCurrent(token)) toast(errMsg(error));
		} finally {
			busy = false;
		}
	}
</script>

<label class="g-row">
	<span>{label}</span>
	<input class="switch" type="checkbox" role="switch" {checked} disabled={busy || disabled || unavailable} aria-busy={busy} onchange={change} />
</label>
