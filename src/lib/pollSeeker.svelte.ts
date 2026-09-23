/**
 * "찾는 중" 폴링 상태 기계 — 채팅 상대 찾기(Seeker)와 답장할 편지 받기(ReplySeeker)가 같이 쓴다.
 *
 * 웹소켓 대신 서버 함수를 몇 초마다 다시 부른다. 응답을 보고 다음 호출 시각을 정하는 건 하위 클래스(handle).
 * ★ 앱이 백그라운드로 가면 부르지 않는다 — 폰을 내려놓은 사람에게 매칭·배정이 가지 않게.
 *   화면이 다시 보이면 곧바로 한 번 부른다.
 */
export type SeekReason = 'empty' | 'filtered' | 'cooldown';

export abstract class PollSeeker<R> {
	seeking = $state(false);
	reason = $state<SeekReason | null>(null);
	since = $state(0);

	#timer: ReturnType<typeof setTimeout> | null = null;
	#inflight = false;
	#onVis = () => {
		if (this.seeking && document.visibilityState === 'visible') this.schedule(0);
	};

	/** onStopped: 더 찾을 수 없게 됐을 때(상한·이용 제한·서비스 닫힘) 사용자에게 보일 문구 */
	constructor(private onStopped: (message: string) => void) {}

	/** 서버에 한 번 묻는다. 네트워크 오류는 null. */
	protected abstract request(): Promise<R | null>;
	/** 응답을 보고 schedule(다음 ms) 또는 halt() 를 부른다. null 이면 오류 뒤 재시도. */
	protected abstract handle(res: R | null): void;

	start() {
		if (this.seeking) return;
		this.seeking = true;
		this.reason = null;
		this.since = Date.now();
		document.addEventListener('visibilitychange', this.#onVis);
		this.schedule(0);
	}

	/** 사용자가 그만 찾기를 눌렀거나 화면을 떠날 때 */
	cancel() {
		if (!this.seeking) return;
		this.halt();
	}

	/** 찾기를 멈춘다 (서버에 알리지 않음) */
	protected halt() {
		this.seeking = false;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		document.removeEventListener('visibilitychange', this.#onVis);
	}

	/** 찾기를 멈추고 이유를 알린다 */
	protected stop(message: string) {
		this.halt();
		this.onStopped(message);
	}

	/** ms 뒤에 다시 묻는다. jitter 만큼 무작위로 더 기다린다 — 여러 명의 폴링이 한 순간에 몰리지 않게. */
	protected schedule(ms: number, jitter = 0) {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.#tick(), ms + Math.random() * jitter);
	}

	async #tick() {
		this.#timer = null;
		if (!this.seeking || this.#inflight) return;
		if (document.visibilityState !== 'visible') return; // 백그라운드에서는 쉰다

		this.#inflight = true;
		let res: R | null = null;
		try {
			res = await this.request();
		} catch {
			res = null;
		} finally {
			this.#inflight = false;
		}
		if (this.seeking) this.handle(res);
	}
}
