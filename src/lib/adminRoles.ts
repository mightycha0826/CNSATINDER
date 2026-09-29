/**
 * 운영진 역할 · 권한표 (Phase 49) — 서버와 화면이 같이 쓴다. DB 의 private.staff_can 과 같은 표.
 *   moderator 운영자 — 신고 처리 · 제재 · 사용자 · 개인 공지 · 업적 · 문의
 *   developer 개발자 — 운영 설정(수치 · AI · 금칙어 · 잠금 · 홈 배너) · 문의 · 활동 기록 (학생 조치 · 신원은 못 본다)
 *   admin     관리자 — 전부 (신원 열람 · 전체 대화 · 공지)
 * 화면은 권한 없는 메뉴를 숨기고, 서버(+layout.server.ts)는 주소를 직접 쳐도 막고, DB 함수가 한 번 더 막는다.
 */
export type StaffRole = 'moderator' | 'developer' | 'admin';
export type Perm = 'moderate' | 'identity' | 'settings' | 'service' | 'inquiry' | 'notice' | 'audit' | 'any';

export const ROLE_LABEL: Record<StaffRole, string> = { moderator: '운영자', developer: '개발자', admin: '관리자' };
export const ROLE_COLOR: Record<StaffRole, string> = { moderator: '#16a34a', developer: '#2563eb', admin: '#e11d48' };

const PERMS: Record<Perm, StaffRole[]> = {
	moderate: ['moderator', 'admin'],
	identity: ['admin'],
	settings: ['developer', 'admin'],
	service: ['moderator', 'developer', 'admin'],
	inquiry: ['moderator', 'developer', 'admin'],
	notice: ['admin'],
	audit: ['moderator', 'developer', 'admin'],
	any: ['moderator', 'developer', 'admin']
};

export const can = (role: StaffRole | null | undefined, perm: Perm) => !!role && PERMS[perm].includes(role);

/** 화면(주소)마다 필요한 권한 — 맨 앞이 맞는 것부터 */
const PAGES: [RegExp, Perm][] = [
	[/^\/admin\/(login|session)/, 'any'],
	[/^\/admin\/live/, 'any'],
	[/^\/admin\/(rooms|posts)/, 'identity'],
	[/^\/admin\/(reports|letters|users)/, 'moderate'],
	[/^\/admin\/settings/, 'service'],
	[/^\/admin\/notices/, 'any'],
	[/^\/admin\/inquiries/, 'inquiry'],
	[/^\/admin\/audit/, 'audit'],
	[/^\/admin\/team/, 'any'],
	[/^\/admin\/?$/, 'moderate']
];
export function pagePerm(path: string): Perm {
	return PAGES.find(([re]) => re.test(path))?.[1] ?? 'any';
}
/** 역할마다 처음 여는 화면 */
export const homeOf = (role: StaffRole) => (role === 'developer' ? '/admin/live' : '/admin');

/** 현황 판 — 마지막으로 본 화면 주소를 "무엇을 하는 중"으로 */
export function activityOf(path: string | null): string {
	if (!path) return '';
	const p = path.replace(/\/__data\.json$/, '');
	if (p.startsWith('/admin/reports') || p === '/admin') return '채팅 신고 보는 중';
	if (p.startsWith('/admin/letters') || p.startsWith('/admin/posts')) return '편지 신고 보는 중';
	if (p.startsWith('/admin/users/')) return '사용자 살펴보는 중';
	if (p.startsWith('/admin/users')) return '사용자 찾는 중';
	if (p.startsWith('/admin/rooms')) return '대화 기록 보는 중';
	if (p.startsWith('/admin/live')) return '실시간 현황 보는 중';
	if (p.startsWith('/admin/notices')) return '공지사항 보는 중';
	if (p.startsWith('/admin/inquiries')) return '문의 답하는 중';
	if (p.startsWith('/admin/settings')) return '운영 설정 보는 중';
	if (p.startsWith('/admin/audit')) return '활동 기록 보는 중';
	return '운영 화면';
}

export type TeamMember = { id: string; name: string; role: StaffRole; last_seen: string | null; path: string | null; me: boolean };
