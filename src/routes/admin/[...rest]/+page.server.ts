import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * /admin 아래 없는 주소 — 모양이 틀린 id(/admin/users/abc)도 [id=uuid] 에 맞지 않아 여기로 온다.
 * 운영자 레이아웃 안의 오류 화면(admin/+error.svelte)으로 보이게 여기서 404 를 낸다.
 */
export const load: PageServerLoad = () => error(404, '찾을 수 없는 주소');
