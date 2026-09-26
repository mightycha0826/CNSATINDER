<script lang="ts">
	/**
	 * 설정 — 상단 바 오른쪽 톱니를 누르면 오는 화면. 아이폰 설정 앱처럼 회색 바탕에 둥근 카드 (app.css .g-*).
	 *  · 화면: 기기 설정 따르기 / 라이트 / 다크. 이 기기에만 저장 (lib/theme.svelte.ts)
	 *  · 테마 색상: 앱 전체의 포인트 색 (버튼 · 로고 · 내 말풍선 …). 이 기기에만 저장되고 상대 화면은 그대로다 (lib/themeColor.svelte.ts)
	 *  · 새 메시지 알림 · 비밀번호 · 계정 상태 · 약관 및 정책(이용약관 · 개인정보 처리방침 · 운영정책 → /settings/[doc]) · 로그아웃
	 * 홈의 "비밀번호를 만들어 두세요"와 비밀번호 찾기 인증 뒤에는 /settings#password 로 와서 비밀번호 칸이 펼쳐져 있다.
	 */
	import { goto } from '$app/navigation';
	import { THEME_COLOR, THEME_COLORS, fillOf, setThemeColor } from '$lib/themeColor.svelte';
	import { THEME, THEME_MODES, setTheme } from '$lib/theme.svelte';
	import { disablePush, enablePush, pushEnabled, pushState, type PushState } from '$lib/push';
	import {
		S,
		errMsg,
		recentlyVerified,
		sendOtpToMe,
		setAllowRematch,
		setPassword,
		loadProfile,
		signOut,
		toast,
		verifyCurrentPassword,
		verifyOtpForMe
	} from '$lib/state.svelte';
	import BackButton from '$lib/ui/BackButton.svelte';
	import { setLettersOpen } from '$lib/letters/api';
	import Chevron from '$lib/ui/Chevron.svelte';
	import { LEGAL, LEGAL_IDS } from '$lib/legal';
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

	/** 비밀번호 줄 — 누르면 펼치고, 펼쳐져 있으면 접는다 */
	function togglePw() {
		if (pwStep === 'idle') startPw();
		else pwStep = 'idle';
	}

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

	// ── 매칭 ──
	let rematchBusy = $state(false);
	async function toggleRematch(e: Event) {
		const box = e.currentTarget as HTMLInputElement;
		const on = box.checked;
		box.checked = !!S.profile?.allow_rematch; // 저장된 뒤에 바뀐다
		if (rematchBusy) return;
		rematchBusy = true;
		try {
			await setAllowRematch(on);
			toast(on ? '만났던 사람도 다시 만날 수 있어요' : '최근에 만난 사람은 다시 만나지 않아요');
		} catch (err) {
			toast(errMsg(err));
		} finally {
			rematchBusy = false;
		}
	}

	// ── 편지 받기 (Phase 23) ──
	let lettersBusy = $state(false);
	async function toggleLetters(e: Event) {
		const box = e.currentTarget as HTMLInputElement;
		const on = box.checked;
		box.checked = S.profile?.letters_open !== false; // 저장된 뒤에 바뀐다
		if (lettersBusy || !S.session) return;
		lettersBusy = true;
		try {
			await setLettersOpen(on, S.session.user.id);
			await loadProfile();
			toast(on ? '이름으로 찾아서 편지를 보낼 수 있어요' : '이제 검색에 나오지 않고 새 편지를 받지 않아요');
		} catch (err) {
			toast(errMsg(err));
		} finally {
			lettersBusy = false;
		}
	}

	async function out() {
		await signOut();
		void goto('/login', { replaceState: true });
	}
</script>

<div class="topbar ios">
	<BackButton href="/" history />
	<span class="title">설정</span>
</div>

