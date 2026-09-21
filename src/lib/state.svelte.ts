import type { Session } from '@supabase/supabase-js';
import { hasSupabase, supabase } from './supabase';

/** 공개 프로필 — 상대에게 보여줄 정보는 없다. 매칭 파라미터와 내 상태뿐. */
export type Profile = {
	id: string;
	gender: 'm' | 'f' | 'x';
	want: 'm' | 'f' | 'any';
	status: 'active' | 'suspended' | 'banned';
	suspended_until: string | null;
	verified: boolean;
	onboarded: boolean;
};

export type Settings = {
	is_open: boolean;
	notice: string;
	room_minutes: number;
	extend_minutes: number;
	vote_window_sec: number;
	join_grace_sec: number;
	max_rounds: number;
	heartbeat_sec: number;
	presence_ttl_sec: number;
	msg_max_len: number;
};

export const S = $state({
	booted: false,
	session: null as Session | null,
	profile: null as Profile | null,
	settings: null as Settings | null,
	/** 전역 1초 틱. 카운트다운·상대시간 표시가 여기에 붙는다. */
	now: Date.now()
});

/** 순수 UI 상태 — 서버와 무관 */
export const UI = $state({
	standalone: true, // 설치 게이트. 부팅 시 실제 값으로 덮인다.
	installEvt: null as BeforeInstallPromptEvent | null,
	busy: false
});

export const isIOS = () =>
	typeof navigator !== 'undefined' &&
	/iphone|ipad|ipod/i.test(navigator.userAgent) &&
	!/crios|fxios/i.test(navigator.userAgent);

// ── 토스트 ────────────────────────────────────────────────────────────
// 의존성 없는 별도 모듈로 분리 (브라우저 모드로 직접 테스트하기 위해). 기존 import 경로는 그대로 쓴다.
export { toast, toasts } from './toast.svelte';

// ── 에러 한국어 매핑 ──────────────────────────────────────────────────
export function errMsg(e: unknown): string {
	const m = String((e as { message?: string })?.message ?? e ?? '');
	// Supabase Auth 는 트리거 예외를 'Database error saving new user' 로 감싸서 돌려준다
	if (m.includes('school_email_required') || m.includes('Database error saving new user'))
		return '학교 이메일(@cnsa.hs.kr)로만 가입할 수 있어요';
	// IP 단위 한도 — 학교 와이파이에서는 본인이 아니라 학교 전체가 몰린 것이다
	if (m.includes('Request rate limit reached'))
		return '지금 들어오는 사람이 많아요. 몇 초 뒤에 다시 눌러 주세요';
	if (m.includes('Email rate limit') || m.includes('over_email_send_rate_limit'))
		return '메일을 너무 자주 요청했어요. 1분 뒤에 다시 받아 주세요';
	if (m.includes('rate limit')) return '요청이 많아요. 잠시 후 다시 시도해 주세요';
	if (m.includes('Token has expired') || m.includes('expired'))
		return '인증 코드가 만료됐어요. 다시 받아 주세요';
	if (m.includes('Invalid token') || m.includes('invalid'))
		return '인증 코드가 올바르지 않아요';
	if (m.includes('Failed to fetch') || m.includes('NetworkError'))
		return '네트워크를 확인해 주세요';
	if (m.includes('unauthenticated')) return '로그인이 필요해요';
	return m || '알 수 없는 오류가 발생했어요';
}

// ── 부팅 ──────────────────────────────────────────────────────────────
let ticker: ReturnType<typeof setInterval> | null = null;

export async function init() {
	if (ticker) return; // 중복 init 가드
	ticker = setInterval(() => (S.now = Date.now()), 1000);

	detectStandalone();

	if (!hasSupabase) {
		S.booted = true;
		return;
	}

	const {
		data: { session }
	} = await supabase.auth.getSession();
	S.session = session;
	if (session) await afterLogin();
	S.booted = true;

	supabase.auth.onAuthStateChange((event, sess) => {
		S.session = sess;
		if (event === 'SIGNED_OUT') {
			S.profile = null;
		} else if (sess) {
			void afterLogin();
		}
	});
}

