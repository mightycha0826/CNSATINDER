<script lang="ts">
	import { ACTION_LABEL as LABEL, fmtTime, shortId } from '$lib/adminTypes';
	import type { PageData } from './$types';

	type AuditRow = PageData['log'][number];

	let { data } = $props();

	/** 열람·검색 계열 — 표에서 눈에 띄게 */
	const VIEW = new Set(['view_identity', 'search_email', 'view_room', 'view_letter_authors', 'view_user_letters']);
	const SETTING: Record<string, string> = {
		is_open: '서비스',
		notice: '공지',
		room_minutes: '대화 시간',
		extend_minutes: '연장 시간',
		vote_window_sec: '연장 질문',
		max_rounds: '연장 상한',
		rematch_cooldown_days: '재매칭 금지',
		auto_suspend_reports: '자동 정지 기준',
		max_open_rooms: '동시 대화'
	};

	/** 편지 번호 — 예전 기록은 letter_id, 요즘 기록은 letter 로 남아 있다 */
	const letterOf = (d: Record<string, unknown>) => (d.letter ?? d.letter_id) as number | undefined;

	function detail(a: AuditRow) {
		const d = a.detail ?? {};
		const parts: string[] = [];
		if (a.action === 'update_settings') {
			for (const [k, v] of Object.entries(d)) {
				if (!SETTING[k]) continue;
				parts.push(k === 'is_open' ? (v ? '서비스 열기' : '서비스 닫기') : `${SETTING[k]} ${k === 'notice' ? `"${v}"` : v}`);
			}
			return parts.join(' · ');
		}
		if (a.action === 'roster_import') return `${d.grade}학년 ${d.count}명`;
		if (a.action === 'remove_comment' && d.comment_id) parts.push(`댓글 #${d.comment_id}`);
		if (d.days) parts.push(`${d.days}일`);
		if (d.note) parts.push(String(d.note));
		if (d.distinct_reporters) parts.push(`신고자 ${d.distinct_reporters}명`);
		if (Array.isArray(d.users)) parts.push(`${d.users.length}명 ${d.via === 'label' ? '학번·이름' : '이메일'}`);
		if (d.query) parts.push(`"${d.query}"`);
		return parts.join(' · ');
	}
</script>

<header class="a-head">
	<div>
		<h1 class="a-h1">활동 기록</h1>
		<p class="a-sub">운영진의 모든 조치와 열람(이메일·학번·이름·대화·편지 작성자)이 여기에 남습니다. 지울 수 없음. 최근 200건.</p>
	</div>
</header>

<div class="a-scroll">
	<table class="a-table">
		<thead>
			<tr><th>시각</th><th>누가</th><th>무엇을</th><th>대상</th><th>내용</th></tr>
		</thead>
		<tbody>
			{#each data.log as a (a.id)}
				<tr class:identity={VIEW.has(a.action)}>
					<td class="num muted">{fmtTime(a.created_at)}</td>
					<td class="mono">
						{#if a.staff_id}<a href="/admin/users/{a.staff_id}">{shortId(a.staff_id)}</a>{:else}시스템{/if}
					</td>
					<td class="act">{LABEL[a.action] ?? a.action}</td>
					<td class="mono">
						{#if a.detail?.room}<a href="/admin/rooms/{a.detail.room}">대화 {shortId(String(a.detail.room))}</a>
						{:else if letterOf(a.detail)}<a href="/admin/posts/{letterOf(a.detail)}">편지 #{letterOf(a.detail)}</a>
						{:else if a.target_user}<a href="/admin/users/{a.target_user}">{shortId(a.target_user)}</a>
						{:else if a.report_id}<a href="/admin/{a.action.includes('letter') ? 'letters' : 'reports'}/{a.report_id}">신고 {shortId(a.report_id)}</a>
						{:else}—{/if}
					</td>
					<td class="d">{detail(a)}</td>
				</tr>
			{:else}
				<tr><td colspan="5" class="a-empty">아직 기록이 없어요.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
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
</style>
