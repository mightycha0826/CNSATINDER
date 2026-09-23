/*
 * CNSATINDER — 수동 서비스워커 (gyeol-app 패턴)
 *
 * 목적은 오프라인 캐시가 아니라 "설치 가능한 PWA 요건 충족"이다.
 * 실시간 대화 앱이므로 응답을 캐시해서 오래된 데이터를 보여주면 안 된다.
 *   · 앱 셸(HTML)만 최소 캐시하고, 네비게이션은 network-first
 *   · Supabase API / 웹소켓 요청에는 절대 손대지 않는다
 */

// v7: v6 까지는 같은 출처의 GET 을 전부 캐시 우선으로 돌려줘서, 운영자 화면 데이터(__data.json)와
//     실시간 현황(/admin/live/status)이 처음 받은 사본에 멈춰 있었다. 올리면 그 캐시가 통째로 지워진다.
const VERSION = 'cnsatinder-v7';
const SHELL = ['/', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

/**
 * 캐시해도 되는 것 = 내용이 바뀌면 주소도 바뀌는 파일뿐.
 *   · /_app/immutable/ — 빌드 해시가 붙은 JS·CSS
 *   · SHELL 의 아이콘·매니페스트
 * 그 밖의 요청(페이지 데이터 __data.json, /admin, /api, version.json …)은 서비스워커가 아예 손대지 않는다.
 */
const cacheable = (url) => url.pathname.startsWith('/_app/immutable/') || (url.pathname !== '/' && SHELL.includes(url.pathname));

self.addEventListener('install', (e) => {
	e.waitUntil(
		caches
			.open(VERSION)
			.then((c) => c.addAll(SHELL))
			.then(() => self.skipWaiting())
			.catch(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

// ── 푸시 알림 ─────────────────────────────────────────────────────────
// 서버(/api/push)가 암호화해 보낸 { title, body, room } 을 보여준다.
// tag = 방 id: 같은 대화의 알림은 쌓이지 않고 최신 것으로 바뀐다.
self.addEventListener('push', (e) => {
	let d = {};
	try {
		d = e.data ? e.data.json() : {};
	} catch {
		d = {};
	}
	// 채팅: { room } → /chat/{room} / 편지: { url, tag } → /letters/{id}
	const room = typeof d.room === 'string' ? d.room : '';
	// 같은 출처의 앱 안 경로만 연다 (외부 주소로 튀지 않게)
	const url = room ? `/chat/${room}` : typeof d.url === 'string' && d.url.startsWith('/') && !d.url.startsWith('//') ? d.url : '/';
	e.waitUntil(
		self.registration.showNotification(d.title || 'CNSATINDER', {
			body: d.body || '새 메시지',
			tag: room || (typeof d.tag === 'string' ? d.tag : 'cnsatinder'),
			renotify: true,
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			data: { url }
		})
	);
});

// 알림을 누르면 그 대화로. 앱이 이미 열려 있으면 새 창 대신 그 창을 앞으로.
self.addEventListener('notificationclick', (e) => {
	e.notification.close();
	const url = (e.notification.data && e.notification.data.url) || '/';
	e.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
			const win = list.find((c) => new URL(c.url).origin === self.location.origin);
			if (win) return win.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : w));
			return self.clients.openWindow(url);
		})
	);
});

self.addEventListener('fetch', (e) => {
	const req = e.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	// 외부 출처(Supabase REST/Realtime 등)는 건드리지 않는다
	if (url.origin !== self.location.origin) return;
	// 운영자 화면은 서버에서 매번 새로 그린다 — 네비게이션도 가로채지 않는다
	if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return;

	// 네비게이션: 네트워크 우선, 실패 시 캐시된 앱 셸
	if (req.mode === 'navigate') {
		e.respondWith(
			fetch(req).catch(() => caches.match('/').then((r) => r || Response.error()))
		);
		return;
	}

	// 해시가 붙은 정적 자산만 캐시 우선. 나머지는 브라우저가 평소처럼 네트워크로.
	if (!cacheable(url)) return;
	e.respondWith(
		caches.match(req).then(
			(hit) =>
				hit ||
				fetch(req).then((res) => {
					if (res.ok && res.type === 'basic') {
						const copy = res.clone();
						caches.open(VERSION).then((c) => c.put(req, copy));
					}
					return res;
				})
		)
	);
});
