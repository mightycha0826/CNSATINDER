import { createServer } from 'vite';

/**
 * 익명편지 클라이언트 로직 테스트 — 가짜 서버 응답으로 피드·답장받기 상태 기계를 검증한다.
 * Supabase 불필요.
 *
 *   npm run test:letters
 *
 * vite 의 ssrLoadModule 로 .svelte.ts 를 컴파일해서 불러온다(runes 포함).
 */
const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom',
	logLevel: 'error'
});

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 화면 가시성을 바꿔 가며 시험할 수 있는 최소 DOM 스텁
const listeners = new Set();
globalThis.document = {
	visibilityState: 'visible',
	addEventListener: (_t, f) => listeners.add(f),
	removeEventListener: (_t, f) => listeners.delete(f)
};
const setVisible = (v) => {
	document.visibilityState = v ? 'visible' : 'hidden';
	for (const f of listeners) f();
};
Math.random = () => 0; // 폴링 지터 제거 — 시간을 예측할 수 있게

const now = () => new Date().toISOString();
const item = (id, over = {}) => ({
	id,
	body: `편지 ${id}`,
	truncated: false,
	author_alias: '푸른 우표',
	is_mine: false,
	reply_status: 'unassigned',
	comment_count: 0,
	assigned_to_me: false,
	created_at: now(),
	...over
});
/** id 가 큰 게 최신. cursor 보다 작은 것부터 size 개 */
function fakeServer(ids, size = 20) {
	const state = { ids: [...ids], calls: 0, fail: false };
	state.fetch = async (cursor) => {
		state.calls++;
		if (state.fail) throw new Error('network');
		const sorted = [...state.ids].sort((a, b) => b - a).filter((i) => cursor == null || i < cursor);
		return { letters: sorted.slice(0, size).map((i) => item(i)), server_now: now() };
	};
	return state;
}

