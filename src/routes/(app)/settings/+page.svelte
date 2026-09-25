<script lang="ts">
	/**
	 * 설정 — 상단 바 오른쪽 톱니를 누르면 오는 화면.
	 *  · 채팅 색상: 내 말풍선 색. 이 기기에만 저장되고 상대 화면은 그대로다 (lib/chatColor.svelte.ts)
	 *  · 새 메시지 알림 · 비밀번호 · 계정 상태 · 개인정보 안내 · 로그아웃 (프로필에서 옮겨 옴)
	 * 홈의 "비밀번호를 만들어 두세요"와 비밀번호 찾기 인증 뒤에는 /settings#password 로 와서 비밀번호 칸이 펼쳐져 있다.
	 */
	import { goto } from '$app/navigation';
	import { CHAT_COLOR, CHAT_COLORS, setChatColor } from '$lib/chatColor.svelte';
	import { disablePush, enablePush, pushEnabled, pushState, type PushState } from '$lib/push';
	import {
		S,
		errMsg,
		recentlyVerified,
		sendOtpToMe,
		setPassword,
		signOut,
		toast,
		verifyCurrentPassword,
		verifyOtpForMe
	} from '$lib/state.svelte';
	import BackButton from '$lib/ui/BackButton.svelte';
	import PasswordFields from '$lib/ui/PasswordFields.svelte';

	let busy = $state(false);

	// ── 비밀번호 ──
	// 바꾸기: 기존 비밀번호 확인 → 새 비밀번호. 잊었으면 학교 메일 인증 코드로 확인 → 새 비밀번호.
	// 처음 만들 때는 확인 없이 바로 (인증 코드로 가입한 직후이므로).
	type PwStep = 'idle' | 'current' | 'code' | 'new';
	let pwStep = $state<PwStep>('idle');
	let current = $state('');
	let code = $state('');
	let codeSentTo = $state('');
	let resendAt = $state(0);
	let password = $state('');
	let passwordOk = $state(false);

	function startPw() {
		current = code = password = '';
		// 비밀번호가 아직 없거나, 방금 인증 코드로 들어왔으면 바로 새 비밀번호로
		pwStep = !S.hasPassword || recentlyVerified() ? 'new' : 'current';
	}
	$effect(() => {
		// 홈의 "비밀번호를 만들어 두세요" 에서 왔으면 펼쳐 둔다
		if (location.hash === '#password') startPw();
	});

	async function checkCurrent() {
		if (!current || busy) return;
		busy = true;
		try {
			await verifyCurrentPassword(current);
			pwStep = 'new';
		} catch (e) {
			const m = errMsg(e);
			toast(m.includes('비밀번호가 맞지') ? '비밀번호가 맞지 않아요' : m);
			current = '';
		} finally {
			busy = false;
		}
	}

	async function sendCode() {
		if (busy) return;
		busy = true;
		try {
			codeSentTo = await sendOtpToMe();
			resendAt = Date.now() + 60_000;
			code = '';
			pwStep = 'code';
			toast('인증 코드 발송');
		} catch (e) {
			toast(errMsg(e));
		} finally {
			busy = false;
		}
	}

	async function checkCode() {
		if (!/^[0-9]{6,8}$/.test(code.trim()) || busy) return;
		busy = true;
		try {
			await verifyOtpForMe(code);
			pwStep = 'new';
		} catch (e) {
			toast(errMsg(e));
			code = '';
		} finally {
			busy = false;
		}
	}

	async function savePassword() {
		if (!passwordOk || busy) return;
		busy = true;
		try {
			await setPassword(password);
			toast('비밀번호 저장 완료');
			pwStep = 'idle';
			password = current = code = '';
		} catch (e) {
			toast(errMsg(e));
		} finally {
			busy = false;
		}
	}

	// ── 알림 ──
	let pushPerm = $state<PushState>(pushState());
	let pushOn = $state<boolean | null>(null);
	let pushBusy = $state(false);
	$effect(() => {
		void pushEnabled().then((v) => (pushOn = v));
	});
	async function togglePush() {
		if (pushBusy) return;
		pushBusy = true;
		try {
			if (pushOn) {
				await disablePush();
				pushOn = false;
				toast('알림 꺼짐');
			} else {
				pushPerm = await enablePush();
				pushOn = await pushEnabled();
				if (pushOn) toast('알림 켜짐');
			}
		} catch (e) {
			toast(errMsg(e));
		} finally {
			pushBusy = false;
		}
	}

	async function out() {
		await signOut();
		void goto('/login', { replaceState: true });
	}
