/*
 * Landy — 수동 서비스워커 (gyeol-app 패턴)
 *
 * 목적은 오프라인 캐시가 아니라 "설치 가능한 PWA 요건 충족"이다.
 * 실시간 대화 앱이므로 응답을 캐시해서 오래된 데이터를 보여주면 안 된다.
 *   · 앱 셸(HTML)만 최소 캐시하고, 네비게이션은 network-first
 *   · Supabase API / 웹소켓 요청에는 절대 손대지 않는다
 */

// v7: v6 까지는 같은 출처의 GET 을 전부 캐시 우선으로 돌려줘서, 운영자 화면 데이터(__data.json)와
//     실시간 현황(/admin/live/status)이 처음 받은 사본에 멈춰 있었다. 올리면 그 캐시가 통째로 지워진다.
// v8: 알림 배지(badge-96.png) 추가
// v9: 앱 안 알림 · 대화별로 모이는 알림 · 알림을 누르면 새로고침 없이 그 화면으로 (Phase 35)
// v10: 앱 이름을 랜디(Landy)로 — 캐시 이름도 바꾼다 (옛 캐시는 activate 에서 지워진다)
const VERSION = 'landy-v10';
const SHELL = ['/', '/icon-192.png', '/icon-512.png', '/badge-96.png', '/manifest.webmanifest'];
// 버전이 바뀌어도 지우지 않는 작은 저장소 — "설치한 앱으로 쓰는 기기인지", 앱 창 id
const META = 'landy-meta';

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
			.then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== META).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

