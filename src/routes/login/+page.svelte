<script lang="ts">
	import { SCHOOL_DOMAIN, devSignIn, errMsg, sendOtp, toast, verifyOtp } from '$lib/state.svelte';

	// ── 개발 전용 비밀번호 로그인 (배포 빌드에서는 통째로 빠진다) ──
	let devEmail = $state('');
	let devPw = $state('');
	async function onDev() {
		busy = true;
		try {
			await devSignIn(devEmail, devPw);
		} catch (e) {
			toast(errMsg(e));
		} finally {
			busy = false;
		}
	}

	let step: 'email' | 'code' = $state('email');
	let localPart = $state('');
	let email = $state('');
	let code = $state('');
	let busy = $state(false);
	let resendAt = $state(0);

	// 학교 이메일의 앞부분만 받는다. 도메인은 고정 표시 — 오타를 구조적으로 없앤다.
	// (실제 강제는 DB 트리거가 한다. 여기는 UX 용.)
	const localOk = $derived(/^[a-zA-Z0-9._%+-]{2,}$/.test(localPart.trim()));
	// Supabase 프로젝트 설정(Email OTP length)에 따라 6~8자리
	const codeOk = $derived(/^[0-9]{6,8}$/.test(code.trim()));

	async function onSend() {
		if (!localOk || busy) return;
		busy = true;
		try {
			email = await sendOtp(localPart);
			step = 'code';
			resendAt = Date.now() + 60_000;
			toast('인증 코드를 보냈어요');
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
			// 로그인 성공 시 루트 레이아웃의 가드가 알아서 이동시킨다
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
</script>

<div class="page login">
	<div class="mark">십분</div>

	{#if step === 'email'}
		<p class="lead muted">학교 이메일로 본인 확인만 하면 끝이에요.<br />이름은 어디에도 남지 않아요.</p>

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
				onkeydown={(e) => e.key === 'Enter' && onSend()}
			/>
			<span class="domain">@{SCHOOL_DOMAIN}</span>
		</div>

		<button class="btn" onclick={onSend} disabled={!localOk || busy}>
			{busy ? '보내는 중…' : '인증 코드 받기'}
		</button>
	{:else}
		<p class="lead muted"><strong>{email}</strong> 으로<br />인증 코드를 보냈어요.</p>
		<p class="spam muted">메일이 안 보이면 <strong>스팸함</strong>을 확인해 주세요. 보낸 사람은 <strong>십분</strong>이에요.</p>

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

	{#if import.meta.env.DEV}
		<details class="dev">
			<summary>개발용 · 비밀번호 로그인</summary>
			<input class="field" bind:value={devEmail} placeholder="test1@cnsa.hs.kr" autocapitalize="off" />
			<input class="field" bind:value={devPw} type="password" placeholder="비밀번호" onkeydown={(e) => e.key === 'Enter' && onDev()} />
			<button class="btn-ghost" onclick={onDev} disabled={busy}>로그인</button>
		</details>
	{/if}

	<p class="terms muted">
		계속하면 <strong>이름·학번·SNS를 묻지도 말하지도 않기</strong> 규칙에 동의하는 것으로 봅니다.
	</p>
</div>

<style>
	.login {
		justify-content: center;
		gap: 14px;
		padding-bottom: 48px;
	}
	.mark {
		font-size: 30px;
		font-weight: 800;
		letter-spacing: -0.04em;
		margin-bottom: 4px;
	}
	.lead {
		margin: 0 0 6px;
		line-height: 1.7;
		font-size: 14px;
	}
	.lead strong {
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

	.dev {
		margin-top: 10px;
		padding: 10px 12px;
		border: 1px dashed var(--line);
		border-radius: var(--r-sm);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.dev[open] {
		gap: 8px;
	}
	.dev summary {
		font-size: 12px;
		color: var(--text-2);
		cursor: pointer;
	}
	.dev[open] summary {
		margin-bottom: 8px;
	}
	.dev .field,
	.dev .btn-ghost {
		margin-top: 8px;
	}

	.terms {
		margin: 18px 0 0;
		font-size: 12px;
		line-height: 1.6;
	}
	.terms strong {
		color: var(--text-2);
		font-weight: 600;
	}
</style>
