import { whileVisible } from '../visible';
import type { LetterListItem } from './types';

type FetchFeed = (cursor: number | null) => Promise<{ letters: LetterListItem[]; server_now: string }>;

const POLL_MS = 45_000;
const PAGE_HINT = 20; // 서버 기본 페이지 크기 — 이보다 적게 오면 끝까지 온 것

/**
 * 익명편지 피드 (인스타그램 게시물 목록).
 *
 * 채팅 대화 목록(Inbox)과 달리 Realtime 채널을 열지 않는다. Inbox 는 내 방 몇 개로 좁게 걸러
 * 구독하지만, 피드는 전교생 글 전체라 넓은 구독을 붙들 이유가 적고 급하지도 않다.
 * → 45초마다 첫 페이지만 다시 읽어 위에 붙이고, 이미 불러온 아래쪽 페이지는 그대로 둔다.
 *   화면이 백그라운드면 멈추고, 돌아오면 바로 한 번 읽는다.
 */
export class LettersFeed {
	letters = $state<LetterListItem[]>([]);
	loaded = $state(false);
	loadingMore = $state(false);
	ended = $state(false);
	/** serverNow - clientNow (ms) — "3분 전" 같은 상대 시간 표시용 */
	skew = $state(0);

	#stopPoll: (() => void) | null = null;
	#stopped = false;

	constructor(private fetchFeed: FetchFeed) {}

	start() {
		this.#stopped = false;
		void this.refresh();
		this.#stopPoll = whileVisible(() => void this.refresh(), POLL_MS);
	}

	stop() {
		this.#stopped = true;
		this.#stopPoll?.();
		this.#stopPoll = null;
	}

	/** 첫 페이지를 다시 읽는다. 새 글은 위에, 이미 불러온 아래쪽 글은 유지. */
	async refresh() {
		let res;
		try {
			res = await this.fetchFeed(null);
		} catch {
			return; // 네트워크 오류 — 다음 주기에
		}
		if (this.#stopped) return;
		this.skew = Date.parse(res.server_now) - Date.now();
		const first = res.letters;
		const oldest = first.length ? first[first.length - 1].id : Infinity;
		// 첫 페이지 범위보다 오래된 글만 이어 붙인다 (그 범위 안에서 지워진 글은 사라진다)
		const rest = this.letters.filter((l) => l.id < oldest);
		this.letters = [...first, ...rest];
		if (!this.loaded) this.ended = first.length < PAGE_HINT;
		this.loaded = true;
	}

	/** 스크롤이 바닥에 닿으면 */
	async loadMore() {
		if (this.loadingMore || this.ended || !this.letters.length) return;
		this.loadingMore = true;
		try {
			const cursor = this.letters[this.letters.length - 1].id;
			const res = await this.fetchFeed(cursor);
			if (this.#stopped) return;
			const have = new Set(this.letters.map((l) => l.id));
			this.letters = [...this.letters, ...res.letters.filter((l) => !have.has(l.id))];
			if (res.letters.length < PAGE_HINT) this.ended = true;
		} catch {
			/* 다음 스크롤에 다시 */
		} finally {
			this.loadingMore = false;
		}
	}

	/** 방금 쓴 글·지운 글을 폴링을 기다리지 않고 반영 */
	remove(id: number) {
		this.letters = this.letters.filter((l) => l.id !== id);
	}
}
