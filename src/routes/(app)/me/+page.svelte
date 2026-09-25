<script lang="ts">
	import Avatar from '$lib/ui/Avatar.svelte';
	import TopbarMe from '$lib/ui/TopbarMe.svelte';
	import { supabase } from '$lib/supabase';
	import { S, errMsg, loadProfile, saveProfile, toast } from '$lib/state.svelte';

	/**
	 * 내 프로필 (하단 탭 오른쪽) — 상대에게 보이는 소개 · 관심사 · MBTI, 이야기하고 싶은 상대.
	 * 알림 · 비밀번호 · 계정 · 개인정보 안내 · 로그아웃은 설정(/settings)에.
	 * 익명 이름은 고정. 대화 상대에게 보이는 건 이름 + 소개 + 관심사 + MBTI 뿐이다.
	 */

	let busy = $state(false);

	// ── 기본 정보 (상대에게 보이는 것) ──
	const MBTIS = [
		'ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP',
		'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
	];
	let bio = $state(S.profile?.bio ?? '');
	let interests = $state<string[]>([...(S.profile?.interests ?? [])]);
	let mbti = $state<string | null>(S.profile?.mbti ?? null);
	let tagDraft = $state('');

	// 프로필이 늦게 불러와졌으면 한 번 채운다
	let filled = !!S.profile;
	$effect(() => {
		if (filled || !S.profile) return;
		filled = true;
		bio = S.profile.bio;
		interests = [...S.profile.interests];
		mbti = S.profile.mbti;
	});

	const dirty = $derived(
		!!S.profile &&
			(bio.trim() !== S.profile.bio ||
				mbti !== S.profile.mbti ||
				JSON.stringify(interests) !== JSON.stringify(S.profile.interests))
	);

	function addTag() {
		const t = tagDraft.trim().replace(/^#/, '');
		if (!t) return;
		if (t.length > 12) return toast('관심사 하나는 12자까지 담을 수 있어요');
		if (interests.length >= 5) return toast('관심사는 5개까지 담을 수 있어요');
		if (!interests.some((x) => x.toLowerCase() === t.toLowerCase())) interests.push(t);
		tagDraft = '';
	}
	function onTagKey(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ',') && !e.isComposing) {
			e.preventDefault();
			addTag();
		}
	}

	async function saveInfo() {
		if (busy) return;
		busy = true;
		try {
			await saveProfile(bio, interests, mbti);
			toast('저장 완료');
		} catch (e) {
			toast(errMsg(e));
		} finally {
			busy = false;
		}
	}

	// ── 매칭 선호 ──
	const WANTS = [
		{ v: 'm' as const, label: '남자' },
		{ v: 'f' as const, label: '여자' },
		{ v: 'any' as const, label: '상관없어요' }
	];

	async function setWant(want: 'm' | 'f' | 'any') {
		if (busy || S.profile?.want === want) return;
		busy = true;
		try {
			const { error } = await supabase
				.from('profiles')
				.update({ want })
				.eq('id', S.session?.user.id ?? '');
			if (error) throw error;
			await loadProfile();
			toast('변경 완료');
		} catch (e) {
			toast(errMsg(e));
		} finally {
			busy = false;
		}
	}

</script>

<div class="topbar">
	<span class="title">내 프로필</span>
	<TopbarMe />
</div>

<div class="page me">
	{#if S.profile?.nickname}
		<section class="who">
			<Avatar name={S.profile.nickname} size={64} online />
			<div>
				<p class="nick">{S.profile.nickname}</p>
				<p class="muted small">대화 상대에게는 이 이름으로만 보여요 · 바꿀 수 없어요</p>
			</div>
		</section>
	{/if}

	<section>
		<h2>소개</h2>
		<textarea
			class="field area"
			bind:value={bio}
			maxlength="60"
			rows="2"
			placeholder="한 줄로 나를 소개해 주세요 (예: 밴드 음악 좋아해요)"
		></textarea>
		<span class="count muted num">{bio.trim().length}/60</span>

		<h2 class="sub">관심사 <span class="muted">{interests.length}/5</span></h2>
		<div class="tags">
			{#each interests as t, i (t)}
				<button class="tag" onclick={() => interests.splice(i, 1)} aria-label="{t} 지우기">
					{t} <span aria-hidden="true">×</span>
				</button>
			{/each}
			{#if interests.length < 5}
				<input
					class="tag-input"
					bind:value={tagDraft}
					maxlength="12"
					placeholder="+ 추가"
					onkeydown={onTagKey}
					onblur={addTag}
				/>
			{/if}
		</div>

		<h2 class="sub">MBTI</h2>
		<div class="mbti">
			<button class="chip" class:on={mbti === null} onclick={() => (mbti = null)}>안 적을래요</button>
			{#each MBTIS as m (m)}
				<button class="chip" class:on={mbti === m} onclick={() => (mbti = m)}>{m}</button>
			{/each}
		</div>

		<p class="warn muted">
			학번·반·전화번호·SNS 아이디처럼 나를 알 수 있는 내용은 적을 수 없어요.
		</p>
		<button class="btn" onclick={saveInfo} disabled={!dirty || busy}>
			{busy ? '저장 중…' : '저장'}
		</button>
	</section>

	<section>
		<h2>이런 사람과 이야기할래요</h2>
		<div class="opts">
			{#each WANTS as w (w.v)}
				<button class="opt" class:on={S.profile?.want === w.v} onclick={() => setWant(w.v)}>
					{w.label}
				</button>
			{/each}
		</div>
	</section>

</div>

<style>
	.me {
		gap: 28px;
		padding-top: 20px;
		padding-bottom: 24px; /* 아래쪽 안전영역은 탭바가 맡는다 */
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}
	h2.sub {
		margin-top: 8px;
	}
	h2 span {
		font-weight: 400;
		font-size: 13px;
	}
	.small {
		margin: 0;
		font-size: 12px;
	}

	.who {
		flex-direction: row;
		align-items: center;
		gap: 14px;
	}
	.who p {
		margin: 0;
	}
	.nick {
		font-size: 20px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.area {
		height: auto;
		padding: 10px 12px;
		resize: none;
		line-height: 1.5;
	}
	.count {
		align-self: flex-end;
		margin-top: -6px;
		font-size: 12px;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tag {
		height: 32px;
		padding: 0 12px;
		border-radius: 999px;
		background: var(--field);
		font-size: 13px;
	}
	.tag span {
		color: var(--text-2);
		margin-left: 2px;
	}
	.tag-input {
		width: 96px;
		height: 32px;
		padding: 0 12px;
		border: 1px dashed var(--line);
		border-radius: 999px;
		background: none;
		font-size: 13px;
		outline: none;
	}
	.tag-input:focus {
		border-style: solid;
		border-color: var(--text-2);
	}

	.mbti {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		height: 32px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 13px;
	}
	.chip.on {
		border-color: var(--text);
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
	}

	.warn {
		margin: 2px 0 0;
		font-size: 12px;
		line-height: 1.6;
	}

	.opts {
		display: flex;
		gap: 8px;
	}
	.opt {
		flex: 1;
		height: 44px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		font-size: 15px;
		font-weight: 500;
		background: var(--bg);
	}
	/* 선택은 흑백 반전 — 그라디언트는 주 버튼에만 */
	.opt.on {
		border-color: var(--text);
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
	}

</style>
