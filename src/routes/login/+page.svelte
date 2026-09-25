<script lang="ts">
	import {
		SCHOOL_DOMAIN,
		UI,
		errMsg,
		sendOtp,
		sendResetOtp,
		signInWithPassword,
		toast,
		verifyOtp
	} from '$lib/state.svelte';

	/**
	 * 로그인 화면.
	 *  기본: 학교 이메일 앞부분 + 비밀번호
	 *  처음이에요: 학교 메일 인증 코드로 계정을 만든다 (온보딩에서 비밀번호를 정한다)
	 *  비밀번호를 잊었어요: 기존 계정에만 인증 코드 → 새 비밀번호 화면으로
	 * 인증 코드는 가입 한 번, 비밀번호 분실 때만 쓴다. 가입 인증이 곧 "그 학번의 주인" 확인이다.
	 * 도메인은 @cnsa.hs.kr 로 고정 — 입력칸은 앞부분만 받는다.
	 */
	type Mode = 'login' | 'signup' | 'reset';
	let mode: Mode = $state('login');
	let sent = $state(false);

	let localPart = $state('');
	let pw = $state('');
	let email = $state('');
	let code = $state('');
	let busy = $state(false);
	let resendAt = $state(0);

	// 학교 이메일의 앞부분만 받는다. 도메인은 고정 표시 — 오타를 구조적으로 없앤다.
	// (실제 강제는 DB 트리거가 한다. 여기는 UX 용.)
	const LOCAL = /^[a-zA-Z0-9._%+-]{2,}$/;
	const localOk = $derived(LOCAL.test(localPart.trim()));
	const pwReady = $derived(localOk && pw.length >= 6);
	// Supabase 프로젝트 설정(Email OTP length)에 따라 6~8자리
	const codeOk = $derived(/^[0-9]{6,8}$/.test(code.trim()));

	function go(m: Mode) {
		mode = m;
		sent = false;
		code = '';
		UI.afterLogin = null;
	}

	async function onPassword() {
		if (!pwReady || busy) return;
		busy = true;
		try {
			await signInWithPassword(localPart, pw);
		} catch (e) {
			toast(errMsg(e));
			pw = '';
		} finally {
			busy = false;
		}
	}

	async function onSend() {
		if (!localOk || busy) return;
		busy = true;
		try {
			email = mode === 'reset' ? await sendResetOtp(localPart) : await sendOtp(localPart);
			sent = true;
			resendAt = Date.now() + 60_000;
			toast('인증 코드 발송');
		} catch (e) {
			toast(errMsg(e));
		} finally {
			busy = false;
		}
	}

	async function onVerify() {
		if (!codeOk || busy) return;
		busy = true;
		try {
			UI.afterLogin = mode === 'reset' ? '/settings#password' : null;
			await verifyOtp(email, code);
			// 성공하면 루트 레이아웃의 가드가 이동시킨다 (처음이면 온보딩에서 비밀번호를 정한다)
		} catch (e) {
			UI.afterLogin = null;
			toast(errMsg(e));
			code = '';
		} finally {
			busy = false;
		}
	}
</script>

