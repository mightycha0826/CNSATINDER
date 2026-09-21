<script lang="ts">
	import { errMsg, saveOnboarding, toast } from '$lib/state.svelte';

	let gender: 'm' | 'f' | null = $state(null);
	let want: 'm' | 'f' | 'any' | null = $state(null);
	let busy = $state(false);

	// 기본값은 이성. 성별을 고르면 선호를 미리 채워 준다(바꿀 수 있음).
	function pickGender(g: 'm' | 'f') {
		gender = g;
		want ??= g === 'm' ? 'f' : 'm';
	}

	const ready = $derived(!!gender && !!want);

	async function submit() {
		if (!ready || busy) return;
		busy = true;
		try {
			await saveOnboarding(gender!, want!);
		} catch (e) {
			toast(errMsg(e));
		} finally {
			busy = false;
		}
	}
</script>

<div class="topbar"><span class="title">시작하기</span></div>

<div class="page ob">
	<section>
		<h2>나는</h2>
		<div class="opts">
			<button class="opt" class:on={gender === 'm'} onclick={() => pickGender('m')}>남자</button>
			<button class="opt" class:on={gender === 'f'} onclick={() => pickGender('f')}>여자</button>
		</div>
	</section>

	<section>
		<h2>이런 사람과 이야기하고 싶어요</h2>
		<div class="opts">
			<button class="opt" class:on={want === 'm'} onclick={() => (want = 'm')}>남자</button>
			<button class="opt" class:on={want === 'f'} onclick={() => (want = 'f')}>여자</button>
			<button class="opt" class:on={want === 'any'} onclick={() => (want = 'any')}>상관없어요</button>
		</div>
		<p class="hint muted">서로의 조건이 맞을 때만 연결돼요. 설정에서 언제든 바꿀 수 있어요.</p>
	</section>

	<div class="rules">
		<h2>세 가지만 지켜 주세요</h2>
		<ul>
			<li>이름·학번·반·SNS 계정은 <strong>묻지도, 말하지도 않기</strong></li>
			<li>상대가 불편할 말은 하지 않기</li>
			<li>불쾌한 일이 있으면 <strong>바로 신고하기</strong></li>
		</ul>
	</div>

	<div class="foot">
		<button class="btn" onclick={submit} disabled={!ready || busy}>
			{busy ? '저장 중…' : '동의하고 시작하기'}
		</button>
	</div>
</div>

<style>
	.ob {
		gap: 26px;
		padding-top: 22px;
		padding-bottom: 24px;
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
	/* 선택은 흑백 반전 — 그라디언트는 주 버튼에만 */
	.opt.on {
		border-color: var(--text);
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
	}
	.hint {
		margin: 0;
		font-size: 13px;
	}

	.rules {
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		background: var(--surface);
	}
	.rules h2 {
		margin-bottom: 10px;
	}
	.rules ul {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 7px;
		font-size: 14px;
		color: var(--text-2);
	}
	.rules strong {
		color: var(--text);
		font-weight: 600;
	}

	.foot {
		margin-top: auto;
	}
</style>
