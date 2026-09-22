import type { Session } from '@supabase/supabase-js';
import { hasSupabase, supabase } from './supabase';
import { disablePush, syncPush } from './push';

/** 내 프로필. 상대에게는 nickname·bio·interests·mbti 만 partner_profile() 을 거쳐 보인다 (성별·선호·상태는 안 보인다). */
export type Profile = {
	id: string;
	/** 계정의 고유 익명 이름 — 가입할 때 서버가 정하고 바꿀 수 없다 */
	nickname: string | null;
	bio: string;
	interests: string[];
	mbti: string | null;
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
	max_open_rooms: number;
};

export const S = $state({
	booted: false,
	session: null as Session | null,
	profile: null as Profile | null,
	settings: null as Settings | null,
	/** 비밀번호를 설정했는지 — 안 했으면 다음 로그인도 인증 코드로 해야 한다 */
	hasPassword: null as boolean | null,
	/** 전역 1초 틱. 카운트다운·상대시간 표시가 여기에 붙는다. */
	now: Date.now()
});

/** 순수 UI 상태 — 서버와 무관 */
export const UI = $state({
	standalone: true, // 설치 게이트. 부팅 시 실제 값으로 덮인다.
	installEvt: null as BeforeInstallPromptEvent | null,
	busy: false
});

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
	// 비밀번호 로그인 — 계정이 없는지 비밀번호가 틀렸는지는 구분해 주지 않는다 (가입 여부 탐색 방지)
	if (m.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않아요';
	if (m.includes('Email not confirmed')) return '아직 인증을 마치지 않은 계정이에요. 인증 코드로 들어와 주세요';
	if (m.includes('Password should') || m.includes('weak_password'))
		return '비밀번호는 8자 이상, 영문과 숫자를 섞어 주세요';
	if (m.includes('same_password') || m.includes('should be different'))
		return '지금 쓰는 비밀번호와 달라야 해요';
	// 프로필 검사 (update_my_profile)
	if (m.includes('personal_info')) return '학번·전화번호·SNS 아이디처럼 나를 알 수 있는 정보는 적을 수 없어요';
	if (m.includes('bio_too_long')) return '소개는 60자까지 쓸 수 있어요';
	if (m.includes('too_many_interests')) return '관심사는 5개까지예요';
	if (m.includes('interest_too_long')) return '관심사 하나는 12자까지예요';
	if (m.includes('invalid_mbti')) return 'MBTI 를 다시 확인해 주세요';
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
			S.hasPassword = null;
		} else if (sess && event !== 'TOKEN_REFRESHED') {
			void afterLogin();
		}
	});

	startHeartbeat();
}

async function afterLogin() {
	// 트리거가 못 만든 경우를 대비한 폴백 (gyeol ensureProfile 패턴). 익명 이름도 여기서 보장된다.
	await supabase.rpc('ensure_self');
	await Promise.all([loadProfile(), loadSettings(), loadAccount()]);
	void beat(true);
	// 이미 알림을 허락한 기기면 이 계정으로 구독을 다시 저장 (기기 주인이 바뀌었을 수도 있다)
	void syncPush().catch(() => {});
}

export async function loadProfile() {
	// ★ select('*') 를 쓰지 않는다. 항상 명시 컬럼.
	const { data } = await supabase
		.from('profiles')
		.select('id, nickname, bio, interests, mbti, gender, want, status, suspended_until, verified, onboarded')
		.eq('id', S.session?.user.id ?? '')
		.maybeSingle();
	S.profile = (data as Profile) ?? null;
}

async function loadSettings() {
	const { data } = await supabase
		.from('app_settings')
		.select(
			'is_open, notice, room_minutes, extend_minutes, vote_window_sec, join_grace_sec, max_rounds, heartbeat_sec, presence_ttl_sec, msg_max_len, max_open_rooms'
		)
		.maybeSingle();
	S.settings = (data as Settings) ?? null;
}

export async function loadAccount() {
	const { data } = await supabase.rpc('my_account');
	S.hasPassword = (data as { has_password?: boolean } | null)?.has_password ?? null;
}

// ── 온라인 표시 ───────────────────────────────────────────────────────
// 앱이 화면에 떠 있는 동안 30초마다 "켜져 있음"을 알린다. 서버는 70초 동안 온라인으로 본다.
// 백그라운드로 가면 곧바로 오프라인을 알린다 (그래야 상대 화면의 초록 점이 바로 꺼진다).
const BEAT_MS = 30_000;
let beatTimer: ReturnType<typeof setInterval> | null = null;

