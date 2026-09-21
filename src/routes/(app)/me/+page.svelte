<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { S, errMsg, loadProfile, signOut, toast } from '$lib/state.svelte';

	let busy = $state(false);

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
			toast('바꿨어요');
		} catch (e) {
			toast(errMsg(e));
		} finally {
			busy = false;
		}
	}

	async function out() {
		await signOut();
		void goto('/login', { replaceState: true });
	}
</script>

<div class="topbar">
	<button class="back" onclick={() => goto('/')} aria-label="뒤로">
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M15 19l-7-7 7-7"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>
	<span class="title">설정</span>
</div>

<div class="page me">
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

	<div class="rows">
		<div class="row"><span class="muted">학교 인증</span><span>{S.profile?.verified ? '완료' : '미완료'}</span></div>
		<div class="row"><span class="muted">계정 상태</span><span>{S.profile?.status === 'active' ? '정상' : '제한됨'}</span></div>
	</div>

	<p class="privacy muted">
		이 앱은 이름·학번을 저장하지 않아요. 학교 이메일은 본인 확인에만 쓰이고,
		신고가 접수됐을 때 운영진만 확인할 수 있어요. 대화 내용은 방이 닫히면 보이지 않고,
		24시간 뒤 서버에서도 지워집니다.
	</p>

	<div class="foot">
		<button class="btn-ghost" onclick={out}>로그아웃</button>
	</div>
</div>

<style>
	.back {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		margin-left: -4px;
	}
	.back svg {
		width: 24px;
		height: 24px;
	}

	.me {
		gap: 26px;
		padding-top: 20px;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
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
	.opt.on {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 600;
	}

	.rows {
		display: flex;
		flex-direction: column;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		height: 48px;
		border-top: 1px solid var(--line);
		font-size: 14px;
	}
	.row:last-child {
		border-bottom: 1px solid var(--line);
	}

	.privacy {
		margin: 0;
		font-size: 12px;
		line-height: 1.75;
	}

	.foot {
		margin-top: auto;
	}
</style>
