import { supabase } from './supabase';

/**
 * 공지사항 — 종 아이콘의 빨간 점과 /notices 화면이 같이 쓴다.
 * 어디까지 봤는지(lastSeen)는 서버가 계정에 저장한다 (폰을 바꿔도 이미 본 공지에 점이 다시 뜨지 않게).
 */
export type Notice = { id: number; title: string; body: string; created_at: string };

export const NOTICES = $state({
	list: [] as Notice[],
	lastSeen: 0,
	loaded: false
});

/** 아직 안 본 공지가 있는가 (= 빨간 점) */
export const hasNewNotice = () => (NOTICES.list[0]?.id ?? 0) > NOTICES.lastSeen;

export async function loadNotices() {
	const { data, error } = await supabase.rpc('my_notices');
	const d = data as { notices?: Notice[]; last_seen?: number } | null;
	// 모양이 다르면(아직 schema.sql 을 반영하지 않은 DB 등) 조용히 넘어간다 — 종만 점 없이 보인다
	if (error || !Array.isArray(d?.notices)) return;
	NOTICES.list = d.notices.map((n) => ({ ...n, id: Number(n.id) }));
	NOTICES.lastSeen = Number(d.last_seen);
	NOTICES.loaded = true;
}

/** 공지 화면을 열면 — 맨 위(최신) 공지까지 본 것으로 */
export async function markNoticesSeen() {
	const top = NOTICES.list[0]?.id ?? 0;
	if (top <= NOTICES.lastSeen) return;
	NOTICES.lastSeen = top; // 점은 바로 끈다. 저장이 실패하면 다음 불러오기 때 다시 뜬다.
	await supabase.rpc('mark_notices_seen', { p_id: top });
}
