// AI 대화 상대 — 모델에 보내는 대화 모양 (npm run test:aichat)
// Gemma 대화 틀: system 다음은 사용자로 시작하고, 사용자 · AI 가 번갈아 가야 한다.
import { chatPrompt, cleanHistory, tidyReply } from '../src/lib/server/aiChat.ts';
import { callModels, foldSystem } from '../src/lib/server/aiFold.ts';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); };
const alternates = (msgs) => msgs.filter((m) => m.role !== 'system').every((m, i) => m.role === (i % 2 ? 'assistant' : 'user'));

console.log('[대화 모양]');
const greet = { role: 'assistant', content: '안녕하세요! 요즘 뭐 하면서 지내요?' };
let p = chatPrompt(cleanHistory([greet, { role: 'user', content: '그냥 공부해요' }]));
check('★ 화면 첫 줄(AI 인사)이 있어도 사용자로 시작', p[0].role === 'system' && p[1].role === 'user' && p.length === 2, JSON.stringify(p.map((m) => m.role)));
check('AI 인사는 지시문 뒤로 옮겨 맥락은 남긴다', p[0].content.includes('먼저 이렇게 인사하며 시작했다') && p[0].content.includes('요즘 뭐 하면서'));
p = chatPrompt(cleanHistory([greet, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }]));
check('사용자 · AI 번갈아', alternates(p) && p.at(-1).content === 'c', JSON.stringify(p.map((m) => m.role)));
p = chatPrompt(cleanHistory([greet, { role: 'user', content: '하나' }, { role: 'user', content: '둘' }]));
check('같은 쪽 말이 이어지면 한 말로 합친다', alternates(p) && p.length === 2 && p[1].content === '하나\n둘', JSON.stringify(p));
const long = [greet, ...Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }))];
long.push({ role: 'user', content: '끝' });
p = chatPrompt(cleanHistory(long));
check('기록을 12개로 자른 뒤에도 사용자로 시작 · 번갈아', alternates(p) && p.at(-1).content.endsWith('끝'), JSON.stringify(p.map((m) => m.role)));
check('마지막이 AI 말이면 보내지 않는다', cleanHistory([greet]) === null);

console.log('[system 을 못 받는 모델에 다시 보낼 때]');
const f = foldSystem(chatPrompt(cleanHistory([greet, { role: 'user', content: 'U1' }, { role: 'assistant', content: 'A' }, { role: 'user', content: 'U2' }])));
check('지시문을 첫 사용자 말 앞에 붙이고 system 은 없앤다', f.every((m) => m.role !== 'system') && f[0].role === 'user' && f[0].content.includes('AI 대화 친구') && f[0].content.endsWith('U1') && alternates(f));
check('system 이 없으면 그대로(null)', foldSystem([{ role: 'user', content: 'x' }]) === null);

console.log('[모델 고르기 — 못 쓰는 모델은 건너뛴다]');
{
	// 이 계정에서 실제로 본 오류: Gemma 3 → "5018: This account is not allowed to access @cf/google/gemma-3-12b-it."
	const calls = [];
	const fakeAi = (rule) => ({ run: async (id, input) => { calls.push([id, input]); return rule(id, input); } });
	const M = [{ id: '@cf/google/gemma-4-26b-a4b-it', extra: { chat_template_kwargs: { enable_thinking: false } } }, { id: '@cf/zai-org/glm-4.7-flash' }];
	const msgs = [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }];
	const params = { max_tokens: 20, temperature: 0 };

	let r = await callModels(fakeAi(() => ({ response: '안녕' })), msgs, M, null, params);
	check('첫 모델이 되면 그걸로 · 한 번만 부른다', r.ok && r.model === M[0].id && calls.length === 1);
	check('Gemma 4 는 생각하기 끄기를 붙여 부른다', calls[0][1].chat_template_kwargs?.enable_thinking === false && calls[0][1].max_tokens === 20);

	calls.length = 0;
	r = await callModels(fakeAi((id) => { if (id.includes('gemma')) throw new Error(`5018: This account is not allowed to access ${id}.`); return { choices: [{ message: { content: '안녕' } }] }; }), msgs, M, null, params);
	check('★ 5018(권한 없음)이면 system 접기 없이 바로 다음 모델', r.ok && r.model === M[1].id && calls.length === 2 && calls[0][0] === M[0].id && calls[1][0] === M[1].id, JSON.stringify(calls.map((c) => c[0])));
	check('다음 모델엔 앞 모델 전용 값이 붙지 않는다', !('chat_template_kwargs' in calls[1][1]));

	calls.length = 0;
	r = await callModels(fakeAi(() => ({ response: 'ok' })), msgs, M, M[1].id, params);
	check('지난번에 된 모델부터 부른다', r.ok && calls[0][0] === M[1].id);
	check('목록 순서를 바꿔 놓지 않는다 (상수 그대로)', M[0].id.includes('gemma'));

	calls.length = 0;
	r = await callModels(fakeAi((id, input) => { if (input.messages[0].role === 'system') throw new Error('role system not supported'); return { response: 'ok' }; }), msgs, M, null, params);
	check('system 을 못 받는 오류면 같은 모델에 지시문을 접어 다시', r.ok && r.model === M[0].id && calls.length === 2 && calls[1][1].messages[0].role === 'user');

	r = await callModels(fakeAi(() => { throw new Error('4006: daily free allocation exceeded'); }), msgs, M, null, params);
	check('다 안 되면 모델마다 오류를 모아 돌려준다 (운영 설정 화면에 그대로)', !r.ok && r.errors.length === 4 && r.errors[0].startsWith(M[0].id), JSON.stringify(r));
}

console.log('[AI 답 가리기]');
check('전화번호 · @아이디 가림', tidyReply('010-1234-5678 @abc_def') === '(번호 가림) (아이디 가림)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
