/**
 * 앱 새로고침 (Phase 37) — 설치한 앱에는 브라우저 새로고침 단추가 없다. 당겨서 새로고침 · 설정의 "앱 새로고침"이 부른다.
 * 먼저 서비스워커에 새 버전이 있는지 묻고(오래 기다리지 않는다), 화면을 처음부터 다시 불러온다.
 */
export async function reloadApp() {
	try {
		const reg = await navigator.serviceWorker?.getRegistration();
		await Promise.race([reg?.update(), new Promise((r) => setTimeout(r, 1200))]);
	} catch {
		/* 서비스워커가 없거나 오프라인 — 그냥 다시 불러온다 */
	}
	location.reload();
}
