import { goto } from '$app/navigation';
import { UI } from './state.svelte';

/**
 * 앱 안에서 "뒤로" — 들어온 기록이 있으면 브라우저 뒤로(기록을 늘리지 않는다), 없으면 fallback 으로 바꿔 끼운다.
 *
 * ★ 홈(채팅)이 기록의 맨 아래에 있어야 홈에서 뒤로가기 두 번으로 앱이 닫힌다((app)/+layout.svelte).
 *   goto('/') 로 홈을 새로 쌓으면 그 아래에 옛 화면이 남아서, 뒤로가기가 앱을 닫지 않고 옛 화면으로 간다.
 *   알림으로 대화방을 바로 연 경우처럼 뒤로 갈 곳이 없으면 그 자리를 홈으로 바꾼다.
 */
export function goBack(fallback = '/') {
	if (history.length > 1) history.back();
	else void goto(fallback, { replaceState: true });
}

/** 대화가 끝난 뒤 "새 대화 찾기" — 홈으로 돌아가서 바로 찾기 시작 */
export function backToSeek() {
	UI.seekOnHome = true;
	goBack('/');
}
