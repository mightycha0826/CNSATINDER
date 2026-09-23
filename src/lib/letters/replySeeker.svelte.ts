import { PollSeeker } from '../pollSeeker.svelte';
import type { ReplyTaskResult } from './types';

type RequestTask = () => Promise<ReplyTaskResult>;

/**
 * "답장할 편지 받기" — 채팅 Seeker 와 같은 폴링 상태 기계(PollSeeker).
 *
 * 채팅은 "서로가 서로를 찾는" 풀이라 떠날 때 서버에서 빠져야 하지만(stop_seeking),
 * 여기는 내가 큐에서 편지를 "당겨 오는" 구조라 서버에 남는 "찾는 중" 상태가 없다.
 * → 그만 찾기는 로컬 타이머만 멈추면 끝.
 */
export class ReplySeeker extends PollSeeker<ReplyTaskResult> {
	constructor(
		private requestTask: RequestTask,
		private onAssigned: (letterId: number) => void,
		onStopped: (message: string) => void
	) {
		super(onStopped);
	}

	protected request() {
		return this.requestTask();
	}

	protected handle(res: ReplyTaskResult | null) {
		if (!res) return this.schedule(4000, 1000);
		switch (res.status) {
			case 'assigned':
				this.halt();
				this.onAssigned(res.letter_id);
				return;
			case 'waiting':
				this.reason = res.reason;
				return this.schedule(res.poll_ms ?? 12_000, 1000);
			case 'cooldown':
				this.reason = 'cooldown';
				return this.schedule(Math.min(res.retry_after_ms ?? 5000, 10_000), 500);
			case 'not_eligible':
				return this.stop('지금은 편지를 받을 수 없는 계정입니다');
			case 'service_closed':
				return this.stop(res.notice || '지금은 열려 있지 않아요');
		}
	}
}
