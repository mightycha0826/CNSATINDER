/*
 * CNSATINDER — 수동 서비스워커 (gyeol-app 패턴)
 *
 * 목적은 오프라인 캐시가 아니라 "설치 가능한 PWA 요건 충족"이다.
 * 실시간 대화 앱이므로 응답을 캐시해서 오래된 데이터를 보여주면 안 된다.
 *   · 앱 셸(HTML)만 최소 캐시하고, 네비게이션은 network-first
 *   · Supabase API / 웹소켓 요청에는 절대 손대지 않는다
 */

const VERSION = 'cnsatinder-v3'; // 아이콘을 바꾸면 올린다 — 설치된 앱이 캐시를 새로 받는다
const SHELL = ['/', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

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

self.addEventListener('fetch', (e) => {
	const req = e.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	// 외부 출처(Supabase REST/Realtime 등)는 건드리지 않는다
	if (url.origin !== self.location.origin) return;

	// 네비게이션: 네트워크 우선, 실패 시 캐시된 앱 셸
	if (req.mode === 'navigate') {
		e.respondWith(
			fetch(req).catch(() => caches.match('/').then((r) => r || Response.error()))
		);
		return;
	}

	// 정적 자산: 캐시 우선 (빌드 해시가 붙으므로 안전)
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