async function afterLogin() {
	// 트리거가 못 만든 경우를 대비한 폴백 (gyeol ensureProfile 패턴)
	await supabase.rpc('ensure_self');
	await Promise.all([loadProfile(), loadSettings()]);
}

export async function loadProfile() {
	// ★ select('*') 를 쓰지 않는다. 항상 명시 컬럼.
	const { data } = await supabase
		.from('profiles')
		.select('id, gender, want, status, suspended_until, verified, onboarded')
		.eq('id', S.session?.user.id ?? '')
		.maybeSingle();
	S.profile = (data as Profile) ?? null;
}

async function loadSettings() {
	const { data } = await supabase
		.from('app_settings')
		.select(
			'is_open, notice, room_minutes, extend_minutes, vote_window_sec, join_grace_sec, max_rounds, heartbeat_sec, presence_ttl_sec, msg_max_len'
		)
		.maybeSingle();
	S.settings = (data as Settings) ?? null;
}

// ── 설치 게이트 ───────────────────────────────────────────────────────
export function detectStandalone() {
	if (typeof window === 'undefined') return;
	// 개발 중에는 게이트를 끈다. ?gate 를 붙이면 설치 안내 화면을 확인할 수 있다.
	if (import.meta.env.DEV && !location.search.includes('gate')) {
		UI.standalone = true;
		return;
	}
	UI.standalone =
		window.matchMedia('(display-mode: standalone)').matches ||
		// iOS Safari 는 display-mode 를 지원하지 않는다
		(navigator as unknown as { standalone?: boolean }).standalone === true;
}

export async function promptInstall() {
	const e = UI.installEvt;
	if (!e) return false;
	await e.prompt();
	const { outcome } = await e.userChoice;
	if (outcome === 'accepted') UI.installEvt = null;
	return outcome === 'accepted';
}

// ── 인증 (OTP 코드 방식) ──────────────────────────────────────────────
// 링크 방식을 쓰면 링크가 브라우저에서 열리고, 그 브라우저는 설치 게이트에 막힌다.
// 코드 방식이면 설치된 앱 안에서 인증이 끝난다.

export const SCHOOL_DOMAIN = 'cnsa.hs.kr';

export async function sendOtp(localPart: string) {
	const email = `${localPart.trim().toLowerCase()}@${SCHOOL_DOMAIN}`;
	const { error } = await supabase.auth.signInWithOtp({
		email,
		options: { shouldCreateUser: true }
	});
	if (error) throw error;
	return email;
}

export async function verifyOtp(email: string, token: string) {
	const { error } = await supabase.auth.verifyOtp({
		email,
		token: token.trim(),
		type: 'email'
	});
	if (error) throw error;
}

/**
 * 개발 전용 — 메일 발송 한도를 쓰지 않고 테스트 계정으로 로그인한다.
 * 계정은 Supabase Dashboard > Authentication > Users > Add user 에서 (Auto Confirm) 만든다.
 * import.meta.env.DEV 가 빌드 시 false 로 치환되므로 배포 번들에는 들어가지 않는다.
 */
export async function devSignIn(email: string, password: string) {
	if (!import.meta.env.DEV) throw new Error('dev only');
	const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
	if (error) throw error;
}

export async function signOut() {
	await supabase.auth.signOut();
	S.profile = null;
}

// ── 온보딩 ────────────────────────────────────────────────────────────
export async function saveOnboarding(gender: 'm' | 'f', want: 'm' | 'f' | 'any') {
	const { error } = await supabase
		.from('profiles')
		.update({ gender, want, onboarded: true })
		.eq('id', S.session?.user.id ?? '');
	if (error) throw error;
	await loadProfile();
}