</script>

<div class="topbar">
	<BackButton href="/" history />
	<span class="title">설정</span>
</div>

<div class="page settings">
	<section aria-labelledby="chat-color">
		<h2 id="chat-color">채팅 색상</h2>
		<p class="muted small">내 말풍선 색이에요. 이 기기에서만 바뀌고, 상대에게는 원래 색으로 보여요.</p>

		<!-- 미리보기 — 고르는 즉시 바뀐다 -->
		<div class="preview" aria-hidden="true">
			<div class="prow"><span class="bubble other">오늘 급식 뭐였어?</span></div>
			<div class="prow mine"><span class="bubble">카레! 맛있었어</span></div>
			<div class="prow mine"><span class="bubble">너는 뭐 먹었어?</span></div>
		</div>

		<div class="swatches" role="radiogroup" aria-labelledby="chat-color">
			{#each CHAT_COLORS as c (c.id)}
				<label class="swatch" class:on={CHAT_COLOR.id === c.id}>
					<input
						type="radio"
						name="chat-color"
						value={c.id}
						aria-label={c.label}
						checked={CHAT_COLOR.id === c.id}
						onchange={() => setChatColor(c.id)}
					/>
					<span class="dot" style:background={c.fill}></span>
				</label>
			{/each}
		</div>
	</section>

	<section>
		<div class="rowhead">
			<h2>새 메시지 알림</h2>
			<span class="muted small">
				{pushOn === null ? '' : pushOn ? '켜짐' : pushPerm === 'denied' ? '차단됨' : '꺼짐'}
			</span>
		</div>
		{#if pushPerm === 'unsupported'}
			<p class="muted small">이 기기에서는 알림을 받을 수 없어요. (아이폰은 iOS 16.4 이상, 홈 화면에 설치한 앱에서만)</p>
		{:else if pushPerm === 'denied'}
			<p class="muted small">알림이 차단되어 있어요. 휴대폰 설정 → 알림 → CNSATINDER 에서 허용해 주세요.</p>
		{:else}
			<button class="btn-ghost" onclick={togglePush} disabled={pushBusy || pushOn === null}>
				{pushOn ? '알림 끄기' : '알림 켜기'}
			</button>
		{/if}
	</section>

	<section id="password">
		<div class="rowhead">
			<h2>비밀번호</h2>
			<span class="muted small">{S.hasPassword ? '설정됨' : '아직 없음'}</span>
		</div>
		{#if pwStep === 'idle'}
			<button class="btn-ghost" onclick={startPw}>
				{S.hasPassword ? '비밀번호 바꾸기' : '비밀번호 만들기'}
			</button>
			<p class="muted small">학교 이메일 앞부분과 이 비밀번호로 로그인해요.</p>
		{:else if pwStep === 'current'}
			<p class="step muted">먼저 지금 쓰는 비밀번호를 확인할게요.</p>
			<input
				class="field"
				type="password"
				autocomplete="current-password"
				placeholder="지금 비밀번호"
				bind:value={current}
				onkeydown={(e) => e.key === 'Enter' && checkCurrent()}
			/>
			<button class="btn" onclick={checkCurrent} disabled={!current || busy}>
				{busy ? '확인 중…' : '확인'}
			</button>
			<div class="pwfoot">
				<button class="btn-text" onclick={sendCode} disabled={busy}>
					비밀번호를 잊었다면 · 인증 코드 받기
				</button>
				<button class="cancel" onclick={() => (pwStep = 'idle')}>취소</button>
			</div>
		{:else if pwStep === 'code'}
			<p class="step muted"><strong>{codeSentTo}</strong> 으로 보낸 인증 코드를 입력해 주세요. 안 보이면 스팸함을 확인해 주세요.</p>
			<input
				class="field codein num"
				type="text"
				inputmode="numeric"
				autocomplete="one-time-code"
				maxlength="8"
				placeholder="인증 코드"
				bind:value={code}
				onkeydown={(e) => e.key === 'Enter' && checkCode()}
			/>
			<button class="btn" onclick={checkCode} disabled={!/^[0-9]{6,8}$/.test(code.trim()) || busy}>
				{busy ? '확인 중…' : '확인'}
			</button>
			<div class="pwfoot">
				<button class="btn-text" onclick={sendCode} disabled={busy || S.now < resendAt}>코드 다시 받기</button>
				<button class="cancel" onclick={() => (pwStep = 'idle')}>취소</button>
			</div>
		{:else}
			<p class="step muted">{S.hasPassword ? '새 비밀번호를 정해 주세요.' : '로그인에 쓸 비밀번호를 정해 주세요.'}</p>
			<PasswordFields bind:value={password} bind:valid={passwordOk} placeholder="새 비밀번호" />
			<button class="btn" onclick={savePassword} disabled={!passwordOk || busy}>
				{busy ? '저장 중…' : '저장'}
			</button>
			<div class="pwfoot">
				<span></span>
				<button class="cancel" onclick={() => (pwStep = 'idle')}>취소</button>
			</div>
		{/if}
	</section>

	<div class="rows">
		<div class="row"><span class="muted">학교 인증</span><span>{S.profile?.verified ? '완료' : '미완료'}</span></div>
		<div class="row"><span class="muted">계정 상태</span><span>{S.profile?.status === 'active' ? '정상' : '제한됨'}</span></div>
	</div>

	<p class="privacy muted">
		이 앱은 이름·학번을 저장하지 않습니다. 다른 학생에게는 내 계정이 절대 드러나지 않고,
		편지는 편지마다 다른 임시 이름이라 내 글끼리도 이어지지 않습니다.
		다만 안전한 운영을 위해 관리자는 대화 내용, 편지·댓글 작성자, 학교 이메일을 확인할 수 있으며,
		모든 열람은 기록으로 남습니다. 대화 내용은 방이 닫히고 24시간 뒤 서버에서 지워지지만,
		그 전에 관리자가 운영을 위해 파일로 보관할 수 있습니다 (계정 정보 없이 익명 이름과 내용만, 보관할 때마다 기록이 남음).
		익명편지는 내가 지우거나 운영진이 내리기 전까지 남습니다.
	</p>

	<div class="foot">
		<button class="btn-ghost" onclick={out}>로그아웃</button>
	</div>
</div>

<style>
	.settings {
		gap: 28px;
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
	.small {
		margin: 0;
		font-size: 12px;
	}
	.step {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
	}
	.step strong {
		color: var(--text);
		font-weight: 600;
	}
	.codein {
		text-align: center;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: 0.25em;
	}
	.pwfoot {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.cancel {
		font-size: 14px;
		color: var(--text-2);
	}

	.rowhead {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
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

	.preview {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 12px;
		border: 1px solid var(--line);
		border-radius: 16px;
	}
	.prow {
		display: flex;
	}
	.prow.mine {
		justify-content: flex-end;
	}
	.prow:not(.mine) + .prow.mine {
		margin-top: 6px;
	}
	.bubble {
		max-width: 78%;
		padding: 8px 13px;
		border-radius: var(--r-bubble);
		background: var(--bubble-fill);
		color: var(--on-accent);
		font-size: 15px;
		line-height: 1.38;
	}
	.bubble.other {
		background: var(--field);
		color: var(--text);
	}
	.swatches {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr)); /* 폰 한 줄에 여섯 개 */
		gap: 12px 8px;
		margin-top: 4px;
	}
	.swatch {
		position: relative;
		display: flex;
		justify-content: center;
		padding: 4px 0;
		cursor: pointer;
	}
	.swatch input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.dot {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		/* 고른 색은 바깥에 테두리 한 겹 — 바탕색 틈을 두고 */
		box-shadow:
			0 0 0 3px var(--bg),
			0 0 0 4px transparent;
	}
	.swatch.on .dot {
		box-shadow:
			0 0 0 3px var(--bg),
			0 0 0 5px var(--text);
	}
	.swatch input:focus-visible + .dot {
		outline: 2px solid var(--accent);
		outline-offset: 6px;
	}
</style>
