/**
 * 기기의 "동작 줄이기"(prefers-reduced-motion) 를 따른다.
 * CSS 애니메이션은 app.css 에서 한꺼번에 끄고, 여기는 JS 스크롤용 — scrollTo({ behavior }) 는 CSS 로 못 막는다.
 */
export const reducedMotion = () =>
	typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const scrollBehavior = (): ScrollBehavior => (reducedMotion() ? 'auto' : 'smooth');
