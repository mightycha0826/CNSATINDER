import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * 운영진 현황 새로고침 (Phase 49) — 오른쪽 판이 1분마다(탭이 보일 때만) 부른다.
 * hooks.server.ts 가 역할을 확인하는 그 한 번의 요청(admin_staff_touch)에 현황이 같이 오므로 여기서는 돌려주기만 한다.
 */
export const GET: RequestHandler = ({ locals }) => json({ team: locals.team ?? [], now: new Date().toISOString() });
