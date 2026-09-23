/**
 * 화면이 보이는 동안만 ms 마다 fn 을 부르고, 백그라운드에서 돌아오면 곧바로 한 번 부른다.
 * 대화 목록·편지 피드·편지 상세·운영자 실시간 현황이 같은 방식으로 새로 읽는다.
 * 돌려주는 함수를 부르면 멈춘다 ($effect 의 정리 함수로 그대로 돌려주면 된다).
 */
export function whileVisible(fn: () => void, ms: number): () => void {
	const visible = () => document.visibilityState === 'visible';
	const timer = setInterval(() => visible() && fn(), ms);
	const onVis = () => visible() && fn();
	document.addEventListener('visibilitychange', onVis);
	return () => {
		clearInterval(timer);
		document.removeEventListener('visibilitychange', onVis);
	};
}
