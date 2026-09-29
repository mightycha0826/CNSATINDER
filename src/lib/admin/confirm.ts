import type { SubmitFunction } from '@sveltejs/kit';
import { ask } from './ask.svelte';
import { toast } from '$lib/state.svelte';

/**
 * 운영자 화면의 모든 폼 제출 (Phase 48) — use:enhance={ack()} · use:enhance={confirmed(...)}.
 *
 * 결과는 "누른 버튼 자체"에 뜬다 (예전엔 화면 맨 위 한 줄이라 어느 버튼 결과인지 몰랐다):
 *   누르면 버튼 위에 "처리 중…" → 성공이면 초록 "✓ 적용됨"(서버의 done 문구) → 2초 뒤 원래대로
 *   실패면 빨강 "✕ 실패" + 아래쪽 알림으로 이유 전체. 버튼이 화면에서 사라지는 조치(지우기 등)면 알림으로.
 * 버튼 글자는 건드리지 않고 data-ack 속성 + CSS(::after 덮개)로만 그린다 — Svelte 가 그리는 글자와 엉키지 않게.
 *
 * ★ 확인창은 onsubmit 의 e.preventDefault() 로 막으면 안 된다 — SvelteKit 의 enhance 는 defaultPrevented 를
 *   보지 않고 그대로 요청을 보낸다(확인창에서 "취소"를 눌러도 조치가 실행되던 원인). 반드시 cancel() 로.
 *
 * keep = true 면 성공해도 폼 입력값을 비우지 않는다 (설정 값 · 대상 · 조치 선택이 튀지 않게).
 * message 는 보낼 폼 값을 받는다 — 한 화면의 여러 폼이 같은 확인창을 쓸 때 (특별 업적 주기 · 거두기)
 */
type Opts = { keep?: boolean; onSuccess?: () => void };

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
function mark(btn: HTMLElement | null, state: 'busy' | 'ok' | 'err' | null, msg = '') {
	if (!btn) return;
	clearTimeout(timers.get(btn));
	if (!state) {
		delete btn.dataset.ack;
		delete btn.dataset.ackMsg;
		btn.removeAttribute('aria-busy');
		return;
	}
	btn.dataset.ack = state;
	btn.dataset.ackMsg = msg;
	if (state === 'busy') btn.setAttribute('aria-busy', 'true');
	else {
		btn.removeAttribute('aria-busy');
		timers.set(btn, setTimeout(() => mark(btn, null), state === 'ok' ? 2200 : 3500));
	}
}

export function ack(opts: Opts = {}, confirm?: (f: FormData) => string): SubmitFunction {
	return async ({ cancel, formData, formElement, submitter }) => {
		if (confirm && !(await ask(confirm(formData)))) {
			cancel();
			return;
		}
		const btn = (submitter as HTMLElement | null) ?? formElement.querySelector<HTMLElement>('button:not([type="button"])');
		if (btn?.dataset.ack === 'busy') {
			cancel(); // 두 번 누름
			return;
		}
		mark(btn, 'busy', '처리 중…');
		return async ({ result, update }) => {
			await update({ reset: !opts.keep });
			const data = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { done?: string; error?: string } | null;
			const ok = result.type === 'success' || result.type === 'redirect';
			const msg = ok ? data?.done || '적용됨' : data?.error || (result.type === 'error' ? result.error?.message : '') || '처리하지 못했어요';
			// 버튼에는 짧게 — 긴 안내("공지 올림 · 학생들 종 아이콘에 …")는 앞부분만 버튼에, 전체는 알림으로
			const short = msg.split(/ · |\. /)[0];
			if (btn?.isConnected) {
				mark(btn, ok ? 'ok' : 'err', ok ? `✓ ${short.length <= 14 ? short : '완료'}` : '✕ 실패');
				if (!ok || short !== msg || short.length > 14) toast(ok ? `✓ ${msg}` : msg);
			} else toast(ok ? `✓ ${msg}` : msg);
			if (ok) {
				// 고친 칸 표시 지우기 (admin +layout 의 input 감시)
				delete formElement.dataset.dirty;
				for (const el of formElement.querySelectorAll('[data-changed]')) el.removeAttribute('data-changed');
				opts.onSuccess?.();
			}
		};
	};
}

/** 확인창을 거치는 제출 — 예전 이름 그대로 (결과 표시는 ack 와 같다) */
export function confirmed(message: (f: FormData) => string, opts: Opts = {}): SubmitFunction {
	return ack(opts, message);
}
