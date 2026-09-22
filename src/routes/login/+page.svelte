<script lang="ts">
	import {
		SCHOOL_DOMAIN,
		errMsg,
		sendOtp,
		signInWithPassword,
		toast,
		verifyOtp
	} from '$lib/state.svelte';

	/**
	 * 로그인 화면 — 두 갈래.
	 *  위: 처음이면 학교 메일 인증 코드로 계정을 만든다 (비밀번호를 잊었을 때도 이 길로 들어온다)
	 *  아래: 이미 계정이 있으면 학교 이메일 앞부분 + 비밀번호
	 * 어느 쪽이든 도메인은 @cnsa.hs.kr 로 고정 — 입력칸은 앞부분만 받는다.
	 */

	// ── 인증 코드 (처음 가입 · 비밀번호 분실) ──
	let step: 'email' | 'code' = $state('email');
	let localPart = $state('');
	let email = $state('');
	let code = $state('');
	let busy = $state(false);
	let resendAt = $state(0);

	// 학교 이메일의 앞부분만 받는다. 도메인은 고정 표시 — 오타를 구조적으로 없앤다.
	// (실제 강제는 DB 트리거가 한다. 여기는 UX 용.)
	const LOCAL = /^[a-zA-Z0-9._%+-]{2,}$/;
	const localOk = $derived(LOCAL.test(localPart.trim()));
	// Supabase 프로젝트 설정(Email OTP length)에 따라 6~8자리
	const codeOk = $derived(/^[0-9]{6,8}$/.test(code.trim()));

	async function onSend() {
		if (!localOk || busy) return;
		busy = true;
		try {
			email = await sendOtp(localPart);
			step = 'code';
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
			await verifyOtp(email, code);
			// 로그인 성공 시 루트 레이아웃의 가드가 알아서 이동시킨다 (처음이면 온보딩에서 비밀번호를 정한다)
		} catch (e) {
			toast(errMsg(e));
			code = '';
		} finally {
			busy = false;
		}
	}

	function back() {
		step = 'email';
		code = '';
	}

	// ── 비밀번호 로그인 (이미 계정이 있을 때) ──
	let pwLocal = $state('');
	let pw = $state('');
	const pwReady = $derived(LOCAL.test(pwLocal.trim()) && pw.length >= 6);

	async function onPassword() {
		if (!pwReady || busy) return;
		busy = true;
		try {
			await signInWithPassword(pwLocal, pw);
		} catch (e) {
			toast(errMsg(e));
			pw = '';
		} finally {
			busy = false;
		}
	}
</script>

<div class="page login">
	<img class="appicon" src="/icon-192.png" alt="" width="56" height="56" />
	<div class="mark wordmark">CNSATINDER</div>

	{#if step === 'email'}
		<section>
			<h2>처음 이용</h2>
			<p class="lead muted">학교 이메일로 본인 확인만 하면 끝. 이름은 어디에도 남지 않아요.</p>

			<div class="emailfield">
				<input
					class="local"
					bind:value={localPart}
					type="text"
					inputmode="email"
					autocapitalize="off"
					autocorrect="off"
					spellcheck="false"
					placeholder="학교 이메일 앞부분"
					onkeydown={(e) => e.key === 'Enter' && onSend()}
				/>
				<span class="domain">@{SCHOOL_DOMAIN}</span>
			</div>

			<button class="btn" onclick={onSend} disabled={!localOk || busy}>
				{busy ? '보내는 중…' : '인증 코드 받기'}
			</button>
		</section>

		<div class="or"><span>이미 계정이 있다면</span></div>

		<section>
			<div class="emailfield">
				<input
					class="local"
					bind:value={pwLocal}
					type="text"
					inputmode="email"
					autocomplete="username"
					autocapitalize="off"
					autocorrect="off"
					spellcheck="false"
					placeholder="학교 이메일 앞부분"
				/>
				<span class="domain">@{SCHOOL_DOMAIN}</span>
			</div>
			<input
				class="field"
				bind:value={pw}
				type="password"
				autocomplete="current-password"
				placeholder="비밀번호"
				onkeydown={(e) => e.key === 'Enter' && onPassword()}
			/>
			<button class="btn-ghost" onclick={onPassword} disabled={!pwReady || busy}>
				{busy ? '확인 중…' : '로그인'}
			</button>
			<p class="hint muted">
				비밀번호를 잊었다면 위에서 인증 코드로 들어온 뒤 <strong>설정</strong>에서 다시 정하세요.
			</p>
		</section>
	{:else}
		<p class="lead muted"><strong>{email}</strong> 으로<br />인증 코드 발송 완료.</p>
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
			{busy ? '확인 중…' : '시작하기'}
		</button>

		<div class="row">
			<button class="btn-text" onclick={back}>이메일 다시 입력</button>
			<button class="btn-text" onclick={onSend} disabled={busy || Date.now() < resendAt}>
				코드 다시 받기
			</button>
		</div>
	{/if}

	<p class="terms muted">
		계속하면 <strong>이름·학번·SNS를 묻지도 말하지도 않기</strong> 규칙에 동의하는 것으로 봅니다.
	</p>
</div>

<style>
	.login {
		justify-content: center;
		gap: 14px;
		padding-top: 24px;
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

	/* 두 갈래 사이 구분 — 인스타 로그인의 "또는" 줄 */
	.or {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 6px 0 2px;
		color: var(--text-2);
		font-size: 13px;
		font-weight: 600;
	}
	.or::before,
	.or::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--line);
	}

	.hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.6;
	}
	.hint strong {
		color: var(--text);
		font-weight: 600;
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
