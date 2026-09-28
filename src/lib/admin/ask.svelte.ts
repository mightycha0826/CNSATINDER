/**
 * 운영 화면 확인창 — 브라우저 기본 confirm() 대신 `if (!(await ask('…'))) return;`.
 * 기본 confirm 은 떠 있는 동안 페이지 전체를 멈추고(실시간 화면 갱신까지), 모양도 브라우저마다 달랐다.
 * 그리는 쪽은 운영 레이아웃의 <ConfirmDialog /> 하나. 한 번에 하나만 — 떠 있는 동안 또 부르면 앞의 것은 "취소"로 닫는다.
 */
type Ask = { id: number; message: string; ok: string; resolve: (yes: boolean) => void };

export const ASK = $state<{ cur: Ask | null }>({ cur: null });
let seq = 0;

export function ask(message: string, ok = '확인'): Promise<boolean> {
	ASK.cur?.resolve(false);
	const id = ++seq;
	return new Promise((resolve) => {
		ASK.cur = {
			id,
			message,
			ok,
			resolve: (yes) => {
				if (ASK.cur?.id === id) ASK.cur = null; // $state 가 감싼 객체라 === 로 비교하지 않는다
				resolve(yes);
			}
		};
	});
}
