import type { ParamMatcher } from '@sveltejs/kit';

/** [id=uuid] — 사용자·신고·대화 id. 모양이 틀리면 라우트가 맞지 않아 곧바로 404. */
export const match: ParamMatcher = (p) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p);
