import type { ReplyTaskResult } from './types';

type RequestTask = () => Promise<ReplyTaskResult>;

/**
 * "답장할 편지 받기" — 채팅 Seeker 와 같은 폴링 상태 기계.
 *
 * 채팅은 "서로가 서로를 찾는" 풀이라 떠날 때 서버에서 빠져야 하지만(stop_seeking),
 * 여기는 내가 큐에서 편지를 "당겨 오는" 구조라 서버에 남는 "찾는 중" 상태가 없다.
 * → 그만 찾기는 로컬 타이머만 멈추면 끝.
 */
export class ReplySeeker {
	seeking = $state(false);
	reason = $state<'empty' | 'filtered' | 'cooldown' | null>(null);
	since = $state(0);

	#timer: ReturnType<typeof setTimeout> | null = null;
	#inflight = false;
	#onVis = () => {
		if (this.seeking && document.visibilityState === 'visible') this.#schedule(0);
	};

	constructor(
		private requestTask: RequestTask,
		private onAssigned: (letterId: number) => void,
		private onStopped: (message: string) => void
	) {}

	start() {
		if (this.seeking) return;
		this.seeking = true;
		this.reason = null;
		this.since = Date.now();
		document.addEventListener('visibilitychange', this.#onVis);
		this.#schedule(0);
	}

	cancel() {
		if (!this.seeking) return;
		this.seeking = false;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		document.removeEventListener('visibilitychange', this.#onVis);
	}

	#schedule(ms: number) {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.#tick(), ms);
	}

	async #tick() {
		this.#timer = null;
		if (!this.seeking || this.#inflight) return;
		if (document.visibilityState !== 'visible') return; // 백그라운드에서는 쉰다

		this.#inflight = true;
		let res: ReplyTaskResult | null = null;
		try {
			res = await this.requestTask();
		} catch {
			res = null;
		} finally {
			this.#inflight = false;
		}
		if (!this.seeking) return;

		if (!res) {
			this.#schedule(4000 + Math.random() * 1000);
			return;
		}
		switch (res.status) {
			case 'assigned':
				this.cancel();
				this.onAssigned(res.letter_id);
				return;
			case 'waiting':
				this.reason = res.reason;
				this.#schedule((res.poll_ms ?? 12_000) + Math.random() * 1000);
				return;
			case 'cooldown':
				this.reason = 'cooldown';
				this.#schedule(Math.min(res.retry_after_ms ?? 5000, 10_000) + Math.random() * 500);
				return;
			case 'not_eligible':
				this.cancel();
				this.onStopped('지금은 편지를 받을 수 없는 계정입니다');
				return;
			case 'service_closed':
				this.cancel();
				this.onStopped(res.notice || '지금은 열려 있지 않아요');
				return;
		}
	}
}