async function beat(online: boolean) {
	if (!S.session) return;
	try {
		await supabase.rpc('heartbeat', { p_online: online });
	} catch {
		/* 다음 박동에 다시 */
	}
}

function startHeartbeat() {
	if (beatTimer || typeof document === 'undefined') return;
	beatTimer = setInterval(() => {
		if (document.visibilityState === 'visible') void beat(true);
	}, BEAT_MS);
	document.addEventListener('visibilitychange', () => {
		void beat(document.visibilityState === 'visible');
	});
	// 앱을 완전히 닫을 때 — 응답을 기다릴 수 없으니 최선을 다할 뿐, 못 보내도 70초 뒤 자연히 오프라인
	window.addEventListener('pagehide', () => void beat(false));
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
	otpVerifiedAt = Date.now();
}

// ── 본인 재확인 (비밀번호 바꾸기 전) ─────────────────────────────────
// 기존 비밀번호로 확인하거나, 잊었으면 학교 메일 인증 코드로 확인한다.
// 방금 인증 코드로 들어왔으면(10분 이내) 한 번 더 묻지 않는다 — "비밀번호를 잊어서 코드로 들어온" 경우.
const REVERIFY_FRESH_MS = 10 * 60_000;
let otpVerifiedAt = 0;
export const recentlyVerified = () => Date.now() - otpVerifiedAt < REVERIFY_FRESH_MS;

const myEmail = () => S.session?.user.email ?? '';

/** 기존 비밀번호가 맞는지 — 맞으면 같은 계정으로 세션이 새로 발급될 뿐 아무것도 바뀌지 않는다 */
export async function verifyCurrentPassword(password: string) {
	const { error } = await supabase.auth.signInWithPassword({ email: myEmail(), password });
	if (error) throw error;
	otpVerifiedAt = Date.now();
}

/** 비밀번호를 잊었을 때 — 내 학교 메일로 인증 코드 (새 계정은 만들지 않는다) */
export async function sendOtpToMe() {
	const { error } = await supabase.auth.signInWithOtp({
		email: myEmail(),
		options: { shouldCreateUser: false }
	});
	if (error) throw error;
	return myEmail();
}

export async function verifyOtpForMe(token: string) {
	await verifyOtp(myEmail(), token);
}

// ── 비밀번호 로그인 ──────────────────────────────────────────────────
// 처음 한 번은 반드시 인증 코드(학교 메일)로 들어와 계정을 만들고, 그때 비밀번호를 정한다.
// 그 뒤로는 학교 이메일 앞부분 + 비밀번호로 들어온다.
// ★ 도메인은 여기서 붙인다. 입력칸은 앞부분만 받으므로 다른 도메인으로 로그인을 시도할 길이 없고,
//   애초에 DB 트리거가 학교 도메인이 아닌 계정을 만들지 못하게 막는다.
// ★ 확인 전 계정에는 비밀번호가 저장되지 않는다(strip_unconfirmed_password) — 남의 이메일로
//   미리 비밀번호를 걸어 두는 선점이 불가능하다.

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*[0-9]).{8,72}$/;

export async function signInWithPassword(localPart: string, password: string) {
	const email = `${localPart.trim().toLowerCase()}@${SCHOOL_DOMAIN}`;
	const { error } = await supabase.auth.signInWithPassword({ email, password });
	if (error) throw error;
}

/** 로그인한 상태에서 비밀번호 설정·변경. 잊었으면 인증 코드로 들어와 다시 정하면 된다. */
export async function setPassword(password: string) {
	if (!PASSWORD_RULE.test(password)) throw new Error('weak_password');
	const { error } = await supabase.auth.updateUser({ password });
	if (error) throw error;
	await loadAccount();
}

export async function signOut() {
	await disablePush().catch(() => {}); // 이 기기로 이 계정 알림이 더 오지 않게
	await beat(false);
	await supabase.auth.signOut();
	S.profile = null;
	S.hasPassword = null;
}

// ── 프로필 ────────────────────────────────────────────────────────────
export async function saveProfile(bio: string, interests: string[], mbti: string | null) {
	const { error } = await supabase.rpc('update_my_profile', {
		p_bio: bio,
		p_interests: interests,
		p_mbti: mbti ?? ''
	});
	if (error) throw error;
	await loadProfile();
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
