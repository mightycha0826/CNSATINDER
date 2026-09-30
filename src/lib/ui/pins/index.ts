import type { Component } from 'svelte';
import Geukjakso from './Geukjakso.svelte';

/**
 * CNSA 뱃지 (Phase 70) — 학교 동아리 · 행사의 실제 에나멜 핀을 그대로 그린 것. 동그란 메달 대신 이 그림을 쓴다 (Badge.svelte).
 * 코드는 private.achievement_defs 의 code (category 'cnsa', 운영진이 준다). 새 뱃지는 그림 컴포넌트를 만들어 여기에 더한다.
 */
export const PIN_BADGES: Record<string, Component<{ shine?: boolean; delay?: number }>> = {
	club_geukjakso: Geukjakso
};
