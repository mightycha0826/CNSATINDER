import { supabase } from './supabase';

type MatchRes =
	| { status: 'matched'; room_id: string }
	| { status: 'waiting'; reason: 'empty' | 'filtered'; poll_ms?: number }
	| { status: 'busy' | 'retry' | 'cooldown'; retry_after_ms?: number }
	| { status: 'not_eligible' }
	| { status: 'full'; max: number }
	| { status: 'service_closed'; notice?: string };

/**
 * 상대 찾기.
 *
 * 대기 중에는 웹소켓을 쓰지 않고 request_match() 를 몇 초마다 다시 부른다.
 * 이 한 번의 호출이 '나 아직 찾는 중' 갱신 + 매칭 시도 + 누가 나를 이미 잡아갔는지 확인을 모두 한다.
 *
 * ★ 앱이 백그라운드로 가면 폴링을 멈춘다 → seek_ttl_sec 안에 서버 풀에서 자동으로 빠진다.
 *   폰을 내려놓은 사람에게 매칭이 가서 상대의 시간을 허비하는 일을 막는다.
 */
export class Seeker {
	seeking = $state(false);
	reason = $state<'empty' | 'filtered' | 'cooldown' | null>(null);
	since = $state(0);

	#timer: ReturnType<typeof setTimeout> | null = null;
	#inflight = false;
	#onVis = () => {
		if (this.seeking && document.visibilityState === 'visible') this.#schedule(0);
	};

	constructor(
		private onMatched: (roomId: string) => void,
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

	/** 사용자가 그만 찾기를 눌렀거나 화면을 떠날 때 */
	cancel() {
		if (!this.seeking) return;
		this.#halt();
		void supabase.rpc('stop_seeking');
	}

	#halt() {
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
		// 백그라운드에서는 부르지 않는다 — 풀에서 자연스럽게 빠지게 둔다
		if (document.visibilityState !== 'visible') return;

		this.#inflight = true;
		let res: MatchRes | null = null;
		try {
			const { data, error } = await supabase.rpc('request_match');
			if (!error) res = data as MatchRes;
		} finally {
			this.#inflight = false;
		}
		if (!this.seeking) return;

		if (!res) {
			this.#schedule(3000 + Math.random() * 1000); // 네트워크 오류 — 조금 쉬었다가
			return;
		}
		switch (res.status) {
			case 'matched':
				this.#halt();
				navigator.vibrate?.(60);
				this.onMatched(res.room_id);
				return;
			case 'waiting':
				this.reason = res.reason;
				// 지터 — 여러 명의 폴링이 같은 순간에 몰리지 않게
				this.#schedule((res.poll_ms ?? 4000) + Math.random() * 600);
				return;
			case 'busy':
			case 'retry':
				// 다른 사람의 매칭이 락을 잡고 있다 — 곧바로 다시
				this.#schedule((res.retry_after_ms ?? 300) + Math.random() * 400);
				return;
			case 'cooldown':
				// 넘기기를 너무 빨리 반복했다 — 잠깐 쉬었다가. 그동안에도 서버 풀에는 남아 있어 잡힐 수는 있다.
				this.reason = 'cooldown';
				this.#schedule(Math.min(res.retry_after_ms ?? 5000, 4000) + Math.random() * 400);
				return;
			case 'full':
				// 동시 대화 상한 — 하나를 끝내야 새로 찾을 수 있다
				this.#halt();
				this.onStopped(`대화는 동시에 ${res.max}개까지 할 수 있어요`);
				return;
			case 'not_eligible':
				this.#halt();
				this.onStopped('지금은 대화를 시작할 수 없는 계정이에요');
				return;
			case 'service_closed':
				this.#halt();
				this.onStopped(res.notice || '지금은 열려 있지 않아요');
				return;
		}
	}
}
