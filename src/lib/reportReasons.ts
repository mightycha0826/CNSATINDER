import type { ReportReason } from './chat/types';

/** 신고 사유 — 채팅과 익명편지가 같은 목록을 쓴다 (서버 check 제약과 같은 값) */
export const REPORT_REASONS: { v: ReportReason; label: string }[] = [
	{ v: 'personal_info', label: '이름·학번·SNS를 캐물어요' },
	{ v: 'sexual', label: '성적인 말을 해요' },
	{ v: 'harassment', label: '욕설·괴롭힘' },
	{ v: 'hate', label: '혐오 표현' },
	{ v: 'impersonation', label: '다른 사람인 척해요' },
	{ v: 'spam', label: '도배·광고' },
	{ v: 'other', label: '기타' }
];