{#snippet emailField(onEnter?: () => void)}
	<div class="emailfield">
		<input
			class="local"
			bind:value={localPart}
			type="text"
			inputmode="email"
			autocomplete="username"
			autocapitalize="off"
			autocorrect="off"
			spellcheck="false"
			placeholder="학교 이메일 앞부분"
			onkeydown={(e) => e.key === 'Enter' && onEnter?.()}
		/>
		<span class="domain">@{SCHOOL_DOMAIN}</span>
	</div>
{/snippet}

<div class="page login">
	<img class="appicon" src="/icon-192.png" alt="" width="56" height="56" />
	<div class="mark wordmark">CNSATINDER</div>

	{#if mode === 'login'}
		<section>
			{@render emailField()}
			<input
				class="field"
				bind:value={pw}
				type="password"
				autocomplete="current-password"
				placeholder="비밀번호"
				onkeydown={(e) => e.key === 'Enter' && onPassword()}
			/>
			<button class="btn" onclick={onPassword} disabled={!pwReady || busy}>
				{busy ? '확인 중…' : '로그인'}
			</button>
		</section>

		<div class="links">
			<button class="btn-text" onclick={() => go('signup')}>처음이에요 · 가입하기</button>
			<button class="btn-text" onclick={() => go('reset')}>비밀번호를 잊었어요</button>
		</div>
	{:else if !sent}
		<section>
			<h2>{mode === 'signup' ? '처음 가입' : '비밀번호 찾기'}</h2>
			<p class="lead muted">
				{#if mode === 'signup'}
					학교 이메일로 본인 확인만 하면 끝. 이름은 어디에도 남지 않아요.
				{:else}
					학교 메일로 인증 코드를 보내요. 확인이 끝나면 새 비밀번호를 정할 수 있어요.
				{/if}
			</p>
			{@render emailField(onSend)}
			<button class="btn" onclick={onSend} disabled={!localOk || busy}>
				{busy ? '보내는 중…' : '인증 코드 받기'}
			</button>
		</section>
		<button class="btn-text back" onclick={() => go('login')}>로그인으로 돌아가기</button>
	{:else}
		<p class="lead muted">
			<strong>{email}</strong> 으로<br />인증 코드 발송 완료.
			{#if mode === 'reset'}<br />(가입된 계정일 때만 메일이 가요){/if}
		</p>
		<p class="spam muted">
			메일이 안 보이면 <strong>스팸함</strong>을 확인해 주세요. (발신자: <strong>CNSATINDER</strong>)
		</p>

		<input
			class="field code num"
			bind:value={code}
			type="text"
			inputmode="numeric"
			autocomplete="one-time-code"
			maxlength="8"
			placeholder="인증 코드"
			onkeydown={(e) => e.key === 'Enter' && onVerify()}
		/>

		<button class="btn" onclick={onVerify} disabled={!codeOk || busy}>
			{busy ? '확인 중…' : mode === 'signup' ? '시작하기' : '확인'}
		</button>

		<div class="row">
			<button class="btn-text" onclick={() => (sent = false)}>이메일 다시 입력</button>
			<button class="btn-text" onclick={onSend} disabled={busy || Date.now() < resendAt}>
				코드 다시 받기
			</button>
		</div>
		<button class="btn-text back" onclick={() => go('login')}>로그인으로 돌아가기</button>
	{/if}

	<p class="terms muted">
		계속하면 <strong>이름·학번·SNS를 묻지도 말하지도 않기</strong> 규칙에 동의하는 것으로 봅니다.
	</p>
</div>

<style>
	.login {
		justify-content: center;
		gap: 14px;
		padding-top: calc(24px + var(--safe-top));
		padding-bottom: 40px;
	}
	.appicon {
		margin-bottom: 2px;
	}
	.mark {
		font-size: 30px;
		font-weight: 800;
		letter-spacing: -0.04em;
		margin-bottom: 4px;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
	}
	.lead {
		margin: 0 0 2px;
		line-height: 1.6;
		font-size: 13px;
	}
	.lead strong {
		color: var(--text);
		font-weight: 600;
	}

	.links {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.back {
		align-self: center;
	}

	.spam {
		margin: -4px 0 4px;
		padding: 10px 12px;
		border-radius: var(--r-sm);
		background: var(--surface);
		font-size: 13px;
		line-height: 1.6;
	}
	.spam strong {
		color: var(--text);
		font-weight: 600;
	}

	.emailfield {
		display: flex;
		align-items: center;
		height: 44px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		background: var(--surface);
		overflow: hidden;
	}
	.emailfield:focus-within {
		border-color: var(--text-2);
	}
	.local {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0 12px;
		border: 0;
		background: none;
		outline: none;
	}
	.local::placeholder {
		color: var(--text-2);
	}
	.domain {
		padding-right: 12px;
		color: var(--text-2);
		font-size: 14px;
		white-space: nowrap;
	}

	.code {
		text-align: center;
		font-size: 22px;
		font-weight: 600;
		letter-spacing: 0.3em;
		text-indent: 0.3em;
	}

	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.terms {
		margin: 12px 0 0;
		font-size: 12px;
		line-height: 1.6;
	}
	.terms strong {
		color: var(--text-2);
		font-weight: 600;
	}
</style>
