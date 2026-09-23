import { reportActions, reportDetail } from '$lib/server/reports';
import type { ReportDetail } from '$lib/adminTypes';
import type { Actions, PageServerLoad } from './$types';

// ★ load 에는 신원 정보가 없다. 이메일은 identity 액션으로만, 기록과 함께 나간다.
export const load: PageServerLoad = async ({ params }) => ({ d: await reportDetail<ReportDetail>('chat', params.id) });

export const actions: Actions = reportActions('chat');
