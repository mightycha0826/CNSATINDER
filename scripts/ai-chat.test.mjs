// AI 대화 상대 — 모델에 보내는 대화 모양 (npm run test:aichat)
// Gemma 대화 틀: system 다음은 사용자로 시작하고, 사용자 · AI 가 번갈아 가야 한다.
import { chatPrompt, cleanHistory, tidyReply } from '../src/lib/server/aiChat.ts';
import { foldSystem } from '../src/lib/server/aiFold.ts';

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

console.log('[AI 답 가리기]');
check('전화번호 · @아이디 가림', tidyReply('010-1234-5678 @abc_def') === '(번호 가림) (아이디 가림)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