try {
	const { LettersFeed } = await vite.ssrLoadModule('/src/lib/letters/feed.svelte.ts');
	const { ReplySeeker } = await vite.ssrLoadModule('/src/lib/letters/replySeeker.svelte.ts');
	const { threadComments } = await vite.ssrLoadModule('/src/lib/letters/api.ts');

	console.log('\n[1] 피드 — 첫 페이지 · 더 불러오기');
	{
		const srv = fakeServer(Array.from({ length: 45 }, (_, i) => i + 1)); // 1..45
		const feed = new LettersFeed(srv.fetch);
		await feed.refresh();
		check('첫 페이지 20개, 최신부터', feed.letters.length === 20 && feed.letters[0].id === 45 && feed.letters[19].id === 26);
		check('아직 끝이 아니다', feed.ended === false && feed.loaded === true);
		await feed.loadMore();
		check('더 불러오면 그 아래 20개가 붙는다', feed.letters.length === 40 && feed.letters[39].id === 6);
		await feed.loadMore();
		check('마지막 페이지(5개) 뒤에는 끝', feed.letters.length === 45 && feed.ended === true);
		const before = srv.calls;
		await feed.loadMore();
		check('끝난 뒤에는 서버를 다시 부르지 않는다', srv.calls === before);
		const ids = feed.letters.map((l) => l.id);
		check('중복 없음', new Set(ids).size === ids.length);
	}

	console.log('\n[2] ★ 피드 — 새로고침은 위에 붙이고 아래 페이지는 지킨다');
	{
		const srv = fakeServer(Array.from({ length: 45 }, (_, i) => i + 1));
		const feed = new LettersFeed(srv.fetch);
		await feed.refresh();
		await feed.loadMore(); // 40개 보는 중
		srv.ids.push(46, 47); // 새 편지 두 통
		srv.ids = srv.ids.filter((i) => i !== 44); // 첫 페이지 범위의 편지 하나가 지워짐
		await feed.refresh();
		check('새 편지가 맨 위', feed.letters[0].id === 47 && feed.letters[1].id === 46);
		check('지워진 편지는 사라진다', !feed.letters.some((l) => l.id === 44));
		check('★ 스크롤해서 불러온 아래쪽 글은 그대로 남는다', feed.letters.some((l) => l.id === 6) && feed.letters.length === 41);
		const ids = feed.letters.map((l) => l.id);
		check('순서가 최신→과거로 유지', ids.every((v, i) => i === 0 || ids[i - 1] > v));

		srv.fail = true;
		await feed.refresh();
		check('네트워크 오류면 보던 목록을 그대로 둔다', feed.letters.length === 41);
		srv.fail = false;
		feed.remove(47);
		check('지운 글은 폴링 전에 바로 빠진다', !feed.letters.some((l) => l.id === 47));
	}

	console.log('\n[3] 피드 — 멈춘 뒤에는 늦게 온 응답을 버린다');
	{
		let release;
		const slow = () => new Promise((r) => (release = () => r({ letters: [item(1)], server_now: now() })));
		const feed = new LettersFeed(slow);
		feed.start();
		feed.stop();
		release();
		await sleep(10);
		check('stop 이후 도착한 응답은 반영하지 않는다', feed.letters.length === 0 && feed.loaded === false);
		check('stop 하면 가시성 리스너도 떼어 낸다', listeners.size === 0);
	}

	console.log('\n[4] ★ 답장할 편지 받기 — 폴링 상태 기계');
	{
		const replies = [
			{ status: 'waiting', reason: 'empty', poll_ms: 20 },
			{ status: 'waiting', reason: 'filtered', poll_ms: 20 },
			{ status: 'assigned', letter_id: 77, expires_at: now() }
		];
		let calls = 0;
		let assigned = null;
		const seeker = new ReplySeeker(
			async () => replies[Math.min(calls++, replies.length - 1)],
			(id) => (assigned = id),
			() => {}
		);
		seeker.start();
		await sleep(5);
		check('누르면 바로 한 번 묻는다', calls === 1 && seeker.reason === 'empty');
		await sleep(30);
		check('기다리라면 서버가 준 간격 뒤에 다시 묻는다', calls === 2 && seeker.reason === 'filtered');
		await sleep(30);
		check('배정되면 그 편지로 가고 찾기를 멈춘다', assigned === 77 && seeker.seeking === false);
		await sleep(40);
		check('멈춘 뒤에는 더 묻지 않는다', calls === 3);
	}

	console.log('\n[5] 답장할 편지 받기 — 백그라운드 · 취소 · 오류');
	{
		let calls = 0;
		const seeker = new ReplySeeker(
			async () => (calls++, { status: 'waiting', reason: 'empty', poll_ms: 20 }),
			() => {},
			() => {}
		);
		seeker.start();
		await sleep(5);
		setVisible(false);
		const hiddenAt = calls;
		await sleep(60);
		check('★ 화면이 꺼져 있으면 묻지 않는다', calls === hiddenAt);
		setVisible(true);
		await sleep(5);
		check('화면이 켜지면 바로 다시 묻는다', calls === hiddenAt + 1);
		seeker.cancel();
		const c = calls;
		await sleep(50);
		check('그만 찾기 → 폴링 중단', calls === c && seeker.seeking === false);

		let stopped = '';
		const s2 = new ReplySeeker(async () => ({ status: 'not_eligible' }), () => {}, (m) => (stopped = m));
		s2.start();
		await sleep(5);
		check('정지 계정이면 멈추고 안내', s2.seeking === false && stopped.length > 0);

		let n = 0;
		const s3 = new ReplySeeker(
			async () => {
				n++;
				throw new Error('network');
			},
			() => {},
			() => {}
		);
		s3.start();
		await sleep(5);
		check('네트워크 오류여도 찾기는 계속된다 (잠시 뒤 재시도)', n === 1 && s3.seeking === true);
		s3.cancel();
	}

	console.log('\n[6] 댓글 묶기 — 딱 두 단계');
	{
		const c = (id, parent_id) => ({ id, parent_id, body: `c${id}`, hidden: null });
		const t = threadComments([c(1, null), c(2, 1), c(3, null), c(4, 1), c(5, 3), c(6, 99)]);
		check('최상위 댓글 두 개', t.length === 2 && t[0].id === 1 && t[1].id === 3);
		check('대댓글은 부모 아래, 순서 유지', t[0].replies.map((r) => r.id).join() === '2,4' && t[1].replies[0].id === 5);
		check('부모가 없는 대댓글은 버린다', !JSON.stringify(t).includes('"id":6'));
	}
} catch (e) {
	fail++;
	console.error(e);
} finally {
	await vite.close();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
