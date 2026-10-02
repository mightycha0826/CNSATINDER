import { fail } from '@sveltejs/kit';
import { adminRpc } from '$lib/server/supabaseAdmin';
import { friendly, guard, isAdmin, studentLabels } from '$lib/server/adminAuth';
import { badgeCode } from '$lib/server/adminForms';
import type { BadgeAdminRow, BadgeHolderRow, UserRow } from '$lib/adminTypes';
import type { Actions, PageServerLoad } from './$types';

/**
 * 뱃지 (Phase 71) — 운영진이 주는 뱃지(특별 · CNSA)를 뱃지마다 여러 학생에게 한 번에 주고 거둔다.
 * 예전엔 학생 상세 화면에서 한 명씩. 찾기는 사용자 화면과 같은 검색(익명 이름 · ID 앞자리),
 * 학번 목록으로 주기는 학생 신원이라 관리자만. 주고 거둔 것은 학생마다 활동 기록에 남는다 (DB).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const load: PageServerLoad = async ({ url, locals }) => {
	guard(locals, url); // 운영자 · 관리자 (moderate)
	const staff = locals.staff!.id;
	const badges = await adminRpc<BadgeAdminRow[]>('admin_badges', { p_staff: staff });
	const want = url.searchParams.get('code') ?? '';
	const code = badges.some((b) => b.code === want) ? want : (badges[0]?.code ?? '');
	const q = url.searchParams.get('q')?.trim().slice(0, 80) ?? null;
	const [holders, results] = await Promise.all([
		code ? adminRpc<BadgeHolderRow[]>('admin_badge_holders', { p_staff: staff, p_code: code }) : Promise.resolve([] as BadgeHolderRow[]),
		// 이메일 검색은 사용자 화면에서만 — 여기서는 익명 이름 · ID 앞자리
		q === null || q.includes('@')
			? Promise.resolve(null)
			: adminRpc<UserRow[]>('admin_find_users', { p_query: q, p_filter: 'all', p_staff: staff, p_limit: 100 })
	]);
	const students = await studentLabels(locals, [...holders.map((h) => h.id), ...(results ?? []).map((u) => u.id)]);
	return { badges, code, holders, q, results, students };
};

/** 폼의 학생 id 들 (같은 사람은 한 번만) */
const usersOf = (f: FormData) => [...new Set(f.getAll('user').map(String).filter((u) => UUID.test(u)))];

/** 주기와 거두기는 같은 학생 선택·RPC를 쓰고, 성공 안내만 다르다. */
function selectedBadgeAction(on: boolean): Actions[string] {
	return async ({ request, locals }) => {
		const f = await request.formData();
		const code = badgeCode(f);
		const users = usersOf(f);
		if (!code) return fail(400, { error: '잘못된 뱃지' });
		if (!users.length) return fail(400, { error: on ? '줄 학생을 골라 주세요' : '거둘 학생을 골라 주세요' });
		try {
			const n = await adminRpc<number>('admin_set_badge_many', { p_staff: locals.staff!.id, p_code: code, p_users: users, p_on: on });
			return {
				done: !on
					? `${n}명에게서 거뒀어요`
					: n === users.length ? `${n}명에게 줬어요` : `${n}명에게 줬어요 · ${users.length - n}명은 이미 가졌어요`
			};
		} catch (e) {
			return friendly(e);
		}
	};
}

export const actions: Actions = {
	// 고른 학생 여럿에게 주기 · 거두기
	give: selectedBadgeAction(true),
	take: selectedBadgeAction(false),

	// 학번 목록으로 주기 — 관리자만 (DB 도 막는다). 쉼표 · 띄어쓰기 · 줄바꿈 어느 것으로 나눠도 된다
	nos: async ({ request, locals }) => {
		if (!isAdmin(locals)) return fail(403, { error: '학번으로 주기는 관리자만 가능' });
		const f = await request.formData();
		const code = badgeCode(f);
		if (!code) return fail(400, { error: '잘못된 뱃지' });
		const nos = [...new Set((String(f.get('nos') ?? '').match(/\d{4,9}/g) ?? []).map(Number))];
		if (!nos.length) return fail(400, { error: '학번을 적어 주세요' });
		try {
			const r = await adminRpc<{ given: number; found: number; missing: number[] }>('admin_grant_badge_by_no', { p_staff: locals.staff!.id, p_code: code, p_nos: nos });
			const had = r.found - r.given;
			return {
				done: [`${r.given}명에게 줬어요`, had ? `${had}명은 이미 가졌어요` : '', r.missing.length ? `못 찾은 학번 ${r.missing.length}개` : ''].filter(Boolean).join(' · '),
				missing: r.missing
			};
		} catch (e) {
			return friendly(e);
		}
	},

	// 학교 인증 · 시작하기를 마친 학생 모두에게
	all: async ({ request, locals }) => {
		const code = badgeCode(await request.formData());
		if (!code) return fail(400, { error: '잘못된 뱃지' });
		try {
			const n = await adminRpc<number>('admin_grant_badge_all', { p_staff: locals.staff!.id, p_code: code });
			return { done: n ? `${n}명에게 줬어요` : '이미 모두 가졌어요' };
		} catch (e) {
			return friendly(e);
		}
	}
};