// ── 푸시 알림 ─────────────────────────────────────────────────────────
// 서버(/api/push)가 암호화해 보낸 { kind, title, body, room, id, url, tag } 을 보여준다.
//  · 앱이 화면에 떠 있으면 → 시스템 알림 대신 앱에 알린다 (앱이 위에서 내려오는 알림 띠로 보여 준다, Phase 35).
//    애플 기기는 푸시마다 알림을 꼭 띄워야 해서(안 띄우면 구독이 끊긴다) 띄우고, 앱이 받아서 바로 닫는다.
//  · 같은 대화의 알림은 한 장에 모인다 (tag = 방 id) — 제목에 새 메시지 수, 본문은 최근 말 몇 줄 (카카오톡처럼)
//  · 늦게 도착한 알림(더 오래된 메시지)은 새 알림을 덮지 않는다 (id 비교)
const APPLE = /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent);
const safeUrl = (u) => (typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') ? u : '/');

async function onPush(d) {
	// 채팅: { room } → /chat/{room} / 편지 · 공지: { url, tag }
	const room = typeof d.room === 'string' ? d.room : '';
	const url = room ? `/chat/${room}` : safeUrl(d.url);
	const tag = room || (typeof d.tag === 'string' ? d.tag : 'landy');
	const note = { kind: d.kind || (room ? 'chat' : 'other'), title: d.title || 'Landy', body: d.body || '새 메시지', url, tag };

	const wins = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(
		(c) => new URL(c.url).origin === self.location.origin && c.visibilityState === 'visible'
	);
	if (wins.length && !APPLE) {
		for (const w of wins) w.postMessage({ type: 'push', note, shown: false });
		return;
	}
	await showGrouped(d, note, room, url, tag);
	// 애플: 띄운 알림을 앱이 받아서 바로 닫고 앱 안 알림으로 보여 준다
	for (const w of wins) w.postMessage({ type: 'push', note, shown: true });
}

async function showGrouped(d, note, room, url, tag) {
	// 같은 대화의 이전 알림에 이어 붙인다
	const prev = room ? (await self.registration.getNotifications({ tag }))[0] : undefined;
	const pd = (prev && prev.data) || {};
	const id = Number(d.id) || 0;
	if (prev && id && pd.id && id <= pd.id) {
		// 더 새 알림이 이미 떠 있다 — 그대로 다시 띄운다(소리 없이)
		return self.registration.showNotification(prev.title, { body: prev.body, tag, icon: '/icon-192.png', badge: '/badge-96.png', data: pd, silent: true });
	}
	const lines = (Array.isArray(pd.lines) ? pd.lines : []).concat(note.body).slice(-4);
	const count = (pd.count || 0) + 1;
	return self.registration.showNotification(count > 1 ? `${note.title} (${count})` : note.title, {
		body: lines.join('\n'),
		tag,
		renotify: true,
		icon: '/icon-192.png',
		// 안드로이드는 배지의 투명도만 쓴다 — 컬러 아이콘을 주면 흰 사각형이 된다. 흰 로고 + 투명 바탕.
		badge: '/badge-96.png',
		timestamp: d.at ? Date.parse(d.at) || Date.now() : Date.now(),
		data: { url, id: id || pd.id || 0, lines, count }
	});
}

self.addEventListener('push', (e) => {
	let d = {};
	try {
		d = e.data ? e.data.json() : {};
	} catch {
		d = {};
	}
	e.waitUntil(onPush(d));
});

// ── 설치한 앱(홈 화면 앱) 창 기억하기 ─────────────────────────────────
// 알림을 누를 때 브라우저 탭이 아니라 앱으로 열려고. 창이 "앱으로 떠 있는지"는 서비스워커가 알 수 없어서
// 화면이 켜질 때 앱 창이 스스로 알려 준다 (src/routes/+layout.svelte). 서비스워커는 자주 꺼졌다 켜지므로 캐시에 적어 둔다.
const metaGet = async () => {
	try {
		const r = await (await caches.open(META)).match('/__app');
		return r ? await r.json() : { app: false, ids: [] };
	} catch {
		return { app: false, ids: [] };
	}
};
const metaPut = async (m) => (await caches.open(META)).put('/__app', new Response(JSON.stringify(m)));

self.addEventListener('message', (e) => {
	if (!e.data || e.data.type !== 'standalone' || !e.source) return;
	const id = e.source.id;
	e.waitUntil(
		metaGet().then((m) => metaPut({ app: true, ids: [id, ...m.ids.filter((x) => x !== id)].slice(0, 10) }))
	);
});

// 알림을 누르면 그 대화로.
//  1) 앱 창이 떠 있으면 그 창을 앞으로 — 앱에 "여기로 가 줘"라고 알려 새로고침 없이 바로 옮긴다 (Phase 35).
//     앱이 대답하지 않으면(멈춰 있던 창) 그 주소로 다시 연다
//  2) 이 기기에서 앱을 써 왔으면 새로 연다 — 안드로이드는 설치한 앱의 범위(scope) 안 주소를 앱으로 연다
//  3) 앱을 안 쓰는 기기(브라우저로만)는 열려 있는 탭을 쓰고, 없으면 새로
const navigateTo = (w, url) => (w && 'navigate' in w ? w.navigate(url) : w);
const go = (w, url) =>
	new Promise((resolve) => {
		if (!w) return resolve(null);
		const ch = new MessageChannel();
		const t = setTimeout(() => resolve(navigateTo(w, url)), 1200);
		ch.port1.onmessage = () => {
			clearTimeout(t);
			resolve(w);
		};
		w.postMessage({ type: 'open', url }, [ch.port2]);
	});
self.addEventListener('notificationclick', (e) => {
	e.notification.close();
	const url = (e.notification.data && e.notification.data.url) || '/';
	e.waitUntil(
		Promise.all([self.clients.matchAll({ type: 'window', includeUncontrolled: true }), metaGet()]).then(([list, meta]) => {
			const ours = list.filter((c) => new URL(c.url).origin === self.location.origin);
			const app = ours.find((c) => meta.ids.includes(c.id));
			if (app) return app.focus().then((w) => go(w, url));
			if (meta.app) return self.clients.openWindow(url);
			const tab = ours[0];
			if (tab) return tab.focus().then((w) => go(w, url));
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
