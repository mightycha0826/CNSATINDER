import { fail } from '@sveltejs/kit';
import { adminRpc, supabaseAdmin } from '$lib/server/supabaseAdmin';
import { friendly, guard } from '$lib/server/adminAuth';
import { deliver, type PushNote } from '$lib/server/pushSend';
import type { BadgeAdminRow, BadgeRequestRow } from '$lib/adminTypes';
import type { Actions, PageServerLoad } from './$types';

/**
 * 뱃지 요청 (Phase 84) — 학생이 앱에서 보낸 CNSA 뱃지 사진(뱃지 + 학번 · 이름) · 동아리 기장 제출(부원 학번) · 새 뱃지 요청.
 * 학번 · 이름 · 사진이 보이므로 관리자(identity)만 — 목록을 열면 열람 기록에 남는다 (DB).
 * 사진은 비공개 버킷(badge-proofs)에서 10분짜리 서명 주소로만 보여 주고, 승인 · 반려하면 파일을 지운다.
 * 결과는 그 학생에게 개인 공지(하트 · 공지 · 푸시)로 간다.
 */
const BUCKET = 'badge-proofs';
const CODE = /^[a-z_]{1,40}$/;

export const load: PageServerLoad = async ({ url, locals }) => {
	guard(locals, url); // 관리자 (identity)
	const done = url.searchParams.get('tab') === 'done';
	const staff = locals.staff!.id;
	const [items, badges] = await Promise.all([
		adminRpc<BadgeRequestRow[]>('admin_badge_requests', { p_staff: staff, p_pending: !done }),
		adminRpc<BadgeAdminRow[]>('admin_badges', { p_staff: staff })
	]);
	// 사진 — 서명 주소 (10분). 실패하면 사진 없이
	const paths = items.flatMap((r) => r.photos);
	const urls: Record<string, string> = {};
	if (paths.length) {
		const { data } = await supabaseAdmin().storage.from(BUCKET).createSignedUrls(paths, 600);
		for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
	}
	return { done, items, urls, badges: badges.filter((b) => b.category === 'cnsa') };
};

export const actions: Actions = {
	decide: async ({ request, locals, platform }) => {
		const f = await request.formData();
		const id = Number(f.get('id'));
		const ok = f.get('ok') === '1';
		const note = String(f.get('note') ?? '').trim();
		const raw = String(f.get('code') ?? '');
		const code = CODE.test(raw) ? raw : null;
		if (!Number.isSafeInteger(id) || id < 1) return fail(400, { error: '잘못된 요청' });
		if (note.length > 500) return fail(400, { error: '메모는 500자까지' });
		let r: { status: string; given: number; missing: number[]; photos: string[]; notice: number };
		try {
			r = await adminRpc('admin_badge_request_decide', { p_staff: locals.staff!.id, p_id: id, p_ok: ok, p_note: note, p_code: code });
		} catch (e) {
			const msg = String((e as Error)?.message ?? e);
			if (msg.includes('need_code')) return fail(400, { error: '줄 뱃지를 골라 주세요 · 앱에 없는 동아리면 뱃지를 먼저 만들어야 해요' });
			if (msg.includes('already_decided')) return fail(400, { error: '이미 결정한 요청' });
			if (msg.includes('request_not_found')) return fail(400, { error: '거둔 요청' });
			return friendly(e);
		}
		// 사진 지우기 · 알림은 실패해도 결정은 이미 됐다
		if (r.photos?.length) await supabaseAdmin().storage.from(BUCKET).remove(r.photos).catch(() => null);
		const p = await adminRpc<{ skip: string } | Omit<PushNote, 'kind'>>('personal_notice_push', { p_id: r.notice }).catch(() => ({ skip: 'error' }));
		if (!('skip' in p)) await deliver({ ...p, kind: 'notice' }, platform).catch(() => null);
		if (!ok) return { done: '반려했어요 · 학생에게 알렸어요' };
		return {
			done: [r.given ? `${r.given}명에게 뱃지를 줬어요` : '승인했어요', r.missing?.length ? `못 찾은 학번 ${r.missing.join(', ')}` : '', '학생에게 알렸어요']
				.filter(Boolean)
				.join(' · ')
		};
	}
};