<div class="page grouped settings">
	<!-- 화면 — 한 줄: 왼쪽 이름, 오른쪽 아이콘 셋 (기기 · 해 · 달). 이 기기에서만 바뀐다 -->
	<div class="g-card theme-card">
		<div class="g-row">
			<span id="theme-h">화면</span>
			<div class="seg" role="radiogroup" aria-labelledby="theme-h">
				{#each THEME_MODES as t (t.id)}
					<button class="seg-btn" class:on={THEME.mode === t.id} role="radio" aria-checked={THEME.mode === t.id} aria-label={t.label} title={t.label} onclick={() => setTheme(t.id)}>
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							{#if t.id === 'system'}
								<rect x="6.5" y="2.5" width="11" height="19" rx="2.5" stroke="currentColor" stroke-width="1.8" />
								<path d="M10.5 18.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
							{:else if t.id === 'light'}
								<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" />
								<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
							{:else}
								<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
							{/if}
						</svg>
					</button>
				{/each}
			</div>
		</div>
	</div>

	<h2 class="g-head" id="theme-color">테마 색상</h2>
	<div class="g-card">
		<!-- 미리보기 — 고르는 즉시 바뀐다 -->
		<div class="preview" aria-hidden="true">
			<div class="prow"><span class="bubble other">오늘 급식 뭐였어?</span></div>
			<div class="prow mine"><span class="bubble">카레! 맛있었어</span></div>
			<div class="prow mine"><span class="bubble">너는 뭐 먹었어?</span></div>
		</div>
		<div class="swatches" role="radiogroup" aria-labelledby="theme-color">
			{#each THEME_COLORS as c (c.id)}
				<label class="swatch" class:on={THEME_COLOR.id === c.id}>
					<input
						type="radio"
						name="theme-color"
						value={c.id}
						aria-label={c.label}
						checked={THEME_COLOR.id === c.id}
						onchange={() => setThemeColor(c.id)}
					/>
					<span class="dot" style:background={fillOf(c)}></span>
				</label>
			{/each}
		</div>
	</div>
	<p class="g-foot">버튼 · 로고 · 내 말풍선 등 앱 전체의 색이에요. 이 기기에서만 바뀌고, 상대 화면은 그대로예요.</p>

	<h2 class="g-head">알림</h2>
	<div class="g-card">
		<label class="g-row">
			<span>새 메시지 알림</span>
			<input
				class="switch"
				type="checkbox"
				role="switch"
				checked={!!pushOn}
				disabled={pushBusy || pushOn === null || pushPerm === 'unsupported' || pushPerm === 'denied'}
				onchange={(e) => {
					(e.currentTarget as HTMLInputElement).checked = !!pushOn; // 실제로 켜지고 꺼진 뒤에 바뀐다
					void togglePush();
				}}
			/>
		</label>
	</div>
	<p class="g-foot">
		{#if pushPerm === 'unsupported'}
			이 기기에서는 알림을 받을 수 없어요. (아이폰은 iOS 16.4 이상, 홈 화면에 설치한 앱에서만)
		{:else if pushPerm === 'denied'}
			알림이 차단되어 있어요. 휴대폰 설정 → 알림 → CNSATINDER 에서 허용해 주세요.
		{:else}
			앱을 보고 있지 않을 때 새 메시지 · 공감 · 편지 댓글을 알려 줘요.
		{/if}
	</p>

	<h2 class="g-head">매칭</h2>
	<div class="g-card">
		<label class="g-row">
			<span>만났던 사람 다시 만나기</span>
			<input
				class="switch"
				type="checkbox"
				role="switch"
				checked={!!S.profile?.allow_rematch}
				disabled={rematchBusy || !S.profile}
				onchange={toggleRematch}
			/>
		</label>
	</div>
	<p class="g-foot">
		끄면 최근에 대화한 사람과는 다시 연결되지 않아요. 켜도 상대도 켜 둔 경우에만 다시 만나고,
		처음 보는 사람이 기다리고 있으면 그쪽이 먼저예요. 차단한 사람과는 어떤 경우에도 만나지 않아요.
	</p>

	<h2 class="g-head">편지</h2>
	<div class="g-card">
		<label class="g-row">
			<span>편지 받기</span>
			<input
				class="switch"
				type="checkbox"
				role="switch"
				checked={S.profile?.letters_open !== false}
				disabled={lettersBusy || !S.profile || S.profile.letters_open === undefined}
				onchange={toggleLetters}
			/>
		</label>
	</div>
	<p class="g-foot">
		켜 두면 다른 학생이 내 이름으로 찾아 익명 편지를 보낼 수 있어요. 끄면 검색에 나오지 않고 새 편지를 받지 않아요
		(이미 주고받던 편지는 그대로예요). 불편한 편지는 편지 화면에서 나가기 · 차단 · 신고할 수 있어요.
	</p>

	<h2 class="g-head">계정</h2>
	<div class="g-card" id="password">
		<button class="g-row" onclick={togglePw} aria-expanded={pwStep !== 'idle'}>
			<span>비밀번호</span>
			<span class="g-val">{S.hasPassword ? '바꾸기' : '만들기'}</span>
			<Chevron />
		</button>
		{#if pwStep !== 'idle'}
			<div class="g-more">
				{#if pwStep === 'current'}
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
			</div>
		{/if}
		{#if S.me}
			<div class="g-row">
				<span>이름</span>
				<span class="g-val">{S.me.name}{S.me.grade ? ` · ${S.me.grade}학년` : ''}</span>
			</div>
		{/if}
		<div class="g-row">
			<span>학교 인증</span>
			<span class="g-val">{S.profile?.verified ? '완료' : '미완료'}</span>
		</div>
		<div class="g-row">
			<span>계정 상태</span>
			<span class="g-val" class:bad={S.profile?.status !== 'active'}>{S.profile?.status === 'active' ? '정상' : '제한됨'}</span>
		</div>
	</div>
	<p class="g-foot">학교 이메일 앞부분과 비밀번호로 로그인해요. {S.hasPassword ? '' : '비밀번호가 아직 없어요.'}</p>

	<h2 class="g-head">약관 및 정책</h2>
	<div class="g-card">
		{#each LEGAL_IDS as id (id)}
			<a class="g-row legal-row" href="/settings/{id}">
				<span class="legal-ic" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none">
						{#if id === 'terms'}
							<path d="M7 3.5h7l4 4V20a.5.5 0 01-.5.5h-10A.5.5 0 017 20V3.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
							<path d="M14 3.5V8h4M9.5 12h5M9.5 15.5h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
						{:else if id === 'privacy'}
							<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
							<path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
						{:else}
							<circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="1.7" />
							<circle cx="16.5" cy="10" r="2.3" stroke="currentColor" stroke-width="1.7" />
							<path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M14.5 15c2.6-.6 5.2.7 6 3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
						{/if}
					</svg>
				</span>
				<span class="legal-text">
					<span>{LEGAL[id].title}</span>
					<small class="muted">{LEGAL[id].subtitle}</small>
				</span>
				<Chevron />
			</a>
		{/each}
	</div>

	<div class="g-card out">
		<button class="g-row center danger" onclick={out}>로그아웃</button>
	</div>
</div>

<style>
	.settings {
		padding-bottom: calc(32px + env(safe-area-inset-bottom));
	}
	.theme-card {
		margin-top: 18px;
	}
	/* 화면 모드 — 아이콘 세 개짜리 작은 고르기 칸 */
	.seg {
		display: flex;
		gap: 2px;
		margin-left: auto;
		padding: 3px;
		border-radius: 999px;
		background: var(--field);
	}
	.seg-btn {
		display: grid;
		place-items: center;
		width: 40px;
		height: 30px;
		border-radius: 999px;
		color: var(--text-2);
		transition: background-color 0.15s, color 0.15s;
	}
	.seg-btn svg {
		width: 18px;
		height: 18px;
	}
	.seg-btn.on {
		background: var(--accent-fill);
		color: var(--on-accent);
	}
	.settings > .g-head:first-child {
		margin-top: 8px;
	}
	.out {
		margin-top: 32px;
	}
	.bad {
		color: var(--danger);
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

	/* 약관 및 정책 — 아이콘 · 제목 · 한 줄 설명 · › */
	.legal-row {
		color: inherit;
		text-decoration: none;
	}
	a.legal-row:active {
		background: var(--field);
	}
	.legal-ic {
		flex: none;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 9px;
		background: var(--accent-fill);
		color: var(--on-accent);
	}
	.legal-ic svg {
		width: 19px;
		height: 19px;
	}
	.legal-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.3;
	}
	.legal-text small {
		font-size: 12px;
	}

	/* 테마 색상 — 위는 대화 미리보기, 아래는 색 동그라미 (아이폰 "라이트 · 다크" 고르기처럼) */
	.preview {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 18px 16px 16px;
		border-bottom: 1px solid var(--cell-line);
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
		grid-template-columns: repeat(5, minmax(0, 1fr)); /* 한 줄에 다섯 개 */
		padding: 14px 8px;
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
		width: 38px;
		height: 38px;
		border-radius: 50%;
		/* 고른 색은 바깥에 테두리 한 겹 — 카드색 틈을 두고 */
		box-shadow:
			0 0 0 3px var(--cell),
			0 0 0 4px transparent;
	}
	.swatch.on .dot {
		box-shadow:
			0 0 0 3px var(--cell),
			0 0 0 5px var(--text);
	}
	.swatch input:focus-visible + .dot {
		outline: 2px solid var(--accent);
		outline-offset: 6px;
	}
</style>
