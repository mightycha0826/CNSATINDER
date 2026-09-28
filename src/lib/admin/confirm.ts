import type { SubmitFunction } from '@sveltejs/kit';
import { ask } from './ask.svelte';

/**
 * use:enhance 에 넘기는 확인창. 취소하면 요청을 보내지 않는다.
 *
 * ★ onsubmit 에서 e.preventDefault() 로 막으면 안 된다 — SvelteKit 의 enhance 는 defaultPrevented 를
 *   보지 않고 그대로 요청을 보낸다(확인창에서 "취소"를 눌러도 조치가 실행되던 원인). 반드시 cancel() 로.
 *   enhance 는 이 함수를 await 하고, 폼 값(formData)은 확인창을 띄우기 전에 이미 담아 둔다.
 *
 * keep = true 면 성공해도 폼 입력값을 비우지 않는다 (대상·조치 선택이 튀지 않게).
 * message 는 보낼 폼 값을 받는다 — 한 화면의 여러 폼이 같은 확인창을 쓸 때 (특별 업적 주기 · 거두기)
 */
export function confirmed(
	message: (f: FormData) => string,
	opts: { keep?: boolean; onSuccess?: () => void } = {}
): SubmitFunction {
	return async ({ cancel, formData }) => {
		if (!(await ask(message(formData)))) {
			cancel();
			return;
		}
		return async ({ result, update }) => {
			await update({ reset: !opts.keep });
			if (result.type === 'success') opts.onSuccess?.();
		};
	};
}
