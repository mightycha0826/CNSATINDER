<script lang="ts">
	/**
	 * 새 편지 (Phase 32) — 1) 받을 학생을 이름으로 찾고 → 2) 봉투를 열어 편지지에 쓰고 → 봉투에 담아 보낸다 (EnvelopeCompose).
	 * 받는 사람에게 나는 "익명의 ○학생"(성별만) 또는 내가 적은 서명으로만 보인다 (Phase 35). 받기를 끈 사람 · 차단한 사이는 검색에 나오지 않는다.
	 * 찾기 결과에는 학년 · 학번 — 같은 학년 동명이인을 구분한다.
	 */
	import BackButton from '$lib/ui/BackButton.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import EnvelopeCompose from '$lib/letters/EnvelopeCompose.svelte';
	import type { LetterFmt } from '$lib/letters/rich';
	import { anonName, searchPeople, sendLetter, type DmPerson } from '$lib/letters/api';
	import { afterSent, deliver } from '$lib/letters/send';
	import { S, errMsg, toast } from '$lib/state.svelte';

	let q = $state('');
	let results = $state<DmPerson[] | null>(null);
	let searching = $state(false);
	let to = $state<DmPerson | null>(null);

	$effect(() => {
		const term = q.trim();
		if (term.length < 2) {
			results = null;
			return;
		}
		searching = true;
		const t = setTimeout(async () => {
			try {
				const r = await searchPeople(term);
				if (q.trim() === term) results = r;
			} catch (e) {
				toast(errMsg(e));
			} finally {
				searching = false;
			}
		}, 250);
		return () => clearTimeout(t);
	});

	// 폰 키보드 내리기 — 찾기 칸이 화면에서 사라져도 키보드는 저절로 내려가지 않는다(아이폰). 고르거나 "검색"을 누르면 직접 내린다
	const hideKeyboard = () => (document.activeElement as HTMLElement | null)?.blur?.();
	function pick(p: DmPerson) {
		hideKeyboard();
		to = p;
	}

	const send = (body: string, fmt: LetterFmt | null, nick: string | null) => (to ? deliver(() => sendLetter(to!.id, body, fmt, nick)) : Promise.resolve(false));
</script>

<div class="topbar">
	{#if to}
		<BackButton onclick={() => (to = null)} label="받는 사람 다시 고르기" />
	{:else}
		<BackButton href="/letters" history />
	{/if}
	<span class="title">{to ? '편지 쓰기' : '누구에게 보낼까요?'}</span>
</div>

{#if to}
	<EnvelopeCompose
		to={to.name}
		toSub={to.grade ? `${to.grade}학년` : ''}
		from={anonName(S.profile?.gender)}
		nickable
		placeholder={`${to.name}님에게 하고 싶은 말을 적어 보세요.`}
		onsend={send}
		ondone={() => afterSent('편지를 보냈어요')}
	/>
{:else}
	<div class="page pick">
		<label class="search">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8" />
				<path d="M16 16l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
			</svg>
			<input
				type="search"
				bind:value={q}
				placeholder="받을 학생 이름"
				aria-label="편지 받을 학생 찾기"
				autocomplete="off"
				enterkeyhint="search"
				onkeydown={(e) => e.key === 'Enter' && !e.isComposing && hideKeyboard()}
			/>
		</label>

		{#if results === null}
			<div class="empty">
				<span class="big" aria-hidden="true">✉️</span>
				<p>이름을 두 글자 이상 적어 주세요</p>
			</div>
		{:else if results.length === 0}
			<p class="muted center">{searching ? '찾는 중…' : '찾는 사람이 없어요'}</p>
		{:else}
			<ul class="people">
				{#each results as p (p.id)}
					<li>
						<button class="person" onclick={() => pick(p)}>
							<Avatar name={p.name} size={44} />
							<span class="who">
								<b>{p.name}</b>
								<small class="muted">{[p.grade ? `${p.grade}학년` : '', p.no ? `학번 ${p.no}` : '', p.checked ? '' : '직접 적은 이름'].filter(Boolean).join(' · ')}</small>
							</span>
							<span class="go">편지 쓰기</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<style>
	.pick {
		gap: 10px;
		padding-top: 12px;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 46px;
		padding: 0 14px;
		border-radius: 14px;
		background: var(--field);
		color: var(--text-2);
	}
	.search svg {
		flex: none;
		width: 18px;
		height: 18px;
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: none;
		background: none;
		color: var(--text);
		font-size: 16px;
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		margin-top: 48px;
		color: var(--text-2);
		font-size: 14px;
	}
	.empty p {
		margin: 0;
	}
	.big {
		font-size: 44px;
	}
	.center {
		margin: 32px 0;
		text-align: center;
		font-size: 14px;
	}
	.people {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.person:active {
		background: var(--field);
	}
	.person {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 10px 2px;
		text-align: left;
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.who b {
		font-size: 15px;
		font-weight: 600;
	}
	.who small {
		font-size: 12px;
	}
	.go {
		flex: none;
		padding: 8px 14px;
		border-radius: 999px;
		background: var(--accent-fill-deep);
		color: var(--on-accent);
		font-size: 13px;
		font-weight: 700;
	}
</style>
