/**
 * 기기의 "동작 줄이기"(prefers-reduced-motion) 또는 설정 › 화면의 "움직임 줄이기"(<html data-motion="reduce">, Phase 43) 를 따른다.
 * CSS 애니메이션은 app.css 에서 한꺼번에 끄고, 여기는 JS 스크롤 · 전환용 — scrollTo({ behavior }) 는 CSS 로 못 막는다.
 */
export const reducedMotion = () =>
	(typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduce') ||
	(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

export const scrollBehavior = (): ScrollBehavior => (reducedMotion() ? 'auto' : 'smooth');
