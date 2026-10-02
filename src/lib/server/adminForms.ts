/** 운영자 폼에서 반복되는 입력 규칙. RPC 호출과 권한 검사는 각 액션에서 맡는다. */
const BADGE_CODE = /^[a-z_]{1,40}$/;

export function badgeCode(form: FormData): string | null {
	const code = String(form.get('code') ?? '');
	return BADGE_CODE.test(code) ? code : null;
}

export function noticeInput(form: FormData) {
	return {
		title: String(form.get('title') ?? '').trim(),
		body: String(form.get('body') ?? '').trim()
	};
}

/** 전체 공지와 개인 공지는 같은 제목·본문 제한을 쓴다. 실패 시 입력 보존은 액션이 결정한다. */
export function noticeError({ title, body }: ReturnType<typeof noticeInput>): string | null {
	if (!title) return '제목을 적어 주세요';
	if (title.length > 80) return '제목은 80자까지';
	if (body.length > 2000) return '내용은 2000자까지';
	return null;
}

type IntegerField = readonly [name: string, min: number, max: number];

/** 첫 잘못된 값의 기존 오류 문구를 유지하고, 전부 유효할 때만 설정 패치를 만든다. */
export function integerFields(form: FormData, fields: readonly IntegerField[]): { values: Record<string, number> } | { error: string } {
	const values: Record<string, number> = {};
	for (const [name, min, max] of fields) {
		const value = Number(form.get(name));
		if (!Number.isInteger(value) || value < min || value > max) {
			return { error: `${name} 는 ${min}~${max} 사이의 정수여야 해요` };
		}
		values[name] = value;
	}
	return { values };
}
