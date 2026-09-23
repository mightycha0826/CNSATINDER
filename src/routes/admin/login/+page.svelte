<script lang="ts">
	/**
	 * 운영자 로그인.
	 *
	 * 기본: 학교 이메일 + 비밀번호로 바로 로그인 (평소 사용 경로 — 단순 로그인).
	 * 보조: 처음 등록하거나 비밀번호를 잊었을 때만 인증 코드(OTP) 경로를 쓴다.
	 *
	 * 어느 경로든 Supabase 인증 뒤 토큰을 서버로 보내 운영진(private.staff) 여부를
	 * 다시 확인받는다 — "단순 로그인"이어도 운영진이 아니면 절대 들어오지 못한다.
	 * 확인이 끝나면 이 브라우저의 학생용 세션은 지운다 (서버 서명 쿠키만 남는다).
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { supabase, hasSupabase } from '$lib/supabase';
	import { SCHOOL_DOMAIN, errMsg, sendOtp, signInWithPassword, verifyOtp } from '$lib/state.svelte';

	const setup = page.url.searchParams.get('setup');

	let mode: 'password' | 'otp-email' | 'otp-code' = $state('password');

	// 비밀번호 로그인 (기본)
	let pwLocal = $state('');
	let pw = $state('');
	const pwReady = $derived(pwLocal.trim().length >= 2 && pw.length >= 6);

	// 인증 코드 로그인 (최초 등록 · 비밀번호 분실)
	let otpLocal = $state('');
	let otpEmail = $state('');
	let code = $state('');
	const codeOk = $derived(/^[0-9]{6,8}$/.test(code.trim()));

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

	const loginWithPassword = () =>
		run(async () => {
			await signInWithPassword(pwLocal, pw);
			await confirmStaff();
		});
	const sendCode = () =>
		run(async () => {
			otpEmail = await sendOtp(otpLocal);
			mode = 'otp-code';
		});
	const verifyCode = () =>
		run(async () => {
			await verifyOtp(otpEmail, code);
			await confirmStaff();
		});

	function toOtp() {
		mode = 'otp-email';
		msg = null;
	}
	function toPassword() {
		mode = 'password';
		code = '';
		msg = null;
	}
</script>

<div class="box">
	<h1>CNSATINDER <span>운영</span></h1>
	<p class="muted">운영진으로 등록된 학교 계정만 들어올 수 있어요.<br />모든 신원 열람과 조치는 기록됩니다.</p>

	{#if msg}<p class="err">{msg}</p>{/if}

	{#if !hasSupabase}
		<p class="err">PUBLIC_SUPABASE_URL 설정이 필요합니다.</p>
	{:else if mode === 'password'}
		<div class="row">
			<input class="field" bind:value={pwLocal} placeholder="학교 이메일 앞부분" autocapitalize="off" autocomplete="username" />
			<span class="muted dom">@{SCHOOL_DOMAIN}</span>
		</div>
		<input
			class="field"
			bind:value={pw}
			type="password"
			placeholder="비밀번호"
			autocomplete="current-password"
			onkeydown={(e) => e.key === 'Enter' && loginWithPassword()}
		/>
		<button class="btn" onclick={loginWithPassword} disabled={busy || !pwReady}>로그인</button>
		<button class="btn-text" onclick={toOtp} disabled={busy}>처음이거나 비밀번호를 잊었다면</button>
	{:else if mode === 'otp-email'}
		<div class="row">
			<input class="field" bind:value={otpLocal} placeholder="학교 이메일 앞부분" autocapitalize="off" />
			<span class="muted dom">@{SCHOOL_DOMAIN}</span>
		</div>
		<button class="btn" onclick={sendCode} disabled={busy || otpLocal.trim().length < 2}>인증 코드 받기</button>
		<button class="btn-text" onclick={toPassword} disabled={busy}>비밀번호로 로그인</button>
	{:else}
		<p class="muted"><strong>{otpEmail}</strong> 으로 인증 코드를 보냈어요.</p>
		<input class="field" bind:value={code} inputmode="numeric" maxlength="8" placeholder="인증 코드" />
		<button class="btn" onclick={verifyCode} disabled={busy || !codeOk}>들어가기</button>
		<button class="btn-text" onclick={toPassword} disabled={busy}>비밀번호로 로그인</button>
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
	.btn-text {
		align-self: center;
		font-size: 13px;
		color: var(--text-2);
		font-weight: 600;
	}
</style>
