<script lang="ts">
	import { CLOSE_LABEL, fmtTime } from '$lib/adminTypes';
	import Sid from '$lib/admin/Sid.svelte';

	let { data } = $props();

	// ── 대화 백업 (CSV) — 서버에서 지워지기 전에. 조각(5,000줄)으로 받아 한 파일로 ──
	const kstDay = (offsetDays = 0) =>
		new Date(Date.now() + 9 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
	let from = $state(kstDay(-1));
	let to = $state(kstDay(0));
	let busy = $state(false);
	let progress = $state('');

	const HEADER = '메시지번호,대화방,방 상태,자리,보낸 사람(방 안 익명 이름),보낸 시각(한국),내용,답장 대상';

	async function backup() {
		if (busy) return;
		if (!confirm(`${from} ~ ${to} 의 대화를 내려받을까요?\n내려받은 기록이 남습니다. 파일은 안전하게 보관하고 공유하지 마세요.`)) return;
		busy = true;
		progress = '받는 중…';
		const parts: string[] = [];
		let after = 0;
		let total = 0;
		try {
			for (;;) {
				const res = await fetch(`/admin/rooms/export?from=${from}&to=${to}&after=${after}`);
				if (!res.ok) throw new Error(await res.text());
				const c = (await res.json()) as { csv: string; last_id: number | null; count: number };
				if (!c.count) break;
				parts.push(c.csv);
				total += c.count;
				progress = `${total.toLocaleString()}줄 받는 중…`;
				if (c.count < 5000 || c.last_id == null) break;
				after = c.last_id;
			}
			// 엑셀이 한글을 깨뜨리지 않게 UTF-8 BOM
			const blob = new Blob(['\ufeff' + [HEADER, ...parts].join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `cnsatinder-chats-${from}_${to}.csv`; // 한글 파일 이름은 일부 브라우저가 "download" 로 바꿔 버린다
			document.body.append(a); // 문서에 붙어 있어야 브라우저가 파일 이름(download)을 따른다
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
			progress = total ? `${total.toLocaleString()}줄 내려받음` : '그 기간에 남아 있는 대화가 없어요';
		} catch {
			progress = '받지 못했어요. 잠시 후 다시 해 주세요';
		} finally {
			busy = false;
		}
	}
</script>

<header class="a-head">
	<div>
		<h1 class="a-h1">전체 대화</h1>
		<p class="a-sub">대화를 열면 활동 기록에 남습니다. 끝난 대화 내용은 24시간 뒤 서버에서 지워집니다.</p>
	</div>
</header>

<section class="backup a-card">
	<h2 class="a-h2">대화 백업 (CSV)</h2>
	<p class="a-hint first">
		서버의 대화는 방이 닫히고 24시간 뒤(매일 새벽 4시 17분) 지워집니다. 그 전에 파일로 받아 둘 수 있어요 — 하루에 한 번 받으면 빠짐없이 남습니다.
		파일에는 방 번호 · 방 안 익명 이름 · 시각 · 내용만 있고 계정 정보(이메일)는 없습니다. <b>내려받을 때마다 활동 기록에 남습니다.</b>
		학생들에게는 "24시간 뒤 지워진다"고 안내하고 있으니, 백업을 한다면 개인정보 처리방침과 학교 승인이 필요합니다.
	</p>
	<div class="row">
		<label>보낸 날짜 <input class="field" type="date" bind:value={from} max={to} /></label>
		<span>~</span>
		<label><input class="field" type="date" bind:value={to} min={from} /></label>
		<button class="btn" onclick={backup} disabled={busy || !from || !to}>{busy ? '받는 중…' : 'CSV 내려받기'}</button>
		{#if progress}<span class="muted" role="status">{progress}</span>{/if}
	</div>
</section>

<nav class="a-tabs">
	<a href="?filter=live" class:on={data.filter === 'live'}>진행 중</a>
	<a href="?filter=all" class:on={data.filter === 'all'}>최근 전체</a>
</nav>

{#if data.rooms.length === 0}
	<p class="a-empty">{data.filter === 'live' ? '진행 중인 대화 없음' : '대화 없음'}</p>
{:else}
	<table class="a-table">
		<thead>
			<tr><th>시작</th><th>참여자</th><th class="r">메시지</th><th class="r">연장</th><th>상태</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.rooms as r (r.id)}
				<tr>
					<td class="num muted">{fmtTime(r.created_at)}</td>
					<td>
						{#each r.members ?? [] as m, i (m.seat)}
							{#if i > 0}<span class="muted"> · </span>{/if}
							<a href="/admin/users/{m.user_id}">{m.nickname ?? m.user_id.slice(0, 8)}</a><Sid label={data.students[m.user_id]} />
						{/each}
					</td>
					<td class="r num">{r.message_count}</td>
					<td class="r num muted">{r.round - 1}</td>
					<td>
						{#if r.live}<span class="pill acc">{r.status === 'pending' ? '입장 대기' : '진행 중'}</span>
						{:else}<span class="muted">{CLOSE_LABEL[r.close_reason ?? ''] ?? '종료'}</span>{/if}
					</td>
					<td class="r"><a class="open" href="/admin/rooms/{r.id}">열기 →</a></td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.backup {
		max-width: 900px;
		margin-bottom: 20px;
	}
	.backup .first {
		margin-top: 0;
	}
	.backup .row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.backup .field {
		width: auto;
	}
	.backup .btn {
		width: auto;
		padding: 0 16px;
	}
	.open {
		color: var(--accent) !important;
		font-weight: 600;
		font-size: 13px;
		white-space: nowrap;
	}
</style>
