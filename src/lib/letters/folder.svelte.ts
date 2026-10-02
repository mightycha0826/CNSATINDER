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
		try {
			const result = await fetchFolder(id);
			if (!this.current(request)) return;
			if (!result.folder) {
				this.gone = true;
				return;
			}
			this.name = result.folder.name;
			this.items = result.letters;
			this.more = result.letters.length === PAGE;
			this.failedMore = false;
			const count = (box: Box) => result.letters.filter((item) => item.box === box).length;
			this.counts = {
				received: result.folder.received ?? count('received'),
				sent: result.folder.sent ?? count('sent')
			};
		} catch (error) {
			if (this.current(request)) this.error = errMsg(error);
		} finally {
			if (this.current(request)) this.loaded = true;
		}
	}

	retry() {
		if (this.failedMore) return this.loadMore();
		if (this.id !== null) return this.load(this.id);
	}

	async loadMore() {
		const last = this.items.at(-1);
		const id = this.id;
		const request = this.request;
		if (!last || id === null || this.busy || !this.current(request)) return;
		this.busy = true;
		this.error = null;
		try {
			const result = await fetchFolder(id, last.id);
			if (!this.current(request)) return;
			const existing = new Set(this.items.map((item) => item.id));
			this.items = [...this.items, ...result.letters.filter((item) => !existing.has(item.id))];
			this.more = result.letters.length === PAGE;
			this.failedMore = false;
		} catch (error) {
			if (this.current(request)) {
				this.error = errMsg(error);
				this.failedMore = true;
			}
		} finally {
			if (this.current(request)) this.busy = false;
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
