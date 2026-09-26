/**
 * 약관 및 정책 — 설정 > 약관 및 정책 의 세 문서 (/settings/terms · /settings/privacy · /settings/policy).
 * 짧게, 앱이 실제로 하는 일(supabase/schema.sql · SECURITY.md)만. 기능을 바꾸면 여기도 같이 고친다.
 * 문단은 글자 그대로 보여 준다 (HTML 없음). 목록은 { li: [...] }.
 */
export type LegalBlock = string | { li: string[] };
export type LegalDoc = {
	title: string;
	/** 설정 목록에 보이는 한 줄 설명 */
	subtitle: string;
	updated: string;
	intro?: string;
	sections: { h: string; body: LegalBlock[] }[];
};

export const LEGAL_IDS = ['terms', 'privacy', 'policy'] as const;
export type LegalId = (typeof LEGAL_IDS)[number];

const UPDATED = '2026년 9월 26일';

export const LEGAL: Record<LegalId, LegalDoc> = {
	terms: {
		title: '이용약관',
		subtitle: '서비스 이용 조건',
		updated: UPDATED,
		sections: [
			{ h: '가입', body: ['학교 이메일(@cnsa.hs.kr)로 인증한 학생만, 한 사람 한 계정.'] },
			{ h: '서비스', body: ['익명 랜덤 채팅 · 익명편지 · AI 대화. 운영진이 기능과 운영 시간을 바꿀 수 있어요.'] },
			{ h: '책임', body: ['쓴 글의 책임은 쓴 사람에게 있어요. 운영정책을 어기면 이용이 제한돼요.'] },
			{ h: '변경', body: ['약관이 바뀌면 공지사항으로 알려요.'] }
		]
	},

	privacy: {
		title: '개인정보 처리방침',
		subtitle: '수집 항목 · 보관 · 파기',
		updated: UPDATED,
		sections: [
			{
				h: '모으는 정보',
				body: [{ li: ['학교 이메일(학번), 암호화된 비밀번호', '학교 명단의 이름 · 학년', '프로필, 채팅 · 편지, 신고 · 차단 기록, 알림 구독 정보'] }]
			},
			{
				h: '보관',
				body: [{ li: ['채팅: 대화가 끝나고 24시간 뒤 삭제 (신고된 대화는 처리 후 180일)', '편지 · 계정: 삭제 요청 전까지', 'AI 대화 내용: 저장 안 함'] }]
			},
			{
				h: '볼 수 있는 사람',
				body: [
					'다른 학생에게는 익명 이름 · 가명만 보여요 (편지 받기를 켜면 검색에 이름 · 학년). 채팅을 둘 다 연장하면 학년 · 성씨 · 동아리 · 디플로마가 하나씩 서로 공개돼요.',
					'관리자는 안전을 위해 신원과 내용을 볼 수 있고(지운 메시지 원문 포함), 볼 때마다 기록돼요.'
				]
			},
			{ h: '맡기는 곳', body: ['Supabase(데이터 · 로그인), Cloudflare(서버 · AI)'] }
		]
	},

	policy: {
		title: '운영정책',
		subtitle: '커뮤니티 가이드라인',
		updated: UPDATED,
		sections: [
			{ h: '금지', body: [{ li: ['괴롭힘 · 욕설 · 혐오', '성적인 내용', '신상 정보(전화번호 · 학번 · 반 · SNS)', '사칭 · 도배'] }] },
			{ h: '신고', body: ['신고하면 자동으로 차단돼요. 신고한 사람은 알려지지 않아요.'] },
			{ h: '조치', body: ['경고 · 기간 정지 · 영구 정지. 30일 안에 3명에게 신고되면 자동 정지돼요.'] }
		]
	}
};
