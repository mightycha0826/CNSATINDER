import { onDestroy } from 'svelte';
import { accountIsCurrent, accountToken } from '../accountScope';
import { backClose, historySettled } from '../overlay.svelte';
import { errMsg } from '../errors';
import { toast } from '../toast.svelte';
import { deleteLetters, folderError, type Box, type MailItem } from './api';

/** 보관함과 폴더에서 쓰는 편지 선택. 시트를 먼저 닫은 뒤 선택 기록을 걷는다. */
export class MailSelection {
	active = $state(false);
	picked = $state<number[]>([]);
	dialog = $state<'folder' | 'delete' | null>(null);
	deleting = $state(false);
	private account = accountToken();
	private alive = true;
	private revision = 0;
	private onRemoved: (ids: number[]) => void;

	constructor(onRemoved: (ids: number[]) => void) {
		this.onRemoved = onRemoved;
		onDestroy(() => (this.alive = false));
		backClose(() => this.stop(), { open: () => this.active });
	}

	private current() {
		return this.alive && accountIsCurrent(this.account);
	}

	start() {
		this.revision++;
		this.active = true;
	}

	stop() {
		this.revision++;
		this.active = false;
		this.picked = [];
		this.dialog = null;
	}

	toggle(item: MailItem, box: Box) {
		if ((item.box ?? box) === 'received' && !item.opened) return toast('봉투를 열어 본 편지만 선택할 수 있어요');
		this.picked = this.picked.includes(item.id) ? this.picked.filter((id) => id !== item.id) : [...this.picked, item.id];
	}

	/** 폴더 시트가 완료됐을 때. 선택한 통수는 시트가 닫히기 전에 기억한다. */
	async complete(after: (ids: number[]) => void) {
		await this.finish([...this.picked], this.revision, after);
	}

	private async finish(ids: number[], revision: number, after: (ids: number[]) => void) {
		if (!this.current()) return;
		if (revision === this.revision) {
			this.dialog = null;
			await historySettled();
			if (!this.current()) return;
			if (revision === this.revision) this.stop();
		}
		after(ids);
	}

	async remove() {
		if (this.deleting || !this.picked.length || !this.current()) return;
		const ids = [...this.picked];
		const revision = this.revision;
		this.deleting = true;
		try {
			const result = await deleteLetters(ids);
			if (!this.current()) return;
			const error = folderError(result);
			if (error) return toast(error);
			await this.finish(ids, revision, (removed) => {
				this.onRemoved(removed);
				toast(`편지 ${result.status === 'ok' ? result.moved : removed.length}통을 삭제했어요`);
			});
		} catch (error) {
			if (this.current()) toast(errMsg(error));
		} finally {
			this.deleting = false;
		}
	}
}
