import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/**
 * 서비스워커(static/sw.js)의 앱 아이콘 배지 (UX G10.4) — sw.js 를 그대로 가짜 서비스워커 환경에서 돌린다.
 * 앱이 마지막으로 알려 준 숫자(답할 대화 id · 안 읽은 편지 수) + 그 뒤 새로 뜬 알림 — 대화는 방마다 한 번, 편지는 한 통마다.
 *
 *   npm run test:sw
 */
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
};

function worker({ visible = false, apple = false } = {}) {
	const handlers = {};
	const store = new Map(); // caches
	const shown = new Map(); // tag → { title, ...opts }
	const badge = [];
	const self = {
		addEventListener: (t, fn) => (handlers[t] = fn),
		skipWaiting: () => {},
		location: { origin: 'https://app.test' },
		navigator: {
			userAgent: apple ? 'Mozilla/5.0 (iPhone)' : 'Mozilla/5.0 (Linux; Android 14)',
			setAppBadge: async (n) => void badge.push(n),
			clearAppBadge: async () => void badge.push(0)
		},
		clients: { matchAll: async () => (visible ? [{ url: 'https://app.test/', visibilityState: 'visible', postMessage() {} }] : []), claim: async () => {} },
		registration: {
			getNotifications: async (o) => [...shown.values()].filter((n) => !o?.tag || n.tag === o.tag),
			showNotification: async (title, opts) => void shown.set(opts.tag, { title, ...opts })
		}
	};
	const caches = {
		open: async () => ({
			match: async (k) => (store.has(k) ? { json: async () => JSON.parse(store.get(k)) } : undefined),
			put: async (k, r) => void store.set(k, await r.text()),
			addAll: async () => {}
		}),
		keys: async () => [],
		delete: async () => true
	};
	vm.runInNewContext(readFileSync(new URL('../static/sw.js', import.meta.url), 'utf8'), { self, caches, Response, URL, MessageChannel, setTimeout, clearTimeout, console });
	const fire = async (type, data) => {
		const waits = [];
		handlers[type]({ data: type === 'push' ? { json: () => data } : data, waitUntil: (p) => waits.push(p) });
		await Promise.all(waits);
	};
	return { fire, badge, shown };
}

const now = Date.now();
{
	console.log('[앱이 꺼져 있을 때]');
	const w = worker();
	await w.fire('message', { type: 'badge', rooms: ['room-a'], dm: 1, since: now - 1000 });
	await w.fire('push', { kind: 'chat', room: 'room-a', title: '새벽수달', body: '안녕', id: 10 });
	check('이미 센 대화에 새 말 → 그대로 2 (대화 1 + 편지 1)', w.badge.at(-1) === 2, JSON.stringify(w.badge));
	await w.fire('push', { kind: 'chat', room: 'room-b', title: '노란우산', body: '반가워', id: 11 });
	check('★ 새 대화에서 온 말 → 3', w.badge.at(-1) === 3, JSON.stringify(w.badge));
	await w.fire('push', { kind: 'chat', room: 'room-b', title: '노란우산', body: '또', id: 12 });
	check('같은 대화의 말이 더 와도 방은 한 번만 → 3', w.badge.at(-1) === 3, JSON.stringify(w.badge));
	await w.fire('push', { kind: 'letter', tag: 'dm-5', url: '/letters/m/5', title: '새 편지가 왔어요', body: '봉투를 열어 보세요' });
	check('★ 새 편지 한 통 → 4', w.badge.at(-1) === 4, JSON.stringify(w.badge));
	await w.fire('push', { kind: 'reaction', room: 'room-c', title: '공감', body: '❤️', id: 13 });
	await w.fire('push', { kind: 'other', tag: 'pn-1', url: '/notices', title: '공지', body: '점검' });
	check('공감 · 공지는 세지 않는다 → 4', w.badge.at(-1) === 4, JSON.stringify(w.badge));
}
{
	console.log('[앱이 알려 준 뒤 · 로그아웃]');
	const w = worker();
	await w.fire('push', { kind: 'chat', room: 'room-a', title: 'x', body: 'y', id: 1 });
	check('앱이 한 번도 알려 주지 않았으면(로그인 전) 건드리지 않는다', w.badge.length === 0, JSON.stringify(w.badge));
	const tick = () => new Promise((r) => setTimeout(r, 5));
	await tick();
	await w.fire('message', { type: 'badge', rooms: [], dm: 0, since: Date.now() });
	await tick();
	await w.fire('push', { kind: 'chat', room: 'room-z', title: 'x', body: 'y', id: 2 });
	check('★ 앱이 다 읽었다고 알린 뒤 새 대화 알림 → 1 (전에 떠 있던 알림은 세지 않는다)', w.badge.at(-1) === 1, JSON.stringify(w.badge));
	await w.fire('message', { type: 'badge', clear: true });
	const n = w.badge.length;
	await w.fire('push', { kind: 'chat', room: 'room-y', title: 'x', body: 'y', id: 3 });
	check('로그아웃(clear) 뒤에는 세지 않는다', w.badge.length === n, JSON.stringify(w.badge));
}
{
	console.log('[앱이 떠 있을 때]');
	const w = worker({ visible: true });
	await w.fire('message', { type: 'badge', rooms: [], dm: 0, since: now - 1000 });
	await w.fire('push', { kind: 'chat', room: 'room-a', title: 'x', body: 'y', id: 1 });
	check('앱이 보이면 서비스워커는 세지 않는다 (앱이 센다)', w.badge.length === 0, JSON.stringify(w.badge));
	const a = worker({ visible: true, apple: true });
	await a.fire('message', { type: 'badge', rooms: [], dm: 0, since: now - 1000 });
	await a.fire('push', { kind: 'chat', room: 'room-a', title: 'x', body: 'y', id: 1 });
	check('애플도 앱이 보이면 알림만 띄우고 세지는 않는다', a.shown.size === 1 && a.badge.length === 0, JSON.stringify(a.badge));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
