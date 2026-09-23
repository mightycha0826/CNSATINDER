<script lang="ts">
	import { page } from '$app/state';

	const title = $derived(
		page.status === 403 ? '권한 없음' : page.status === 404 ? '찾을 수 없음' : '문제가 생겼어요'
	);
</script>

<header class="a-head">
	<div>
		<h1 class="a-h1">{title}</h1>
		<p class="a-sub">{page.status}</p>
	</div>
</header>

<p class={page.status >= 500 ? 'a-err' : 'a-warn'}>{page.error?.message ?? '알 수 없는 오류'}</p>
{#if page.status >= 500}
	<p class="a-hint">
		잠시 뒤 다시 시도해 주세요. 계속되면 괄호 안 번호를 알려 주세요 — 서버 기록에서 원인을 찾을 수 있어요.
		<br />DB 를 고친 직후라면 Supabase SQL Editor 에서 <code>schema.sql</code> 을 다시 실행했는지 확인해 주세요.
	</p>
{/if}
<p class="a-links"><a href="/admin">← 운영 첫 화면으로</a></p>
