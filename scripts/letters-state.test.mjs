import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';

// 실제 편지 상태 모듈을 컴파일한다. RPC·시트 기록·컴포넌트 수명만 가짜로 바꿔 외부 서버 없이 검사한다.
const root = fileURLToPath(new URL('..', import.meta.url));
const files = [];
const urls = new Map();
let passed = 0;
function write(name, source) {
	const path = root + 'scripts/.letters-' + name + '.tmp.mjs';
	writeFileSync(path, source);
	files.push(path);
	const url = pathToFileURL(path).href;
	urls.set(name, url);
	return url;
}
function build(path, name, imports = {}) {
	let source = stripTypeScriptTypes(readFileSync(root + path, 'utf8'));
	for (const [specifier, target] of Object.entries(imports)) source = source.replaceAll("'" + specifier + "'", JSON.stringify(urls.get(target)));
	return write(name, path.endsWith('.svelte.ts') ? compileModule(source, { generate: 'client', filename: path, dev: false }).js.code : source);
}
function check(name, test) {
	assert.ok(test, name);
	passed++;
	console.log('  PASS  ' + name);
}
const drain = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

try {
	build('src/lib/accountScope.ts', 'scope');
	build('src/lib/errors.ts', 'errors');
	write('lifecycle', 'export const cleanups = []; export const onDestroy = (fn) => cleanups.push(fn);');
	write('toast', 'export const toasts = []; export const toast = (message) => toasts.push(message);');
	write('overlay', [
		'export const backs = [], settling = [];',
		'export const backClose = (close, opts) => backs.push({close, ...opts});',
		'export const historySettled = () => new Promise(resolve => settling.push(resolve));'
	].join('\n'));
	write('api', [
		'export const pending = [];',
		'const ask = (kind, args) => new Promise((resolve, reject) => pending.push({kind, args, resolve, reject}));',
		'export const fetchMailbox = (box, before) => ask("box", {box, before});',
		'export const fetchFolder = (id, before) => ask("folder", {id, before});',
		'export const fetchUnread = () => ask("unread", {});',
		'export const deleteLetters = (ids) => ask("delete", {ids});',
		'export const folderError = (result) => result.status === "ok" ? null : "다시 시도해 주세요";'
	].join('\n'));
	build('src/lib/letters/unread.svelte.ts', 'unread', { './api': 'api', '../accountScope': 'scope' });
	build('src/lib/letters/mailbox.svelte.ts', 'mailbox', {
		'./api': 'api', './unread.svelte': 'unread', '../accountScope': 'scope', '../errors': 'errors'
	});
	build('src/lib/letters/folder.svelte.ts', 'folder', {
		'svelte': 'lifecycle', '../accountScope': 'scope', '../errors': 'errors', './api': 'api', './mailbox.svelte': 'mailbox'
	});
	build('src/lib/letters/selection.svelte.ts', 'selection', {
		'svelte': 'lifecycle', '../accountScope': 'scope', '../errors': 'errors', '../toast.svelte': 'toast', './api': 'api', '../overlay.svelte': 'overlay'
	});
	const scope = await import(urls.get('scope'));
	const { pending } = await import(urls.get('api'));
	const { cleanups } = await import(urls.get('lifecycle'));
	const { toasts } = await import(urls.get('toast'));
	const { backs, settling } = await import(urls.get('overlay'));
	const mailbox = await import(urls.get('mailbox'));
	const unread = await import(urls.get('unread'));
	const { FolderMailbox } = await import(urls.get('folder'));
	const { MailSelection } = await import(urls.get('selection'));
	const take = (kind) => {
		const index = pending.findIndex((request) => request.kind === kind);
		assert.notEqual(index, -1, 'pending ' + kind);
		return pending.splice(index, 1)[0];
	};
	const mail = (id, box = 'received', opened = true) => ({ id, box, opened, thread_id: id, created_at: '2026-10-01T00:00:00Z' });
	const folderResult = (id, letters, counts = {}) => ({ letters, folder: { id, name: '폴더 ' + id, count: letters.length, ...counts } });
	const page = Array.from({ length: mailbox.PAGE }, (_, i) => mail(100 - i));
	scope.changeAccount('a');
	let finishNavigation;
	const navigation = new Promise(resolve => { finishNavigation = resolve; });
	const hand = { w: 270, top: 30, wallH: 241, count: 2 };
	mailbox.KNOCK.hand = hand;
	mailbox.KNOCK.at = performance.now() - 3000;
	check('시작하지 않은 오래된 우체통 정보는 만료', !mailbox.knockFresh());
	mailbox.holdKnock(navigation);
	check('진행 중 이동은 2초가 지나도 우체통 위치를 유지하고 한 번만 소비', mailbox.knockFresh() && mailbox.takeKnock() === hand && mailbox.takeKnock() === null);
	finishNavigation();
	await drain();
	check('이동 완료 후 우체통 정보와 진행 중 이동 정리', mailbox.KNOCK.navigation === null && mailbox.KNOCK.hand === null);
	const concurrent = Array.from({ length: 5 }, () => unread.refreshUnread());
	check('안 읽은 수 동시 조회 다섯 번은 서버 요청 한 번', pending.length === 1);
	take('unread').resolve(5);
	await Promise.all(concurrent);
	check('공유한 안 읽은 수 응답은 화면에 적용', unread.DM.loaded && unread.DM.unread === 5);
	const oldRead = unread.refreshUnread();
	const staleRead = take('unread');
	const changed = [unread.refreshUnread(true), unread.refreshUnread(true)];
	staleRead.resolve(10);
	await oldRead;
	await drain();
	check('읽기·삭제 전 응답은 무시하고 변경 후 조회를 한 번 공유', unread.DM.unread === 5 && pending.length === 1);
	take('unread').resolve(3);
	await Promise.all(changed);
	check('변경 후 조회 결과로 안 읽은 수 갱신', unread.DM.unread === 3);
	const beforeSwitch = unread.refreshUnread();
	const previousAccount = take('unread');
	const previousChange = unread.refreshUnread(true);
	scope.changeAccount('b');
	const afterSwitch = unread.refreshUnread();
	const nextAccount = take('unread');
	previousAccount.resolve(99);
	await Promise.all([beforeSwitch, previousChange]);
	const sameAccount = unread.refreshUnread();
	check('계정 전환은 이전 조회를 공유하지 않고 옛 응답도 무시', unread.DM.unread === 0 && !unread.DM.loaded && pending.length === 0);
	nextAccount.resolve(2);
	await Promise.all([afterSwitch, sameAccount]);
	const failureRead = unread.refreshUnread();
	take('unread').reject(new Error('offline'));
	await failureRead;
	const keptUnread = unread.DM.unread === 2;
	const retryRead = unread.refreshUnread();
	take('unread').resolve(1);
	await retryRead;
	check('안 읽은 수 조회 실패는 기존 값 보존 후 재시도 가능', keptUnread && unread.DM.loaded && unread.DM.unread === 1);
	scope.changeAccount('a');

	const first = mailbox.loadBox('received');
	take('box').reject(new Error('연결 실패'));
	await first;
	check('편지함 첫 조회 실패를 빈 편지와 구별', mailbox.BOX.loaded.received && mailbox.BOX.error.received === '연결 실패');
	const firstRetry = mailbox.retryBox('received');
	const firstCall = take('box');
	check('첫 조회 재시도는 첫 페이지부터', firstCall.args.before === undefined);
	firstCall.resolve({ letters: page, folders: [] });
	await firstRetry;
	check('성공한 재시도는 오류를 지우고 더보기 유지', !mailbox.BOX.error.received && mailbox.BOX.more.received);
	const extra = mailbox.loadMore('received');
	await mailbox.loadMore('received');
	check('편지함 더보기 중복 누름은 한 요청', pending.length === 1 && mailbox.BOX.busy.received);
	take('box').reject(new Error('지난 편지 연결 실패'));
	await extra;
	check('더보기 실패는 목록과 다음 페이지를 유지', mailbox.BOX.received.length === mailbox.PAGE && mailbox.BOX.more.received && !mailbox.BOX.busy.received);
	const extraRetry = mailbox.retryBox('received');
	const extraCall = take('box');
	check('더보기 실패 재시도는 마지막 편지 커서', extraCall.args.before === page.at(-1).id);
	extraCall.resolve({ letters: [page.at(-1), mail(70)], folders: null });
	await extraRetry;
	check('더보기는 겹친 편지를 한 번만 추가', mailbox.BOX.received.length === mailbox.PAGE + 1 && mailbox.BOX.received.at(-1).id === 70);
	const reloading = mailbox.loadBox('received');
	const reloadCall = take('box');
	await mailbox.loadMore('received');
	check('첫 페이지 새로 읽는 중에는 옛 커서로 더보기 하지 않음', mailbox.BOX.loading.received && pending.length === 0);
	reloadCall.resolve({ letters: page, folders: [] });
	await reloading;
	check('첫 페이지 새로 읽기가 끝나면 더보기 허용', !mailbox.BOX.loading.received && mailbox.BOX.more.received);
	const staleMore = mailbox.loadMore('received');
	const staleCall = take('box');
	const refresh = mailbox.loadBox('received');
	take('box').resolve({ letters: [mail(200)], folders: [] });
	await refresh;
	staleCall.resolve({ letters: [mail(60)], folders: null });
	await staleMore;
	check('새로 읽은 뒤 늦게 온 더보기는 무시', mailbox.BOX.received.length === 1 && mailbox.BOX.received[0].id === 200 && !mailbox.BOX.busy.received);

	const folder = new FolderMailbox();
	const loadA = folder.load(1);
	const callA = take('folder');
	const loadB = folder.load(2);
	const callB = take('folder');
	callB.resolve(folderResult(2, [mail(20, 'sent')], { received: 5, sent: 8 }));
	await loadB;
	callA.resolve(folderResult(1, [mail(10)], { received: 9, sent: 0 }));
	await loadA;
	check('폴더 이동 뒤 이전 응답이 새 폴더를 덮지 않음', folder.name === '폴더 2' && folder.items[0].id === 20 && folder.counts.sent === 8);
	check('폴더 총수는 서버가 센 아직 안 불러온 편지 포함', folder.counts.received === 5 && folder.counts.sent === 8);
	const missing = folder.load(3);
	take('folder').resolve({ letters: [], folder: null });
	await missing;
	check('없는 폴더는 없는 상태로 표시', folder.loaded && folder.gone && !folder.error);
	const failure = folder.load(4);
	take('folder').reject(new Error('폴더 연결 실패'));
	await failure;
	check('다음 폴더의 통신 실패를 없는/빈 폴더로 표시하지 않음', folder.loaded && !folder.gone && folder.error === '폴더 연결 실패');
	const folderRetry = folder.retry();
	const retryCall = take('folder');
	check('폴더 첫 페이지 재시도 대상 보존', retryCall.args.id === 4 && retryCall.args.before === undefined);
	retryCall.resolve(folderResult(4, page));
	await folderRetry;
	check('옛 서버 응답에 편지 수가 없으면 목록으로 계산', folder.counts.received === mailbox.PAGE && folder.counts.sent === 0);
	const folderMore = folder.loadMore();
	await folder.loadMore();
	check('폴더 더보기 중복 누름은 한 요청', pending.length === 1 && folder.busy);
	take('folder').reject(new Error('폴더 지난 편지 실패'));
	await folderMore;
	check('폴더 더보기 실패는 기존 목록과 커서를 보존', folder.items.length === mailbox.PAGE && folder.more && !folder.busy && !!folder.error);
	const folderMoreRetry = folder.retry();
	const folderMoreCall = take('folder');
	check('폴더 더보기 재시도도 실패한 커서 사용', folderMoreCall.args.id === 4 && folderMoreCall.args.before === page.at(-1).id);
	folderMoreCall.resolve(folderResult(4, [page.at(-1), mail(70, 'sent')]));
	await folderMoreRetry;
	check('폴더 더보기의 겹친 편지 제거', folder.items.length === mailbox.PAGE + 1 && !folder.error);
	folder.drop((item) => item.id === page[0].id || item.id === 70);
	check('폴더에서 편지를 빼면 종류별 총수도 함께 감소', folder.items.length === mailbox.PAGE - 1 && folder.counts.received === mailbox.PAGE - 1 && folder.counts.sent === 0);
	const lateFolder = folder.load(5);
	const lateFolderCall = take('folder');
	scope.changeAccount('b');
	lateFolderCall.resolve(folderResult(5, [mail(500)]));
	await lateFolder;
	check('계정 전환 뒤 늦은 폴더 응답은 데이터와 로딩 상태를 바꾸지 않음', folder.items.length === 0 && !folder.loaded);
	await folder.load(6);
	check('이전 계정 폴더 모델은 새 요청도 하지 않음', pending.length === 0);
	check('계정 전환은 편지함 오류와 처리 상태도 초기화', !mailbox.BOX.error.received && !mailbox.BOX.busy.received && !mailbox.BOX.loaded.received);
	const disposed = new FolderMailbox();
	const disposeFolder = cleanups.at(-1);
	const pendingFolder = disposed.load(6);
	disposeFolder();
	take('folder').resolve(folderResult(6, [mail(600)]));
	await pendingFolder;
	check('사라진 폴더 화면에 응답을 반영하지 않음', disposed.items.length === 0 && !disposed.loaded);

	const removed = [];
	const selection = new MailSelection((ids) => removed.push(ids));
	selection.start();
	selection.toggle(mail(1, 'received', false), 'received');
	check('안 연 받은 편지를 고르지 못하고 이유를 안내', selection.picked.length === 0 && toasts.at(-1).includes('봉투를 열어 본'));
	selection.toggle(mail(2, 'sent', false), 'received');
	check('보낸 편지는 상대 읽음과 관계없이 선택 가능', selection.picked.join() === '2');
	selection.toggle(mail(2, 'sent', false), 'received');
	selection.toggle(mail(3), 'received');
	selection.dialog = 'folder';
	const completed = [];
	const completion = selection.complete((ids) => completed.push(ids));
	check('완료는 폴더 시트부터 닫고 선택을 유지', selection.dialog === null && selection.active && selection.picked.join() === '3' && completed.length === 0);
	settling.shift()();
	await completion;
	check('시트 기록이 걷힌 뒤 선택을 닫고 목록 수정', !selection.active && !selection.picked.length && completed[0].join() === '3');
	selection.start();
	selection.toggle(mail(4), 'received');
	selection.dialog = 'delete';
	const deletion = selection.remove();
	await selection.remove();
	check('삭제 연속 누름은 한 요청', pending.length === 1 && selection.deleting);
	take('delete').resolve({ status: 'ok', moved: 1 });
	await drain();
	check('삭제 성공도 확인 시트 기록부터 걷음', selection.dialog === null && selection.active && removed.length === 0);
	settling.shift()();
	await deletion;
	check('삭제 성공 시 목록에서 선택 편지를 제거', !selection.active && removed[0].join() === '4' && !selection.deleting);
	selection.start();
	selection.toggle(mail(5), 'received');
	selection.dialog = 'delete';
	const rejected = selection.remove();
	take('delete').resolve({ status: 'not_found' });
	await rejected;
	check('삭제 거절은 선택과 확인 시트를 유지', selection.active && selection.dialog === 'delete' && selection.picked.join() === '5' && !selection.deleting);
	const failed = selection.remove();
	take('delete').reject(new Error('삭제 연결 실패'));
	await failed;
	check('삭제 통신 실패도 재시도할 선택을 보존', selection.picked.join() === '5' && toasts.at(-1) === '삭제 연결 실패');
	const cancelled = selection.remove();
	const cancelledCall = take('delete');
	selection.stop();
	selection.start();
	selection.toggle(mail(6), 'received');
	cancelledCall.resolve({ status: 'ok', moved: 1 });
	await cancelled;
	check('옛 삭제 응답은 새 선택을 닫지 않고 삭제한 편지만 반영', selection.active && selection.picked.join() === '6' && removed.at(-1).join() === '5');
	const back = backs.at(-1);
	check('선택 상태는 시스템 뒤로가기로 닫을 수 있음', back.open());
	back.close();
	check('뒤로가기는 선택과 열린 시트를 비움', !selection.active && selection.dialog === null && !selection.picked.length);
	selection.start();
	selection.toggle(mail(7), 'received');
	const oldAccountDelete = selection.remove();
	const oldAccountCall = take('delete');
	const toastCount = toasts.length;
	const removedCount = removed.length;
	scope.changeAccount('c');
	oldAccountCall.resolve({ status: 'ok', moved: 1 });
	await oldAccountDelete;
	check('계정 전환 뒤 삭제 응답은 새 계정 목록과 알림을 건드리지 않음', removed.length === removedCount && toasts.length === toastCount && !settling.length);
	const closedSelection = new MailSelection((ids) => removed.push(ids));
	const disposeSelection = cleanups.at(-1);
	closedSelection.start();
	closedSelection.toggle(mail(8), 'received');
	const abandoned = closedSelection.remove();
	disposeSelection();
	take('delete').resolve({ status: 'ok', moved: 1 });
	await abandoned;
	check('선택 화면 이탈 뒤 삭제 응답도 무시', removed.length === removedCount && toasts.length === toastCount && !settling.length);
	check('검사가 모든 가짜 요청을 정리', pending.length === 0);
} finally {
	for (const path of files) rmSync(path, { force: true });
}
console.log('\n' + passed + ' passed, 0 failed\n');
