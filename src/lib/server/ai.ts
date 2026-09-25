import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { foldSystem } from './aiFold';

/**
 * Cloudflare Workers AI 호출 (검열봇 · AI 대화 상대 공용). 서버 전용.
 *
 * 무료 몫: 하루 10,000 Neuron, UTC 00:00(한국 오전 9시)에 초기화, 무료 플랜에서 넘으면 오류.
 * 모델: Gemma 3 12B — 한국어를 지원한다고 알려진 모델 중 Workers AI 요금표에 있는 것.
 *   (Llama 3.x · Llama Guard 3 는 지원 언어에 한국어가 없다 — Meta 모델 카드)
 * AI_MODEL 환경변수로 바꿀 수 있다.
 * Cloudflare 는 Workers AI 로 보낸 내용을 모델 학습·서비스 개선에 쓰지 않는다고 명시한다.
 *
 * 개발 서버에서 AI_FAKE=1 이면 진짜 모델 대신 정해진 답을 돌려준다 (화면 테스트용):
 *   검열 — 글에 "[flag:분류]" 가 있으면 그 분류로 걸림 / 대화 — "AI 답: <마지막 말>"
 */
export const AI_MODEL = () => env.AI_MODEL || '@cf/google/gemma-3-12b-it';

export type { AiMessage } from './aiFold';
import type { AiMessage } from './aiFold';

export class AiUnavailable extends Error {}

/** wrangler.jsonc 의 "ai" 바인딩 (platform.env.AI) */
export type AiBinding = { run(model: string, input: Record<string, unknown>): Promise<unknown> };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export async function runAi(
	ai: AiBinding | undefined,
	messages: AiMessage[],
	opts: { maxTokens: number; temperature?: number; fake: (msgs: AiMessage[]) => string }
): Promise<string> {
	if (dev && env.AI_FAKE === '1') return opts.fake(messages);
	if (!ai) throw new AiUnavailable('no_binding');
	const call = (msgs: AiMessage[]) =>
		ai.run(AI_MODEL(), { messages: msgs, max_tokens: opts.maxTokens, temperature: opts.temperature ?? 0.2 });
	let out: unknown;
	try {
		out = await call(messages);
	} catch (e) {
		const folded = foldSystem(messages);
		if (!folded) throw new AiUnavailable(errText(e));
		try {
			out = await call(folded);
		} catch (e2) {
			// 무료 몫을 다 썼거나(무료 플랜) 모델 오류 — 호출한 쪽이 "나중에"로 처리한다. 두 번째 오류를 남긴다
			throw new AiUnavailable(`${errText(e2)} (첫 시도: ${errText(e)})`);
		}
	}
	const text =
		typeof out === 'string'
			? out
			: typeof (out as { response?: unknown })?.response === 'string'
				? (out as { response: string }).response
				: ((out as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? '');
	if (!text.trim()) throw new AiUnavailable('empty');
	return text.trim();
}

/**
 * 운영 설정의 "AI 연결 확인" — 짧은 질문 하나로 연결 · 모델 · 무료 몫을 본다. 실패하면 Cloudflare 가 준 오류를 그대로.
 * (학생 화면에는 이유를 보이지 않고, 여기서만 보여 준다)
 */
export async function checkAi(ai: AiBinding | undefined) {
	const t0 = Date.now();
	const base = { model: AI_MODEL(), binding: !!ai };
	try {
		const reply = await runAi(
			ai,
			[
				{ role: 'system', content: '한국어로 아주 짧게 답한다.' },
				{ role: 'user', content: '연결 확인이에요. "안녕"이라고만 답해 주세요.' }
			],
			{ maxTokens: 20, temperature: 0, fake: () => '안녕 (가짜 AI)' }
		);
		return { ...base, ok: true as const, ms: Date.now() - t0, reply: reply.slice(0, 80) };
	} catch (e) {
		return { ...base, ok: false as const, ms: Date.now() - t0, error: errText(e) };
	}
}
