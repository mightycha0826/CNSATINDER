<script lang="ts">
	/**
	 * 운영자 로그인. 학교 계정으로 Supabase 인증 → 토큰을 서버에 보내 운영진 여부를 확인받는다.
	 * 확인이 끝나면 이 브라우저의 학생용 세션은 지운다 (서버 서명 쿠키만 남는다).
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { supabase, hasSupabase } from '$lib/supabase';
	import { SCHOOL_DOMAIN, errMsg, sendOtp, verifyOtp } from '$lib/state.svelte';

	const setup = page.url.searchParams.get('setup');

	let step: 'email' | 'code' = $state('email');
	let local = $state('');
	let email = $state('');
	let code = $state('');
	let devEmail = $state('');
	let devPw = $state('');
	let busy = $state(false);
	let msg = $state<string | null>(setup);

	async function confirmStaff() {
		const { data } = await supabase.auth.getSession();
		const token = data.session?.access_token;
		if (!token) throw new Error('로그인 세션이 없습니다');
		const res = await fetch('/admin/session', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token })
		});
		// 확인 결과와 관계없이 학생용 세션은 남기지 않는다
		await supabase.auth.signOut({ scope: 'local' });
		if (!res.ok) {
			const t = await res.json().catch(() => ({}));
			throw new Error(t.message ?? '운영진 확인에 실패했습니다');
		}
		void goto('/admin', { replaceState: true, invalidateAll: true });
	}

	async function run(fn: () => Promise<void>) {
		busy = true;
		msg = null;
		try {
			await fn();
		} catch (e) {
			msg = errMsg(e);
		} finally {
			busy = false;
		}
	}

	const send = () =>
		run(async () => {
			email = await sendOtp(local);
			step = 'code';
		});
	const verify = () =>
		run(async () => {
			await verifyOtp(email, code);
			await confirmStaff();
		});
	const devLogin = () =>
		run(async () => {
			const { error } = await supabase.auth.signInWithPassword({ email: devEmail.trim(), password: devPw });
			if (error) throw error;
			await confirmStaff();
		});
</script>

<div class="box">
	<h1>십분 <span>운영</span></h1>
	<p class="muted">운영진으로 등록된 학교 계정만 들어올 수 있어요.<br />모든 신원 열람과 조치는 기록됩니다.</p>

	{#if msg}<p class="err">{msg}</p>{/if}

	{#if !hasSupabase}
		<p class="err">PUBLIC_SUPABASE_URL 설정이 필요합니다.</p>
	{:else if step === 'email'}
		<div class="row">
			<input class="field" bind:value={local} placeholder="학교 이메일 앞부분" autocapitalize="off" />
			<span class="muted dom">@{SCHOOL_DOMAIN}</span>
		</div>
		<button class="btn" onclick={send} disabled={busy || local.trim().length < 2}>인증 코드 받기</button>
	{:else}
		<input class="field" bind:value={code} inputmode="numeric" maxlength="8" placeholder="인증 코드" />
		<button class="btn" onclick={verify} disabled={busy || !/^[0-9]{6,8}$/.test(code.trim())}>들어가기</button>
	{/if}

	{#if import.meta.env.DEV}
		<details class="dev">
			<summary>개발용 · 비밀번호 로그인</summary>
			<input class="field" bind:value={devEmail} placeholder="staff@cnsa.hs.kr" autocapitalize="off" />
			<input class="field" bind:value={devPw} type="password" placeholder="비밀번호" />
			<button class="btn-ghost" onclick={devLogin} disabled={busy}>로그인</button>
		</details>
	{/if}
</div>

<style>
	.box {
		max-width: 380px;
		margin: 12vh auto 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h1 {
		margin: 0;
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -0.04em;
	}
	h1 span {
		color: var(--text-2);
	}
	p {
		margin: 0;
		font-size: 13px;
		line-height: 1.7;
	}
	.err {
		padding: 10px 12px;
		border-radius: var(--r-sm);
		background: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
		font-size: 13px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.dom {
		font-size: 14px;
		white-space: nowrap;
	}
	.dev {
		margin-top: 12px;
		padding: 10px 12px;
		border: 1px dashed var(--line);
		border-radius: var(--r-sm);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.dev summary {
		font-size: 12px;
		color: var(--text-2);
		cursor: pointer;
	}
	.dev .field,
	.dev .btn-ghost {
		margin-top: 8px;
	}
</style>
