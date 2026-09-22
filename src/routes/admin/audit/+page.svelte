<script lang="ts">
	import { ACTION_LABEL as LABEL } from '$lib/adminTypes';

	let { data } = $props();

	/** 열람·검색 계열 — 표에서 눈에 띄게 */
	const VIEW = new Set(['view_identity', 'search_email', 'view_room', 'view_letter_authors', 'view_user_letters']);
	const fmt = (s: string) =>
		new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	const short = (id: string | null) => (id ? id.slice(0, 6) : '—');
	const detail = (d: Record<string, unknown>) => {
		const parts: string[] = [];
		if (d.days) parts.push(`${d.days}일`);
		if (d.note) parts.push(String(d.note));
		if (d.distinct_reporters) parts.push(`신고자 ${d.distinct_reporters}명`);
		if (Array.isArray(d.users)) parts.push(`${d.users.length}명 이메일`);
		if (d.query) parts.push(`"${d.query}"`);
		if (d.room || d.letter) return parts.join(' · ');
		if (!parts.length && Object.keys(d).length) parts.push(JSON.stringify(d));
		return parts.join(' · ');
	};
</script>

<h1>활동 기록</h1>
<p class="muted lead">
	운영진의 모든 조치와 열람(이메일·대화·편지 작성자)이 여기에 남습니다. 지울 수 없음.
</p>

<table>
	<thead>
		<tr><th>시각</th><th>누가</th><th>무엇을</th><th>대상</th><th>내용</th></tr>
	</thead>
	<tbody>
		{#each data.log as a (a.id)}
			<tr class:identity={VIEW.has(a.action)}>
				<td class="num muted">{fmt(a.created_at)}</td>
				<td class="mono">
					{#if a.staff_id}<a href="/admin/users/{a.staff_id}">{short(a.staff_id)}</a>{:else}시스템{/if}
				</td>
				<td class="act">{LABEL[a.action] ?? a.action}</td>
				<td class="mono">
					{#if a.detail?.room}<a href="/admin/rooms/{a.detail.room}">대화 {short(String(a.detail.room))}</a>
					{:else if a.detail?.letter}<a href="/admin/posts/{a.detail.letter}">편지 #{a.detail.letter}</a>
					{:else if a.target_user}<a href="/admin/users/{a.target_user}">{short(a.target_user)}</a>
					{:else if a.report_id}<a href="/admin/{a.action.includes('letter') || a.action.startsWith('remove_') ? 'letters' : 'reports'}/{a.report_id}">신고 {short(a.report_id)}</a>
					{:else}—{/if}
				</td>
				<td class="d">{detail(a.detail)}</td>
			</tr>
		{:else}
			<tr><td colspan="5" class="muted empty">아직 기록이 없어요.</td></tr>
		{/each}
	</tbody>
</table>

<style>
	h1 {
		margin: 0 0 4px;
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}
	.lead {
		margin: 0 0 16px;
		font-size: 13px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	th {
		padding: 10px 8px;
		text-align: left;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-2);
		border-bottom: 1px solid var(--line);
	}
	td {
		padding: 10px 8px;
		border-bottom: 1px solid var(--line);
	}
	.mono {
		font-family: ui-monospace, 'SF Mono', Consolas, monospace;
		font-size: 13px;
	}
	.act {
		font-weight: 600;
		white-space: nowrap;
	}
	.identity .act {
		color: var(--danger);
	}
	.d {
		color: var(--text-2);
		font-size: 13px;
	}
	.empty {
		text-align: center;
		padding: 32px;
	}
</style>
