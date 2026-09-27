/**
 * 학교 로고 (충남삼성고 · 파란 입체 도형) — 봉투 우표 · 밀랍 봉인 · 소인에 쓴다.
 * 원본 그림(200×232)을 면 다섯 장으로 옮겼다. 한 가지 색으로 찍을 때(봉인 · 소인)는 fill 을 무시하고 currentColor 로.
 */
export const LOGO_VIEWBOX = '0 0 200 232';

export const LOGO_FACES: { d: string; fill: string }[] = [
	{ d: 'M0 57L50 86V202L0 174Z', fill: '#23b2e8' }, // 왼쪽 기둥
	{ d: 'M0 57L100 0V56L50 86Z', fill: '#014099' }, // 왼쪽 위 덮개
	{ d: 'M50 86L100 56L166 28L152 42V87L102 116V174L50 202Z', fill: '#0076c0' }, // 가운데 면
	{ d: 'M152 42L166 28L200 57L152 87Z', fill: '#014099' }, // 오른쪽 위 덮개
	{ d: 'M102 116L200 57V173L102 231Z', fill: '#23b2e8' } // 오른쪽 기둥
];

/** 실루엣 한 줄 (한 색으로 찍는 곳) */
export const LOGO_PATH = LOGO_FACES.map((f) => f.d).join('');
