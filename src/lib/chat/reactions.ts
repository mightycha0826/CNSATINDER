import { REACTION_EMOJI, type ReactionKey } from './types';

export type SeatReactions = Partial<Record<1 | 2, ReactionKey>>;

/** 말풍선 아래 표시 — 둘이 같은 공감이면 "❤️ 2". 공감이 없으면 null */
export function summarize(rx: SeatReactions | undefined) {
	const ks = [rx?.[1], rx?.[2]].filter((k): k is ReactionKey => !!k);
	if (!ks.length) return null;
	const same = ks.length === 2 && ks[0] === ks[1];
	return { emojis: (same ? [ks[0]] : ks).map((k) => REACTION_EMOJI[k]), count: same ? 2 : 0 };
}
export type ReactionSummary = NonNullable<ReturnType<typeof summarize>>;
