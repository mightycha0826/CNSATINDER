import { error, fail } from '@sveltejs/kit';
import { adminRpc } from '$lib/server/supabaseAdmin';
import { friendly, isAdmin, revealIdentity, runSanction, studentLabels } from '$lib/server/adminAuth';
import type { PersonalNoticeRow, UserDetail, UserLetterRow, UserRoomRow } from '$lib/adminTypes';
import { deliver, type PushNote } from '$lib/server/pushSend';
import type { Actions, PageServerLoad } from './$types';

async function detail(id: string, staff: string) {
	const d = await adminRpc<UserDetail | null>('admin_user', { p_user: id, p_staff: staff });
	if (!d) error(404, '계정을 찾을 수 없습니다');
	return d;
}

// ★ load 에는 이메일이 없다. 이메일·편지 활동은 아래 액션으로만, 기록과 함께 나간다.
export const load: PageServerLoad = async ({ params, locals }) => {
	const staff = locals.staff!.id;
	const [d, rooms, notices] = await Promise.all([
		detail(params.id, staff),
		isAdmin(locals)
			? adminRpc<UserRoomRow[]>('admin_user_rooms', { p_user: params.id, p_staff: staff })
			: Promise.resolve(null),
		adminRpc<PersonalNoticeRow[]>('admin_personal_notices', { p_staff: staff, p_user: params.id }).catch(() => [] as PersonalNoticeRow[])
	]);
	const students = await studentLabels(locals, [params.id, ...(rooms ?? []).map((r) => r.partner_id)]);
	return { d, rooms, students, notices };
};

export const actions: Actions = {
	identity: async ({ params, locals }) => {
		if (!isAdmin(locals)) return fail(403, { error: '이메일 확인은 관리자만 가능' });
		await detail(params.id, locals.staff!.id);
		const [who] = await revealIdentity(locals, [params.id], null);
		return { email: who.email ?? '(탈퇴)', name: who.name };
	},

	letters: async ({ params, locals }) => {
		if (!isAdmin(locals)) return fail(403, { error: '편지 활동은 관리자만 확인 가능' });
		const letters = await adminRpc<UserLetterRow[]>('admin_user_letters', {
			p_user: params.id,
			p_staff: locals.staff!.id
		});
		return { letters };
	},

	// 개인 공지 (Phase 35) — 이 학생에게만 (경고 · 개인 연락). 학생 앱의 공지 · 알림(하트)에 뜨고 푸시도 간다. 운영진 누구나, 기록에 남는다
	notify: async ({ params, request, locals, platform }) => {
		const f = await request.formData();
		const kind = f.get('kind') === 'warning' ? 'warning' : 'message';
		const title = String(f.get('title') ?? '').trim();
		const body = String(f.get('body') ?? '').trim();
		if (!title) return fail(400, { error: '제목을 적어 주세요' });
		if (title.length > 80) return fail(400, { error: '제목은 80자까지' });
		if (body.length > 2000) return fail(400, { error: '내용은 2000자까지' });
		let id: number;
		try {
			id = await adminRpc<number>('admin_send_personal_notice', { p_staff: locals.staff!.id, p_user: params.id, p_kind: kind, p_title: title, p_body: body });
		} catch (e) {
			return friendly(e);
		}
		// 알림은 실패해도 공지는 이미 갔다 — 기다리지 않는다
		const p = await adminRpc<{ skip: string } | Omit<PushNote, 'kind'>>('personal_notice_push', { p_id: id }).catch(() => ({ skip: 'error' }));
		if (!('skip' in p)) await deliver({ ...p, kind: 'notice' }, platform).catch(() => null);
		return { done: kind === 'warning' ? '경고 공지를 보냈어요' : '개인 공지를 보냈어요' };
	},

	unnotify: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		if (!Number.isSafeInteger(id) || id < 1) return fail(400, { error: '잘못된 공지' });
		try {
			await adminRpc('admin_remove_personal_notice', { p_staff: locals.staff!.id, p_id: id });
		} catch (e) {
			return friendly(e);
		}
		return { done: '개인 공지를 거뒀어요' };
	},

	sanction: async ({ params, request, locals }) => {
		await detail(params.id, locals.staff!.id);
		const res = await runSanction(locals, params.id, await request.formData(), null);
		if (typeof res !== 'string') return res;
		return { done: '조치 완료' };
	}
};
