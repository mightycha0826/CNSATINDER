/**
 * 설치 안내용 환경 판별 — 어떤 기기·어떤 브라우저로 링크를 열었는가.
 *
 * iOS 에서 "홈 화면에 추가"가 안 보이는 가장 흔한 이유는 카카오톡·인스타 같은
 * 앱 안 브라우저(인앱 브라우저)로 열었기 때문이다. 거기에는 그 메뉴가 아예 없다.
 * → 인앱이면 설치 안내 대신 "Safari/Chrome 으로 열기"부터 안내한다.
 *
 * 순수 함수로 두어 UA 문자열만으로 테스트할 수 있게 했다.
 */
export type InApp = 'kakao' | 'instagram' | 'facebook' | 'naver' | 'line' | 'webview';

export type Env = {
	os: 'ios' | 'android' | 'other';
	/** iOS 에서 쓰는 브라우저 (iOS 16.4+ 는 Chrome·Edge·Firefox 도 홈 화면 추가 가능) */
	browser: 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'other';
	inApp: InApp | null;
};

export function detectEnv(ua: string, platform = '', maxTouchPoints = 0): Env {
	// iPadOS 13+ 는 데스크톱 Safari 처럼 'Macintosh' 로 자신을 소개한다 — 터치 지원으로 구분
	const ipadAsMac = /Macintosh/.test(ua) && (platform === 'MacIntel' || platform === '') && maxTouchPoints > 1;
	const os: Env['os'] = /iPhone|iPad|iPod/.test(ua) || ipadAsMac ? 'ios' : /Android/.test(ua) ? 'android' : 'other';

	let inApp: InApp | null = null;
	if (/KAKAOTALK/i.test(ua)) inApp = 'kakao';
	else if (/Instagram/i.test(ua)) inApp = 'instagram';
	else if (/FBAN|FBAV|FB_IAB/.test(ua)) inApp = 'facebook';
	else if (/NAVER\(inapp|NAVER\/|DaumApps|everytimeApp/i.test(ua)) inApp = 'naver';
	else if (/\bLine\//.test(ua)) inApp = 'line';
	// 그 밖의 iOS 앱 속 웹뷰: 진짜 브라우저는 UA 에 'Safari/' 가 있다 (Chrome·Edge·Firefox iOS 포함)
	else if (os === 'ios' && !/Safari\//.test(ua)) inApp = 'webview';
	// 안드로이드 웹뷰는 'wv' 표식을 단다
	else if (os === 'android' && /; wv\)/.test(ua)) inApp = 'webview';

	const browser: Env['browser'] = /CriOS|Chrome\//.test(ua) && !/EdgiOS|EdgA|Edg\//.test(ua) && !/SamsungBrowser/.test(ua)
		? 'chrome'
		: /EdgiOS|EdgA|Edg\//.test(ua)
			? 'edge'
			: /FxiOS|Firefox\//.test(ua)
				? 'firefox'
				: /SamsungBrowser/.test(ua)
					? 'samsung'
					: /Safari\//.test(ua)
						? 'safari'
						: 'other';

	return { os, browser, inApp };
}

export const IN_APP_NAME: Record<InApp, string> = {
	kakao: '카카오톡',
	instagram: '인스타그램',
	facebook: '페이스북',
	naver: '앱',
	line: '라인',
	webview: '앱'
};

/**
 * 인앱 브라우저에서 바깥 브라우저로 여는 링크. 방법이 없으면 null (→ 링크 복사로 안내).
 *  · 카카오톡: 공식 스킴이 iOS·안드로이드 모두 기본 브라우저로 연다
 *  · 안드로이드 그 밖: intent 로 Chrome 을 연다
 */
export function openExternalUrl(env: Env, url: string): string | null {
	if (env.inApp === 'kakao') return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
	if (env.os === 'android' && env.inApp) {
		const u = new URL(url);
		return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
	}
	return null;
}
