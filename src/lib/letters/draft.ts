import { draftStore } from '$lib/draft';
import type { LetterFmt } from './rich';

/**
 * 편지 자동 초안 (G5.5, 저장 규칙은 lib/draft.ts) — 대상별: 새 편지는 받는 사람(`to:<id>`), 답장은 그 편지(`re:<id>`).
 * 본문이 비었으면 지운다. 보내면 그 초안을 지운다 (EnvelopeCompose).
 */
export type LetterDraft = { body: string; fmt: LetterFmt | null; nick: string };

const isLetter = (x: unknown): x is LetterDraft => {
	const d = x as LetterDraft | null;
	return typeof d?.body === 'string' && typeof d.nick === 'string' && (d.fmt === null || typeof d.fmt === 'object');
};

export const letterDrafts = draftStore<LetterDraft>('letter', isLetter, (d) => !d.body.trim());
