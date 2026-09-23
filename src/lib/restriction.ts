/**
 * 이용 제한 여부 — 영구·무기한 정지(status) 또는 기간 정지(suspended_until 이 아직 미래).
 * 학생 앱(내 계정)과 운영자 화면(사용자 목록·상세·신고)이 같은 규칙을 쓴다.
 */
export type Restrictable = { status: string; suspended_until: string | null };

export const suspendedNow = (u: Pick<Restrictable, 'suspended_until'>, now = Date.now()) =>
	!!u.suspended_until && Date.parse(u.suspended_until) > now;

export const isRestricted = (u: Restrictable, now = Date.now()) => u.status !== 'active' || suspendedNow(u, now);
