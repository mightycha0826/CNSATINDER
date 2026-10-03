import { onDestroy } from 'svelte';
import { accountIsCurrent, accountToken } from '../accountScope';
import { errMsg } from '../errors';
import { fetchFolder, type Box, type MailItem } from './api';
import { PAGE } from './mailbox.svelte';

/** 폴더 한 개의 목록·총수. 다른 폴더나 계정으로 넘어간 뒤 도착한 응답은 버린다. */
export class FolderMailbox {
	name = $state('');
	items = $state<MailItem[]>([]);
	loaded = $state(false);
	gone = $state(false);
	more = $state(false);
	busy = $state(false);
	error = $state<string | null>(null);
	counts = $state({ received: 0, sent: 0 });
	private id: number | null = null;
	private request = 0;
	private account = accountToken();
	private alive = true;
	private failedMore = false;

	constructor() {
		onDestroy(() => (this.alive = false));
	}

	private current(request: number) {
		return this.alive && accountIsCurrent(this.account) && request === this.request;
	}

	isCurrent(id: number) {
		return this.current(this.request) && this.id === id;
	}

	async load(id: number) {
		if (!this.alive || !accountIsCurrent(this.account)) return;
		const request = ++this.request;
		this.id = id;
		this.name = '';
		this.items = [];
		this.counts = { received: 0, sent: 0 };
		this.loaded = false;
		this.gone = false;
		this.more = false;
		this.busy = false;
		this.error = null;
		this.failedMore = false;
		return this.loadPage(id, request);
	}

	retry() {
		if (this.failedMore) return this.loadMore();
		if (this.id !== null) return this.load(this.id);
	}

	async loadMore() {
		const before = this.items.at(-1)?.id;
		if (before === undefined || this.id === null || this.busy || !this.current(this.request)) return;
		return this.loadPage(this.id, this.request, before);
	}

	private async loadPage(id: number, request: number, before?: number) {
		const append = before !== undefined;
		this.busy = append;
		this.error = null;
		try {
			const result = await fetchFolder(id, before);
			if (!this.current(request)) return;
			if (!append) {
				if (!result.folder) { this.gone = true; return; }
				this.name = result.folder.name;
				const count = (box: Box) => result.letters.filter((item) => item.box === box).length;
				this.counts = {
					received: result.folder.received ?? count('received'),
					sent: result.folder.sent ?? count('sent')
				};
			}
			const existing = new Set(append ? this.items.map((item) => item.id) : []);
			this.items = append ? [...this.items, ...result.letters.filter((item) => !existing.has(item.id))] : result.letters;
			this.more = result.letters.length === PAGE;
			this.failedMore = false;
		} catch (error) {
			if (this.current(request)) {
				this.error = errMsg(error);
				this.failedMore = append;
			}
		} finally {
			if (this.current(request)) {
				this.busy = false;
				if (!append) this.loaded = true;
			}
		}
	}

	/** 편지가 폴더에서 나가거나 줄기가 지워졌다. 불러온 목록과 서버 총수를 함께 줄인다. */
	drop(out: (item: MailItem) => boolean) {
		const kept: MailItem[] = [];
		for (const item of this.items) {
			if (out(item)) {
				const box = item.box === 'sent' ? 'sent' : 'received';
				this.counts[box] = Math.max(0, this.counts[box] - 1);
			} else kept.push(item);
		}
		this.items = kept;
	}
}
