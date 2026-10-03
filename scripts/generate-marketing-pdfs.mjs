/** Marketing editions of docs/PRD.md and docs/USER-FLOWS.md.
 * Run: node scripts/generate-marketing-pdfs.mjs
 * Uses the installed playwright-core, local Chrome/Edge and Wanted Sans.
 * No network requests or production app/DB access.
 */
import { readFile, writeFile, mkdir, mkdtemp, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'marketing');
const scratch = await mkdtemp(join(tmpdir(), 'landy-marketing-pdf-'));
const prd = await readFile(join(root, 'docs/PRD.md'), 'utf8');
const flows = await readFile(join(root, 'docs/USER-FLOWS.md'), 'utf8');
const baseline = prd.match(/기준 커밋: `([^`]+)`/)?.[1];
const sourceDate = prd.match(/작성일: ([\d-]+)/)?.[1];
if (!baseline || !sourceDate) throw new Error('Missing source metadata');
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const strip = (s) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|`/g, '');
const font = (await readFile(join(root, 'node_modules/wanted-sans/fonts/webfonts/variable/complete/woff2/WantedSansVariable.woff2'))).toString('base64');

const requirements = [...prd.matchAll(/^\| (FR-\d{2}) \| (.+?) \| (.+?) \| (.+?) \|\s*$/gm)]
  .map(([, id, title, state, criteria]) => ({ id, title: strip(title), state, criteria }));
if (requirements.length !== 37 || new Set(requirements.map(r => r.id)).size !== 37) throw new Error('Expected 37 unique FRs');
const nfrIds = [...prd.matchAll(/^\| (NFR-\d{2}) \|/gm)].map(m => m[1]);
if (nfrIds.length !== 8) throw new Error('Expected 8 NFRs');

const css = `
@font-face{font-family:Wanted;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 1000;font-style:normal;font-display:block}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#eae6ec;color:#211b2b;font-family:Wanted,'Malgun Gothic',sans-serif;font-size:12px;line-height:1.6;word-break:keep-all;overflow-wrap:break-word}
@page{size:A4;margin:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:297mm;position:relative;margin:0 auto;break-after:page;padding:19mm 17mm 18mm;background:#fbf9f7;overflow:hidden}
.page:last-child{break-after:auto}.page:before{content:'';position:absolute;top:0;left:0;width:100%;height:5px;background:linear-gradient(90deg,#dc9cfb,#9a52eb)}
.running{display:flex;justify-content:space-between;align-items:center;font-size:9px;letter-spacing:1.2px;color:#73677e;border-bottom:1px solid #e1dae7;padding-bottom:10px;margin-bottom:26px}
.brand{font-size:16px;font-weight:850;letter-spacing:-.5px;color:#7432b7}.footer{position:absolute;bottom:10mm;left:17mm;right:17mm;display:flex;justify-content:space-between;border-top:1px solid #e1dae7;padding-top:7px;color:#73677e;font-size:8.5px}
.eyebrow{font-size:10px;color:#7432b7;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;margin:0 0 9px}
h1,h2,h3,h4,p{margin:0}h1{font-size:36px;line-height:1.25;letter-spacing:-1.4px;font-weight:850;margin-bottom:17px}h2{font-size:27px;line-height:1.28;letter-spacing:-.9px;font-weight:800;margin-bottom:12px}h3{font-size:17px;line-height:1.4;letter-spacing:-.4px;font-weight:780;margin:0 0 8px}h4{font-size:13px;font-weight:780;margin:0 0 5px}
.deck{color:#675a70;font-size:13px;line-height:1.8;margin-bottom:22px;max-width:630px}.section{margin-top:20px}.small{font-size:10px;color:#75677f}.muted{color:#75677f}.tiny{font-size:9px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}.thirds{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card{padding:17px 18px;border:1px solid #e3dbe8;background:#fff;border-radius:15px}.card p{color:#62576b}.card .num{display:block;color:#9a52eb;font-size:25px;line-height:1.2;font-weight:800;margin-bottom:10px}
.callout{background:#eee4f8;border-left:4px solid #8b3fd9;border-radius:0 12px 12px 0;padding:14px 17px;margin-top:18px}.callout strong{color:#663297}.note{background:#f3eee8;border-left:3px solid #a78b65;padding:12px 15px;border-radius:0 10px 10px 0;font-size:10.5px;color:#6a5c49;margin-top:16px}
.pill{display:inline-block;background:#eee4f8;color:#7032ad;border-radius:20px;padding:3px 9px;font-size:9px;font-weight:750;white-space:nowrap}.pill.warm{background:#f7eadb;color:#926238}.pill.green{background:#e7f1ee;color:#367364}.pill.gray{background:#efedf1;color:#706677}
table{width:100%;border-collapse:collapse;font-size:11px}thead th{font-weight:750;color:#654b77;background:#eee4f8;text-align:left;padding:10px 10px;border-bottom:1px solid #d9c9e7}td{padding:10px;border-bottom:1px solid #e7e0eb;vertical-align:top}tbody tr:nth-child(even){background:#f5f1f7}th:first-child,td:first-child{border-radius:0}td b{font-weight:750}.req td{padding:11px 9px;font-size:11px;line-height:1.5}.req td:first-child{width:57px;color:#7032ad;font-size:10px;font-weight:800;white-space:nowrap}.req td:nth-child(3){width:56px;white-space:nowrap;font-size:9px}.req td:nth-child(4){width:88px;font-size:9px}.req td:nth-child(2){width:auto}
ul{padding-left:17px;margin:7px 0 0}li{margin:5px 0}.compact li{margin:3px 0}.rail{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:17px;margin:15px 0}.rail .step{position:relative;border:1px solid #e0d5e9;border-radius:11px;padding:12px 10px;background:#fff;text-align:center;font-size:11px;line-height:1.5;font-weight:700;display:flex;flex-direction:column;justify-content:center;min-height:68px}.step:not(:last-child):after{content:'→';position:absolute;right:-15px;top:calc(50% - 10px);font-size:15px;color:#a77abb}.step small{font-size:9px;color:#7b6b87;font-weight:450;line-height:1.5;margin-top:3px}
.flow{border:1px solid #e0d5e9;border-radius:15px;padding:18px;background:#fff;margin-top:16px}.flowhead{display:flex;align-items:center;gap:10px;margin-bottom:7px}.flowhead h3{margin:0;flex:1}.ref{font-size:8.5px;color:#897696;white-space:nowrap}.goal{font-size:11px;color:#675a70}.flow .rail{gap:15px;margin:12px 0}.flow .step{background:#f7f2fa;min-height:58px;padding:9px 7px;font-size:10.5px}.flow .step:after{right:-14px}.flow .cols{gap:15px}.flow h4{font-size:10px;color:#7432b7}.flow p{font-size:10.5px;line-height:1.65;color:#63586c}.flow .result{margin-top:10px;padding-top:9px;border-top:1px solid #e8e0ee;font-size:10.5px;color:#623084;font-weight:650}
.legend{display:flex;gap:8px;margin-top:13px;flex-wrap:wrap}.cover{padding-top:18mm;background:radial-gradient(ellipse at 95% 5%,#ecdcfc 0,transparent 50%),#fbf9f7}.cover .running{margin-bottom:48px}.cover h1{font-size:43px;line-height:1.25}.cover .docname{font-size:22px;margin:14px 0;color:#7432b7;font-weight:780}.cover .deck{max-width:550px}.cover-art{height:215px;margin:20px 0;position:relative;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#efe2fb,#f6f0e5);border-radius:22px;overflow:hidden}.cover-art:before,.cover-art:after{content:'';width:160px;height:160px;background:#dcc2f1;border-radius:50%;position:absolute;left:-35px;bottom:-90px}.cover-art:after{left:auto;right:-35px;top:-85px;background:#ead8f7}
.chat-art{position:relative;width:230px;transform:rotate(-4deg);z-index:1}.bubble{padding:15px 19px;border-radius:15px 15px 15px 4px;background:#fff;border:1px solid #dbcce7;font-size:14px;font-weight:680;width:205px}.bubble+ .bubble{margin:13px 0 0 40px;background:#8542c9;color:white;border:0;border-radius:15px 15px 4px 15px}.letter-art{position:relative;transform:rotate(5deg);width:180px;height:120px;background:#fffaf0;border:1px solid #d6c5ab;box-shadow:0 10px 25px #63387515;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#795c85;font-weight:700;margin-left:30px}.letter-art:before{content:'';position:absolute;top:0;left:0;width:100%;height:60px;clip-path:polygon(0 0,100% 0,50% 100%);background:#eee2cf;border-bottom:1px solid #d6c5ab}.letter-art span{padding-top:40px;z-index:1}.cover-meta{font-size:10px;color:#6e6077;margin-top:24px}.toc{display:flex;gap:11px;font-size:10px;color:#6e6077;margin-top:20px}.toc span{padding-right:12px;border-right:1px solid #d6c7e0}.toc span:last-child{border:0}
.bigquote{background:#2d1e3c;color:white;padding:24px 26px;border-radius:18px;font-size:21px;line-height:1.5;letter-spacing:-.5px;margin:18px 0}.bigquote small{display:block;color:#ceb8e0;font-size:10px;letter-spacing:1px;margin-top:10px}.metric{font-size:24px;font-weight:820;color:#7634ba}.subhead{display:flex;align-items:center;gap:10px;margin-bottom:12px}.subhead .number{font-size:25px;color:#b58bcf;font-weight:800}.subhead h3{margin:0}.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.summary-grid .card{padding:13px 15px;font-size:11px}.summary-grid h4{font-size:12px}.spaced{margin-top:15px}.principle{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #e5dce9}.principle>b{color:#9a52eb;font-size:20px;width:25px;flex-shrink:0}.principle strong{display:block;font-size:12px;margin-bottom:2px}.principle p{font-size:11px;color:#675a70}
.state-map{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:13px 0}.state-map .card{padding:12px 13px;font-size:10px}.state-map h4{font-size:11px}.state-map .final{background:#eee4f8}.map-group{padding:20px;border:1px solid #e2d6e9;border-radius:18px;background:#fff;margin:16px 0}.map-group h3{font-size:15px}.map-group .rail{margin-bottom:0}.funnel-row{display:grid;grid-template-columns:130px 1fr 1fr;gap:12px;padding:14px 0;border-bottom:1px solid #e5dce9;font-size:11px}.funnel-row strong{color:#7432b7}.funnel-row span{color:#675a70}.toc-table td{padding:7px 10px;font-size:10px}.ids{font-size:9px;color:#887093;margin-top:8px}
.journeys .flow p{font-size:11.5px}.journeys .flow .step{font-size:11.5px}.journeys table td{padding:8px 10px}.journeys .flow{padding:16px;margin-top:14px}.journeys .principle{padding:10px 0}.journeys .deck{margin-bottom:18px}.journeys .section{margin-top:16px}.journeys .note{padding:10px 15px;margin-top:12px}.journeys .callout{padding:12px 17px;margin-top:14px}
@media screen{.page{margin:20px auto;box-shadow:0 5px 28px #25163020}}@media print{html,body{background:#fff}.page{margin:0}}
`;

function page(kicker, title, subtitle, body, extra = '') {
  return { kicker, title, subtitle, body, extra };
}
function render(pages, kind, title) {
  const html = pages.map((p, i) => `<section class="page ${p.extra}" data-page="${i + 1}"><header class="running"><span class="brand">Landy</span><span>${kind} · MARKETING EDITION</span></header><main><p class="eyebrow">${p.kicker.replace(/\/ \d+$/, '/ ' + String(i + 1).padStart(2, '0'))}</p>${p.extra === 'cover' ? '<div class="docname">' + title + '</div>' : ''}<${p.extra === 'cover' ? 'h1' : 'h2'}>${p.title}</${p.extra === 'cover' ? 'h1' : 'h2'}><p class="deck">${p.subtitle}</p>${p.body}</main><footer class="footer"><span>내부 공유용 · ${sourceDate} · ${baseline} 기준 · ${title}</span><span>${String(i + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}</span></footer></section>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Landy | ${title}</title><style>${css}</style></head><body class="${kind === 'JOURNEYS' ? 'journeys' : ''}">${html}</body></html>`;
}
const card = (title, body, num = '') => `<div class="card">${num ? `<span class="num">${num}</span>` : ''}<h3>${title}</h3><p>${body}</p></div>`;
const callout = (body) => `<div class="callout">${body}</div>`;
const note = (body) => `<div class="note">${body}</div>`;
const rail = (steps) => `<div class="rail" style="--n:${steps.length}">${steps.map(s => `<div class="step">${s}</div>`).join('')}</div>`;
const table = (headers, rows, cls = '') => `<table class="${cls}"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const art = `<div class="cover-art" aria-label="대화와 편지를 표현한 개념 일러스트"><div class="chat-art"><div class="bubble">우리 학교, 새로운 대화.</div><div class="bubble">먼저 가볍게 말을 걸어요.</div></div><div class="letter-art"><span>전하고 싶은 한마디</span></div></div>`;
const reqTable = (from, to) => table(['ID', '기능 요구사항', '우선순위', '현황'], requirements.slice(from - 1, to).map(r => {
  const [priority, state] = r.state.split(' · ');
  const names = {Must:'필수',Should:'품질 개선',Could:'검증 후보'};
  return [r.id, escape(r.title), names[priority] || priority, escape(state)];
}), 'req');

const prdPages = [
  page('PRODUCT BRIEF / 01', '같은 학교 안에서,<br>새로운 대화를 시작하는 방법.', '학교 계정으로 시작하는 학생 간 익명 대화 앱.<br>짧은 랜덤채팅과 이름으로 찾는 익명편지로 첫마디의 부담을 낮춥니다.', `${art}<div class="thirds">${card('학교 안에서', '충남삼성고 학생을 위한 교내 모바일 앱.', '01')}${card('함께 동의하며', '짧게 시작하고, 둘 다 원하면 대화를 이어갑니다.', '02')}${card('한마디를 편지로', '특정 학생에게 발신자 신원을 숨기고 마음을 전합니다.', '03')}</div><p class="cover-meta">마케팅팀을 위한 PRD 편집본 · 원문 기능 요구사항 37개 / 품질 기준 8개<br>현재 구현을 바탕으로 작성. 운영 설정과 사용자 성과는 별도 확인이 필요합니다.</p><div class="toc"><span>제품과 타깃 02</span><span>핵심 경험 03</span><span>기능 04–06</span><span>신뢰·지표·실행 07–10</span></div>`, 'cover'),
  page('POSITIONING / 02', '누구에게, 어떤 가치를 주는가', 'Landy의 출발점은 교내 관계의 확장입니다. 아래 사용자 문제는 인터뷰로 확인된 사실이 아니라 검증할 제품 가설입니다.',
    `<div class="bigquote">“말을 걸고 싶지만, 첫마디가 망설여질 때.”<small>포지셔닝 문장 제안 · 학생 조사 및 캠페인 반응으로 검증</small></div><div class="thirds">${card('새 사람을 만나고 싶은 학생', '기존 친구 관계 밖의 학생과 부담을 낮춰 대화하고 싶습니다. 랜덤 매칭과 짧은 첫 대화가 진입점을 만듭니다.')}${card('특정 학생에게 말하고 싶은 학생', '하고 싶은 한마디를 이름으로 찾은 수신자에게 익명편지로 전합니다. 답장은 같은 익명 맥락에서 이어집니다.')}${card('안심하고 사용하고 싶은 학생', '원치 않는 접촉을 끝내고, 차단·신고·문의 경로를 이해하고 싶습니다. 운영 방식의 설명이 신뢰를 돕습니다.')}</div><div class="section"><h3>브랜드 설명의 세 가지 축</h3>${table(['축','기능 근거','사용자가 얻는 가치'],[['가까운 연결','학교 계정으로 진입하는 교내 서비스','같은 학교 안의 새로운 대화 기회'],['쌍방 선택','대화 연장과 단계별 정보 공개에 양쪽 동의','대화를 계속할지 스스로 결정'],['대화의 두 가지 속도','실시간 채팅 + 비동기 익명편지','지금 대화하거나, 생각을 정리해 전하기']])}</div><div class="section cols">${card('현재 제공 범위', '학생 간 1:1 텍스트 대화, 익명편지, 프로필·업적·뱃지, 신고·지원과 운영 기능.')}${card('현재 범위 밖', '외부 공개 가입, 공개 피드, 그룹·영상 대화, 결제·광고·구독, 전문 상담.')}</div>${note('사용자 유형은 기능 사용 맥락을 정리한 것이며, 검증된 페르소나나 시장 규모 자료는 아닙니다.')}`),
  page('CORE EXPERIENCES / 03', '대화를 만드는 두 가지 경로', '설치 → 학교 인증 → 첫 설정을 거친 학생은 채팅·익명편지·프로필의 세 탭을 사용합니다.',
    `<div class="map-group"><h3>01 · 랜덤채팅 — 짧게 시작해서, 함께 이어가기</h3>${rail(['새 상대 찾기','양쪽 입장<small>첫 대화 기본 5분</small>','쌍방 연장<small>기본 10분 추가</small>','단계별 공개<small>동의한 정보만</small>','고정 대화<small>최종 단계 뒤 동의</small>'])}<p class="small spaced">양쪽이 대화방을 보고 있을 때 시간이 흐릅니다. 한쪽이 떠나면 정지하며, 거절·만료·나가기 등으로 종료할 수 있습니다.</p></div><div class="map-group"><h3>02 · 익명편지 — 특정 학생에게, 발신자는 익명으로</h3>${rail(['수신자 검색<small>이름 2글자 이상</small>','대상 확인<small>동명이인 구분</small>','편지 작성<small>최대 1,000자</small>','발송 접수<small>봉투 연출</small>','열기·답장<small>익명 문맥 유지</small>'])}<p class="small spaced">수신 대상의 이름·학년·학번이 검색에 표시됩니다. 수신자에게는 익명 발신자의 계정 이름·이메일이 공개되지 않습니다.</p></div><div class="cols">${card('동의에 따라 공개', '학년 → 공통 질문 1 → 디플로마 → 공통 질문 2 → 동아리. 다섯 단계 이후 다음 연장 구간에서 쌍방 동의하면 고정 대화가 됩니다.')}${card('운영 설정에 따른 제공', '편지 쓰기는 기본적으로 인증·온보딩 학생 100명 기준의 잠금이 적용됩니다. AI 대화는 기본 꺼짐이며, 켜진 경우 매칭 대기를 보조합니다.')}</div>${note('5분·10분·100명 등은 코드/새 DB 기본값입니다. 실제 캠페인에 숫자를 넣기 전 대상 운영 환경의 설정을 확인합니다. AI는 핵심 홍보 약속으로 전제하지 않습니다.')}`),
  page('FEATURE INVENTORY / 04', '가입부터 랜덤채팅까지', '원문 FR-01~12를 보존한 기능 목록입니다. “구현”은 코드 경로가 있다는 뜻이며, 출시 검증 완료를 의미하지 않습니다.',
    `${reqTable(1,12)}<div class="legend"><span class="pill">구현 · 기능 경로 존재</span><span class="pill warm">조건부 · 설정/환경 필요</span><span class="pill gray">보완 · 알려진 공백</span></div>${callout('<strong>마케팅 관점:</strong> 가입의 최종 행동은 “설치”보다 “첫 유효 대화 경험”에 가깝습니다. 학교 인증·첫 설정·매칭 대기를 각각 별도 전환 단계로 관찰합니다.')}<p class="small spaced">필수 / 품질 개선 / 검증 후보는 원문의 Must / Should / Could에 해당합니다. 상세 수용 기준과 근거는 docs/PRD.md에서 확인합니다.</p>`),
  page('FEATURE INVENTORY / 05', '익명편지와 자기표현', '편지는 특정 수신자를 지정하는 경험입니다. 프로필과 뱃지는 대화를 보조하며, 익명성의 공개 범위를 함께 설명해야 합니다.',
    `${reqTable(13,24)}${callout('<strong>설명해야 할 차이:</strong> 내 보관함에서 삭제하기는 상대 편지까지 없애는 동작이 아닙니다. 폴더 삭제는 편지를 보관함으로 돌리며, 차단은 채팅과 편지 접촉에 함께 적용됩니다.')}${note('편지 초안 자동 보존·사진 처리 안내 등은 보완 대상입니다. 외부 공유 기능을 소개할 때는 편지 내용과 선택 서명이 앱 밖에 노출된다는 점을 함께 설명합니다.')}`),
  page('FEATURE INVENTORY / 06', '안전·지원·운영 기능', '신고와 차단은 제품의 기본 경험입니다. 운영자 기능은 권한별로 제한되며 학생 앱과 별도 경로에서 제공됩니다.',
    `${reqTable(25,37)}${note('FR-30 AI 대화는 조건부 검증 후보입니다. FR-32~37 운영 기능은 안전 운영의 근거로 설명하되, 모든 운영자가 모든 신원을 볼 수 있는 것으로 표현하지 않습니다.')}`),
  page('TRUST & QUALITY / 07', '익명성은 범위를 설명할 때 신뢰가 된다', '학생 간 신원 비공개를 제공하지만, 권한 있는 운영자는 안전 운영을 위해 신원과 내용을 열람할 수 있습니다. 관련 접근은 기록되어야 합니다.',
    `${table(['정보/행동','학생에게 보이는 범위','설명할 때 지킬 기준'],[['랜덤채팅','익명 이름·소개·허용 뱃지·동의한 단계 정보','완전 익명 또는 신원 추론 불가로 보증하지 않기'],['편지 검색','수신 대상 이름·학년·학번·대표 뱃지','수신자 검색과 발신자 익명성을 구별하기'],['익명편지','본문·발신 시 성별·선택 서명','발신자 계정 이름/이메일 비공개'],['신고·차단','접수 및 본인의 조치 결과','신고자 신원과 상대의 차단 사실 비공개'],['삭제·사진 파기','본인 목록 숨김과 정리 대상 상태','전체 삭제/즉시 완전 파기로 표현하지 않기']])}<div class="section"><h3>사용 경험의 품질 기준 · 8개 NFR</h3><div class="summary-grid">${[
      ['NFR-01 · 신원과 권한','타인 접근을 서버에서 제한하고 신원 노출을 줄입니다. 운영 검증과 권한 경계 보완이 남아 있습니다.'],
      ['NFR-02 · 글과 상태 보존','계정별 초안 보존이 목표입니다. 편지·소개 자동 초안은 아직 보완 대상입니다.'],
      ['NFR-03 · 오류와 복구','로딩·빈 화면·오류·오프라인을 구별하고 재시도하도록 개선합니다.'],
      ['NFR-04 · 접근성','터치·확대·대비·낭독기·움직임 감소 기준을 적용하며 일부 공백이 있습니다.'],
      ['NFR-05 · 응답성','누름 반응과 진행 상태를 제공하고 긴 목록 성능을 검증합니다.'],
      ['NFR-06 · 비용과 운영','전송·AI·사진 이용량을 제한하고 실패/중복 처리를 보완합니다.'],
      ['NFR-07 · 모바일 호환','iOS/Android 설치·입력·뒤로가기·알림 복귀와 앱 갱신을 확인합니다.'],
      ['NFR-08 · 감사와 복구','민감한 열람을 기록하고 운영 변경·백업 복구 절차를 검증합니다.']
    ].map(([a,b])=>`<div class="card"><h4>${a}</h4><p>${b}</p></div>`).join('')}</div></div>${note('일반 채팅은 종료 24시간 경과 후 예약 정리 대상입니다. 신고 증거는 처리 완료 후 180일 정리 대상이며, 실제 삭제는 예약 실행/장애에 따라 지연될 수 있습니다.')}`),
  page('MEASUREMENT / 08', '다운로드보다, 서로 대화한 경험', '아래 지표는 계측 제안입니다. 현재 성과 수치·목표값·운영 기준선은 확인되지 않았습니다.',
    `<div class="bigquote">주간 유효 대화를 경험한 학생 수<small>핵심 지표 후보 · 실제 분석 이벤트나 검증된 성장 지표가 아님</small></div><div class="cols">${card('채팅의 유효 경험', '랜덤채팅에서 양쪽이 최소 한 번씩 메시지를 보낸 대화.')}${card('편지의 유효 경험', '최초 익명편지에 상대의 답장이 발생한 대화. 단순 전송 수와 AI 메시지는 제외합니다.')}</div><div class="section">${table(['관찰 단계','지표 후보','함께 볼 항목'],[['가입','학교 인증 → 온보딩 완료 비율','인증 실패·재전송·첫 설정 이탈'],['첫 경험','온보딩 후 7일 내 첫 유효 대화 비율','매칭 실패·신고/차단·반복 재시도'],['매칭','상대 찾기 → 방 배정 시간 p50/p95','중도 취소·접속 규모·선호/상한'],['대화','쌍방 메시지 / 쌍방 연장 비율','미입장·빠른 종료·거절 존중'],['편지','실제 전달된 최초 편지의 7일 내 답장 비율','미열람·수신 거부·무응답 연속 전송'],['재방문','D7 / 첫 주 재방문 비율','알림 피로·만족도·안전 지표'],['안전','신고 최초 검토 / 처리 시간·미처리 수','이의 제기·재신고·권한 오남용'],['운영','전송/부팅 실패·정리 지연·예약 작업 실패','재시도 비용과 중복 처리']])}</div>${callout('<strong>계측 원칙:</strong> 대화·편지 원문, 이름, 학번, 이메일, 사진을 분석 이벤트에 넣지 않습니다. 편지의 상세 전달 여부는 익명성 보호를 위해 서버 집계에서만 다룹니다.')}<p class="small spaced">7일 관찰창과 지표 정의는 제안입니다. 기준선을 먼저 측정하고 운영 인력·안전 지표와 함께 목표를 합의합니다.</p>`),
  page('MESSAGING / 09', '홍보 문구를 제품의 약속과 맞추기', '아래 문구는 마케팅팀이 검토할 초안입니다. 현재 캠페인, 사용자 후기, 성과가 존재한다는 뜻은 아닙니다.',
    `<div class="thirds">${card('인지 · 어떤 앱인가', '“우리 학교, 새로운 대화.”<br><br>같은 학교 학생과 랜덤채팅을 하거나 특정 학생에게 익명편지를 보내는 앱으로 설명합니다.')}${card('활성화 · 무엇을 할까', '“짧게 시작하고, 둘 다 원하면 더 이야기해요.”<br><br>쌍방 연장과 종료 선택을 소개하고 첫 대화까지 안내합니다.')}${card('재방문 · 왜 돌아올까', '“도착한 편지를 열고, 한마디로 답해요.”<br><br>학생의 알림 선택을 존중하며 과도한 접촉을 유도하지 않습니다.')}</div><div class="section"><h3>표현 점검표</h3>${table(['검토할 표현','제품에 맞는 설명'],[['“누구도 신원을 알 수 없는 완전 익명”','학생 간 신원 비공개. 권한 있는 운영자 열람과 감사 기록 설명'],['“누르면 바로 상대가 나타나요”','접속 학생·선호·운영 상태에 따라 매칭 대기 발생'],['“5분 후 무조건 정보 공개”','현재 기본 시작 시간 5분. 연장·공개는 양쪽 동의 필요'],['“보냈으니 상대가 받았어요”','전송 접수와 실제 전달·읽음을 구분'],['“지우면 모든 곳에서 즉시 사라져요”','내 목록 삭제와 상대 사본·신고 증거·예약 파기를 구분'],['“언제든 AI 상담을 받을 수 있어요”','조건부 대기 보조 봇. 전문 상담이나 상시 제공으로 설명하지 않기']])}</div><div class="section"><h3>랜딩/소개 콘텐츠 구성 제안</h3>${rail(['누구를 위한 앱인가','두 핵심 경험 소개','익명성·안전 설명','설치·인증 안내'])}</div>${note('설치 전 공개 소개/정책 페이지는 미결정 사항(D-01)입니다. 현재 학생 경로의 설치 게이트를 전제로, 랜딩 페이지가 이미 구현되었다고 홍보하지 않습니다.')}`),
  page('READINESS & DECISIONS / 10', '캠페인 전에 함께 결정할 것', '출시일·담당자·목표 수치는 합의 전입니다. 이미 구현된 제품의 신뢰와 운영 일관성을 먼저 정렬합니다.',
    `<div class="summary-grid">${card('A · 사용 신뢰와 안전', '부팅 복구, 글 초안, 종료 결과, 사진 심사와 신고 처리 안내.')}${card('B · 권한과 운영 일관성', '계정 재확인, 점검 차단, AI/알림 중복 방지와 운영 세션.')}${card('C · 읽기 품질과 확장', '접근성, 앱 갱신, 긴 대화/목록 성능, 동시 요청과 내보내기.')}${card('D · 제품 가설 검증', '첫 유효 대화 기준선, 설치 전 소개, 사용자 테스트와 연출 평가.')}</div><div class="section"><h3>미결정 항목 · 원문 D-01~08</h3>${table(['ID','논의할 질문'],[['D-01','설치 전에 제품 가치와 정책을 보여 줄 것인가?'],['D-02','다른 탭에서도 상대 찾기를 유지할 것인가? 현재는 홈 이탈 시 취소.'],['D-03','온보딩 전·이름 누락·점검 중 기능 자격의 예외 범위는?'],['D-04','탈퇴 요청의 본인 확인·담당자·계정/사진/상대 편지 파기 절차는?'],['D-05','AI 실패 재시도와 사용자 한도·비용 처리의 정책은?'],['D-06','종료된 방의 마지막 알림과 재접근을 어디까지 허용할 것인가?'],['D-07','성별·선호 옵션 확장을 위한 학생 조사와 안전 설계가 필요한가?'],['D-08','활성 사용자 목표, 신고 대응 시간과 실제 담당자는?']])}</div>${callout('<strong>홍보 전 확인:</strong> 실제 가입·첫 대화·편지 답장·신고·문의 경로, 모바일 호환, 운영 설정과 기능 활성 여부, 정책 안내와 데이터 처리의 일치 여부를 확인합니다.')}<p class="small spaced">출처: docs/PRD.md · docs/USER-FLOWS.md · docs/UX-GUIDELINES.md · 종합 검토 보고서.<br>이 편집본은 마케팅팀의 제품 이해와 메시지 검토용입니다. 상세 수용 기준·기술 근거는 원문을 우선합니다. 원문 변경 시 PDF도 다시 검토·생성합니다.</p>`)
];

const journeyData = [
  ['UF-01','설치와 첫 진입','학생이 자기 기기에서 앱을 열고 인증 단계로 이동합니다.','FR-01/05',
    ['배포 링크 열기','브라우저 확인','홈 화면에 추가','앱 아이콘으로 실행'],
    '인앱 브라우저에서는 외부 브라우저 또는 링크 복사를 안내합니다. 설치를 취소해도 다시 시도할 수 있습니다.',
    '설치 방법을 기기별로 안내합니다. 설치 전 제품 소개 공개 여부는 아직 결정되지 않았습니다.',
    '세션이 없으면 로그인/가입, 있으면 계정과 첫 설정을 확인합니다.'],
  ['UF-02','신규 가입과 첫 설정','학교 메일 인증 후 대화할 준비를 마칩니다.','FR-02/03',
    ['가입·학번 입력','메일 코드 확인','이름·비밀번호 설정','성별·선호·동의'],
    '코드 실패/만료는 재입력·재전송합니다. 필요한 설정이 저장되지 않으면 첫 설정에서 다시 시도합니다.',
    '학교 이메일 소유 확인입니다. 명단 이름은 자유 변경하지 않으며, 명단에 없으면 이름을 한 번 입력합니다.',
    '저장이 끝나면 채팅 홈과 첫 방문 안내로 이동합니다.'],
  ['UF-03','재로그인과 비밀번호 복구','다시 들어오거나 비밀번호를 바꿉니다.','FR-02/04',
    ['학번·비밀번호','인증·계정 확인','미완료 설정 확인','채팅 홈'],
    '분실 시 학교 메일 코드로 확인한 뒤 새 비밀번호를 설정합니다. 저장 실패는 완료로 안내하지 않아야 합니다.',
    '새 비밀번호는 8자 이상 영문·숫자 조건을 안내합니다. 서버의 실제 재인증 강제는 확인/보완 대상입니다.',
    '완료 계정은 홈, 이름/첫 설정 미완료 계정은 시작하기로 이동합니다.'],
  ['UF-04','새 상대 찾기','서로의 매칭 선호에 맞는 교내 학생을 찾습니다.','FR-06/07',
    ['홈에서 찾기','자격·상한 확인','조건에 맞는 대기','방 배정'],
    '상대 없음은 대기 상태입니다. 정지·운영 종료·동시 대화 상한이면 중단하고 이유를 안내합니다.',
    '바로 매칭됨을 약속하지 않습니다. 현재 홈을 떠나면 찾기가 취소되며 탭 간 유지 여부는 미결정입니다.',
    '매칭되면 대화방으로 이동합니다. 조건부 AI가 켜져 있으면 대기 보조 경험이 병행됩니다.'],
  ['UF-05','입장·대화·연장·고정','짧은 대화를 양쪽 동의로 이어갑니다.','FR-08~12',
    ['양쪽 입장','기본 5분 대화','연장·정보 공개 동의','최종 단계 뒤 고정'],
    '미입장·거절·만료·나가기 등으로 종료합니다. 전송 오류와 방 종료는 서로 다른 상태로 안내합니다.',
    '연장 기본 10분, 양쪽이 볼 때 시간이 흐름. 단계 공개·고정은 양쪽 동의가 필요합니다.',
    '고정은 제한 시간 없이 이어지고, 종료 후 자격이 있으면 매너 평가를 합니다.'],
  ['UF-06','신고·차단·나가기','불편한 접촉을 끝내고 필요한 검토를 요청합니다.','FR-25/26',
    ['방/편지 메뉴','행동·사유 선택','확인 후 서버 접수','종료·결과 확인'],
    '실패를 완료로 표시하지 않는 것이 목표입니다. 일부 나가기 경로의 실패 안내는 보완이 필요합니다.',
    '나가기, 내 편지 숨김, 차단, 신고는 효과가 다릅니다. 신고자 신원은 상대에게 공개하지 않습니다.',
    '차단은 채팅과 편지 접촉에 공유됩니다. 신고에는 증거·자동 차단·끝내기가 연결됩니다.'],
  ['UF-07','이름 검색과 익명편지 보내기','특정 학생에게 발신자 신원을 숨긴 편지를 씁니다.','FR-13~17',
    ['편지 쓰기 열기','이름 검색·대상 확인','본문·서식·서명 작성','접수·봉투 연출'],
    '잠금·사용량·본문 조건 또는 네트워크 오류는 안내합니다. 자동 초안 보존은 현재 보완 대상입니다.',
    '이름 2글자 이상 검색, 동명이인 확인, 최대 1,000자. 보냈다는 안내를 배달/읽음 보증으로 쓰지 않습니다.',
    '접수 성공 후 보낸 편지와 편지 홈에 반영합니다. 실제 전달과 접수는 구별됩니다.'],
  ['UF-08','봉투 열기와 답장','도착한 편지를 읽고 같은 익명 관계에서 답합니다.','FR-16/17',
    ['우체통/알림 선택','봉투 열기','본문·선택 서명 읽기','답장 작성·접수'],
    '없는/볼 수 없는 편지는 상위 목록으로 안내합니다. 로드 오류는 편지가 없는 상태와 구별해야 합니다.',
    '수신자는 익명 발신자 계정 이름·이메일을 보지 않습니다. 답장 후에도 익명 상대의 신원은 비공개입니다.',
    '읽음 상태와 안 읽은 수를 갱신하고 답장이 같은 대화 맥락으로 이어집니다.'],
  ['UF-09','보관·폴더·내 편지 삭제','내 편지를 정리하고 다시 읽습니다.','FR-18~20',
    ['받은/보낸 보관함','편지 선택','폴더 이동·이름 변경','보관·내 목록 삭제'],
    '받은 편지의 이동/삭제는 열어 본 편지만 가능합니다. 실패 시 목록을 실제 서버 결과로 복구합니다.',
    '폴더 삭제는 편지를 보관함으로 돌립니다. 내 편지 삭제는 상대 사본이나 대화 전체 삭제가 아닙니다.',
    '외부 이미지 공유는 명시적 선택입니다. 내용·서명이 앱 밖에 공개될 수 있음을 설명합니다.'],
  ['UF-10','프로필과 대표 업적','대화에 필요한 자기표현을 관리합니다.','FR-21/22',
    ['프로필 열기','소개·관심사 편집','대표 뱃지 선택/배치','저장·공개 범위 설정'],
    '신상정보·금칙어는 거절됩니다. 소개 초안과 연속 뱃지 재배치의 실패 복구는 보완 대상입니다.',
    '소개 60자·관심사 5개. 대표 칸은 기본 3개, 자격 충족 시 5개. 실명 자유 변경 기능은 아닙니다.',
    '채팅 뱃지 표시와 편지 검색의 표시 순서 선호를 구분해 관리합니다.'],
  ['UF-11','뱃지 신청과 심사 결과','증빙을 제출하고 승인/거절 결과를 확인합니다.','FR-23/24',
    ['신청 종류 선택','입력·사진 1~3장','신청·권한 있는 심사','결과·개인 공지'],
    '사진 업로드/신청 상한과 조건을 확인합니다. 대기 중 취소할 수 있으며 파기 실패는 재시도 대상입니다.',
    '증빙 사진은 비공개입니다. 권한 있는 심사자만 열람하며 즉시 완전 파기를 보증하지 않습니다.',
    '승인 시 뱃지가 부여됩니다. 거절은 사유와 결과를 안내하고 사진 정리 경로로 연결합니다.'],
  ['UF-12','공지와 문의','소식과 운영 답변을 본인에게 전달합니다.','FR-29',
    ['활동/설정에서 진입','공지 읽기·문의 작성','운영자 확인·답변','본인 목록·개인 공지'],
    '문의 미응답/일일 상한과 글 조건을 안내합니다. 신고는 증거·차단을 포함하므로 일반 문의와 구별합니다.',
    '이용·안전·계정·버그·기타 문의를 받습니다. 답변 시점이나 대응 시간을 합의 없이 약속하지 않습니다.',
    '답변은 본인 문의 목록과 개인 공지로 확인하며 조건에 따라 푸시도 전달됩니다.'],
  ['UF-13','알림으로 다시 들어오기','관심 있는 새 활동의 화면으로 복귀합니다.','FR-28 / NFR-07',
    ['알림 동의/설정','새 활동 알림','알림 누르기','자격 확인·화면 열기'],
    '세션 만료는 로그인, 미완료 설정은 시작하기를 우선합니다. 원래 목적지 복원은 전 경로 보장되지 않습니다.',
    '알림을 거절해도 핵심 기능은 사용할 수 있습니다. 잠금 화면 미리보기의 공개 범위는 확인이 필요합니다.',
    '볼 수 없는 대상은 목록/홈으로 안내하고, 점검 시 복귀 후 상태를 다시 확인합니다.'],
  ['UF-14','설정·로그아웃·삭제 요청','사용 경험과 수신 선호를 조절합니다.','FR-04/05/31',
    ['설정 열기','표시·편지·알림 조절','약관·문의 확인','로그아웃/계정 문의'],
    '표시 설정 초기화·로그아웃은 계정 삭제가 아닙니다. 현재 자동 계정 삭제 완료 버튼은 없습니다.',
    '기기 표시 설정과 계정 수신 설정을 구별합니다. 탈퇴는 계정 문의와 운영 절차를 연결해야 합니다.',
    '로그아웃은 이전 계정 데이터를 격리합니다. 삭제 요청의 담당·본인 확인·파기 범위는 미결정입니다.'],
  ['UF-15','운영 로그인과 신고 처리','권한 범위에서 증거를 검토하고 조치합니다.','FR-32~34',
    ['별도 운영 로그인','명단·권한 확인','신고·증거 검토','조치·기록·결과'],
    '권한 없는 접근은 거절합니다. 신원 열람의 기록 실패 시 신원을 반환하지 않습니다.',
    '일반 운영자의 기본 권한에 신원 열람은 없습니다. 제재 범위는 역할에 따라 제한됩니다.',
    '경고/정지/해제와 처리 상태를 기록합니다. 정지 시 열린 방과 대기를 종료합니다.'],
  ['UF-16','서비스 설정과 운영진 관리','제공 상태와 운영 권한을 통제합니다.','FR-35~37',
    ['권한 있는 설정 진입','영향 확인·수치 변경','저장·변경 기록','다음 요청에 반영'],
    '서비스 닫기와 모든 진행 대화 즉시 종료는 같은 행동이 아닙니다. 점검 안내 종료 시각은 자동 해제를 보증하지 않습니다.',
    '최고 관리자가 운영진·역할별 권한을 관리합니다. 실제 기능 제공 여부는 대상 환경 설정을 확인합니다.',
    '학생은 운영/점검 상태를 재확인합니다. 점검 종료는 운영자 조치로 연결합니다.'],
  ['UF-17','매칭 대기 중 AI 대화','사람을 기다리는 시간을 조건부 봇이 보조합니다.','FR-30',
    ['사람 찾기 시작','20초 대기·활성 확인','AI 표시된 대화','사람 매칭 시 종료'],
    '예산·시간·턴 제한 또는 장애면 안내/종료합니다. 점검 검사와 실패 재시도 중복은 보완 대상입니다.',
    '기본 꺼짐. 전문 상담이나 운영자 대화가 아닙니다. 봇 대화 중에도 사람 찾기는 계속됩니다.',
    '사람과 매칭되면 실제 대화방으로 이동합니다. 원문은 호출 시 모델에 전달되며 사용량 기록은 남습니다.']
];
const sourceUfIds = [...flows.matchAll(/^## (UF-\d{2}) —/gm)].map(m => m[1]);
if (journeyData.length !== 17 || JSON.stringify(sourceUfIds) !== JSON.stringify(journeyData.map(j=>j[0]))) throw new Error('User-flow coverage mismatch');
function journey(id) {
  const [code,title,goal,ref,steps,recovery,messaging,result] = journeyData.find(j=>j[0]===id);
  return `<article class="flow" data-uf="${code}"><div class="flowhead"><span class="pill">${code}</span><h3>${title}</h3><span class="ref">${ref}</span></div><p class="goal">${goal}</p>${rail(steps)}<div class="cols"><div><h4>예외·복구 / 보완</h4><p>${recovery}</p></div><div><h4>안내·콘텐츠 포인트</h4><p>${messaging}</p></div></div><p class="result">완료 결과 · ${result}</p></article>`;
}

const flowPages = [
  page('JOURNEY PLAYBOOK / 01', '사용자의 다음 행동이<br>보이는 유저 플로우.', '설치와 첫 대화에서 편지 답장, 안전 운영까지.<br>학생·운영자의 17개 과업을 행동과 안내 중심으로 정리했습니다.',
    `${art}<div class="thirds">${card('행동', '어디서 시작해 어떤 순서로 진행하는지 봅니다.', '01')}${card('복구', '대기·실패·제한 때 필요한 다음 안내를 확인합니다.', '02')}${card('메시지', '기능의 실제 범위에 맞는 콘텐츠를 준비합니다.', '03')}</div><p class="cover-meta">마케팅팀을 위한 유저 플로우 편집본 · UF-01~17 전체 포함<br>도식은 사용자 경험 설명용이며 실제 앱 화면 캡처가 아닙니다.</p><div class="toc"><span>전체 여정 02</span><span>가입·채팅 03–06</span><span>편지·재방문 07–10</span><span>운영·AI·점검 11–13</span></div>`, 'cover'),
  page('JOURNEY MAP / 02', '하나의 진입, 두 가지 대화 경험', '학생 앱은 설치·세션·첫 설정·점검 여부를 확인한 뒤 핵심 화면으로 들어갑니다. 운영자는 별도 로그인 경로를 사용합니다.',
    `<div class="map-group"><h3>공통 시작</h3>${rail(['배포 링크','홈 화면 설치','학교 인증·로그인','첫 설정 완료'])}<p class="small spaced">이미 설치·인증된 학생은 필요한 단계를 건너뜁니다. 미완료 설정은 시작하기로, 점검 중이면 안내 화면으로 이동합니다.</p></div><div class="cols"><div class="map-group"><h3>랜덤채팅 경로</h3>${rail(['찾기','입장','대화'])}${rail(['동의·연장','고정/종료'])}<p class="small spaced">UF-04~05 · 원하는 경우만 이어가기</p></div><div class="map-group"><h3>익명편지 경로</h3>${rail(['이름 검색','작성','접수'])}${rail(['봉투 열기','답장·보관'])}<p class="small spaced">UF-07~09 · 발신자 익명성 유지</p></div></div><div class="thirds">${card('자기표현', '프로필·대표 업적·뱃지 신청<br>UF-10~11')}${card('소식과 재방문', '공지·문의·알림·설정<br>UF-12~14')}${card('안전과 운영', '신고·차단·운영 조치<br>UF-06 / UF-15~16')}</div>${callout('<strong>조건부 경로:</strong> UF-17 AI 봇은 기능이 켜진 매칭 대기에서만 등장합니다. 사람 찾기를 대체하지 않으며 사람과 매칭되면 종료됩니다.')}<p class="small spaced">현재 하단 탐색: 익명편지 / 채팅 / 프로필. 세 탭의 루트에서 표시되며 상세 화면은 뒤로가기로 상위 맥락에 복귀합니다.</p>`),
  page('ACQUISITION & ACTIVATION / 03', '설치에서 첫 설정까지', '설치만으로 가입은 끝나지 않습니다. 학교 메일 인증과 첫 설정을 각각 구분해 안내합니다.',
    `${journey('UF-01')}${journey('UF-02')}${callout('<strong>가입 안내:</strong> 설치 → 학교 메일 인증 → 첫 설정을 따로 설명합니다. 학생이 메일 수신/코드 입력/이름 확인/비밀번호 설정 중 어디에 있는지 이해할 수 있게 합니다.')}<div class="section"><h3>첫 방문 콘텐츠 점검</h3><ul><li>iOS/Android/인앱 브라우저에 맞는 설치 안내</li><li>메일·스팸함·코드 만료/재전송 안내</li><li>학교 명단 이름 확인과 이름 없는 계정의 분기</li><li>성별·선호 설정, 안전 규칙과 첫 방문 안내</li></ul></div>`),
  page('RETURN TO CHAT / 04', '다시 로그인하고, 새 상대를 찾기', '대기는 정상적인 제품 상태입니다. 상대가 없을 때 필요한 설명과 취소 선택을 제공합니다.',
    `${journey('UF-03')}${journey('UF-04')}<div class="section cols">${card('분실 복구의 분기', '학교 메일로 코드를 확인한 뒤 새 비밀번호를 설정합니다. 미완료 첫 설정이 있으면 시작하기가 우선할 수 있습니다.')}${card('대기를 설명하는 안내', '상대 없음·조건 제한·오류를 구분합니다. 대기 시간은 실제 접속 규모와 선호·서비스 상태에 따라 달라집니다.')}</div>${note('현재 홈 이탈 시 찾기를 취소합니다. 다른 탭에서 유지하는 경험은 결정 전이며, 기존 구현처럼 안내하지 않습니다.')}`),
  page('CONVERSATION / 05', '함께 동의할 때 대화가 이어진다', '짧게 시작하고, 정보를 공개하거나 대화를 계속할지 양쪽이 선택합니다.',
    `${journey('UF-05')}<div class="section"><h3>대화 상태의 변화</h3>${rail(['입장 대기','대화 중','연장 선택','고정 / 종료'])}<div class="state-map"><div class="card"><h4>잠시 이탈</h4><p>대화 시계 정지<br>양쪽 재입장 시 재개</p></div><div class="card"><h4>쌍방 동의</h4><p>기본 10분 연장<br>다음 단계 정보 공개</p></div><div class="card"><h4>거절·만료·나가기</h4><p>대화 종료<br>홈 / 새 상대 찾기</p></div></div></div><div class="section"><h3>정보 공개와 고정의 순서</h3>${rail(['학년','공통 질문 1','디플로마','공통 질문 2','동아리'])}<p class="small">다섯 단계 이후 다음 연장 구간에서 쌍방 동의하면 고정됩니다. 고정 전까지는 시간과 동의 규칙을 따릅니다.</p></div>${callout('<strong>안내 문구의 핵심:</strong> “더 이야기하고 싶으면 함께 연장해요.” 자동으로 실명이 공개되는 앱이나 상대의 연장 요청을 반드시 받아야 하는 경험으로 설명하지 않습니다.')}<p class="small spaced">일반 대화에서 한쪽이 오래 돌아오지 않으면 종료로 연결됩니다. 종료 후 자격 있는 학생은 매너 평가를 할 수 있으며 결과는 지연·묶음 반영됩니다.</p>`),
  page('SAFETY / 05', '안전 행동은 쉽게 구별되어야 한다', '관계를 끝내는 행동과 운영 검토를 요청하는 행동의 효과를 각각 설명합니다.',
    `${journey('UF-06')}<div class="section">${table(['행동','사용자에게 생기는 변화','콘텐츠에서 구별할 점'],[['채팅 나가기','현재 대화방 종료','차단이나 신고를 뜻하지 않음'],['내 편지 삭제','내 편지함/폴더에서 숨김','상대 사본은 남을 수 있고 새 답장 가능'],['받은 편지 버리기','내 쪽에서 숨김/끝내기 및 수신 거절 효과','보관함 정리와 접촉 거절의 차이'],['차단','두 계정 사이 접촉 제한·기존 채팅 종료','채팅과 편지에 효과 공유'],['신고','사유·증거 접수·자동 차단·끝내기','일반 문의와 다른 안전 처리']])}</div><div class="section"><h3>안전 안내의 세 원칙</h3><div class="principle"><b>1</b><div><strong>효과를 행동 전에 설명</strong><p>학생이 대화 종료·수신 거절·신고를 혼동하지 않게 합니다.</p></div></div><div class="principle"><b>2</b><div><strong>서버 결과를 기준으로 확인</strong><p>통신 실패를 접수 성공으로 안내하지 않는 것이 수용 기준입니다.</p></div></div><div class="principle"><b>3</b><div><strong>익명성을 해치지 않는 결과 안내</strong><p>신고자 신원이나 차단 사실을 상대 신원 추론 단서로 공개하지 않습니다.</p></div></div></div>${callout('<strong>원하는 경험:</strong> 불편해진 학생이 이유를 길게 설명하지 않아도 접촉을 끝내고, 필요하면 운영 검토를 요청할 수 있어야 합니다.')}`),
  page('LETTERS / 06', '한마디를 보내고, 답장으로 이어가기', '수신자를 이름으로 고르는 경험과 발신자의 익명성을 함께 이해해야 합니다.',
    `${journey('UF-07')}${journey('UF-08')}<div class="section cols">${card('수신자 확인', '이름·학년·학번으로 동명이인을 구별합니다. “아무나에게 보내는 익명 게시물”로 소개하지 않습니다.')}${card('발신자 비공개', '원래 발신자는 수신자를 알고, 수신자는 익명 상대의 계정 신원을 모르는 관계가 답장 후에도 유지됩니다.')}</div>${callout('<strong>접수와 전달의 차이:</strong> 차단·수신 거부 등에 따른 전달 차이를 발신 결과에 드러내지 않을 수 있습니다. “보냈어요”를 “상대가 받았어요”로 바꾸지 않습니다.')}`),
  page('PERSONAL SPACE / 07', '편지를 정리하고, 나를 표현하기', '내 목록을 관리하는 행동과 상대와의 접촉을 끊는 행동을 구별합니다.',
    `${journey('UF-09')}${journey('UF-10')}<div class="section cols">${card('편지는 개인 공간', '받은/보낸 보관함과 개인 폴더로 다시 읽습니다. 폴더 이름은 최대 20자, 폴더는 기본 최대 30개입니다.')}${card('프로필은 대화의 보조', '소개·관심사·MBTI·업적·교복 뱃지로 표현합니다. 뱃지는 신원 추론 단서가 될 수 있어 공개 선호를 관리합니다.')}</div>${note('표시 설정과 기기 테마는 상대 화면을 바꾸지 않습니다. 뱃지 표시와 익명성의 관계를 설명하고, 앱 밖 이미지 공유는 사용자의 명시적 선택으로 안내합니다.')}`),
  page('SERVICE & SUPPORT / 08', '인증 신청과 운영 답변의 연결', '학생의 제출 → 권한 있는 운영 검토 → 본인에게 결과 전달까지 하나의 경험으로 봅니다.',
    `${journey('UF-11')}${journey('UF-12')}<div class="section"><h3>뱃지 심사 결과 분기</h3><div class="state-map"><div class="card"><h4>승인</h4><p>대상에게 뱃지 부여<br>신청 결과·개인 공지</p></div><div class="card"><h4>거절</h4><p>사유와 결과 전달<br>개인 공지에서 확인</p></div><div class="card"><h4>취소 / 미제출</h4><p>학생 취소 또는 남은 파일<br>사진 정리 대상</p></div></div></div>${note('사진 정리는 비동기 작업이며 실패 시 재시도합니다. 심사 완료 시각과 사진 완전 파기 시각이 항상 같다고 안내하지 않습니다. 문의 답변과 안전 신고는 다른 처리 경로입니다.')}`),
  page('RETURN & CONTROL / 09', '돌아올 이유와 수신 통제권', '알림은 재방문 수단이며 필수 사용 조건이 아닙니다. 사용자가 수신과 표시 방식을 선택합니다.',
    `${journey('UF-13')}${journey('UF-14')}<div class="section cols">${card('복귀 안내', '볼 수 없는 대상은 목록/홈으로, 점검 중에는 점검 안내로 연결합니다. 알림 거절·미지원이면 앱 목록에서 직접 확인합니다.')}${card('설정의 저장 범위', '표시·테마 등 기기 설정과 편지 받기·추천 포함 등의 계정 설정을 구분합니다.')}</div>${callout('<strong>탈퇴 설명:</strong> 현재 셀프서비스 계정 삭제 완료 버튼은 없습니다. 계정 문의와 본인 확인·운영 담당·파기 범위의 절차를 정해야 합니다. “로그아웃하면 삭제”로 설명하지 않습니다.')}`),
  page('OPERATIONS / 10', '안전 약속을 뒷받침하는 운영 여정', '운영 역할명만으로 접근 범위를 단정하지 않습니다. 실제 권한 목록과 서버 검사를 따릅니다.',
    `${journey('UF-15')}${journey('UF-16')}<div class="section">${table(['초기 역할','기본 운영 범위'],[['운영자','실시간 현황·신고/제재·서비스 열고 닫기·문의·감사'],['개발자','실시간 현황·운영 설정·서비스 열고 닫기·문의·감사'],['베타테스터','실시간 현황'],['관리자 / 최고 관리자','모든 제품 운영 권한 / 최고 관리자만 운영진·역할별 권한 관리']])}</div>${note('최고 관리자가 역할별 권한을 바꿀 수 있어 위 범위는 초기값입니다. 신원 열람 권한과 역할별 제재 제한은 다른 개념이며, 개별 운영 세션 폐기는 보완 대상입니다.')}`),
  page('CONDITIONAL EXPERIENCE / 11', 'AI는 대기 보조, 사람 연결은 계속', '기능이 활성화된 경우에만 사용하는 보조 경로입니다. 사람 매칭·상담·운영 답변과 구별합니다.',
    `${journey('UF-17')}<div class="map-group"><h3>대기 중 두 경로</h3>${rail(['사람 찾기 유지','AI 봇 창에서 대화','사람 매칭 성공','봇 종료·대화방'])}<p class="small spaced">봇 창만 닫아도 같은 찾기 세션에서는 자동으로 다시 열리지 않습니다. 사람 매칭되면 늦은 봇 답을 현재 방에 반영하지 않아야 합니다.</p></div><div class="cols">${card('제공 조건', '기본 꺼짐. 활성화 시 20초 이상 대기에서 한 번 시작합니다. 기본 세션 10분·30턴이며 실제 예산/환경 설정을 확인합니다.')}${card('대화와 데이터', 'AI임을 표시합니다. 원문은 호출 시 모델에 전달되며 DB에 영속 저장하지 않는 정책입니다. 사용량 메타데이터는 보관됩니다.')}</div><div class="section"><h3>콘텐츠를 준비하기 전 점검</h3><ul><li>운영 환경에서 AI가 실제로 켜져 있는가?</li><li>시간·턴·이용량 종료 안내와 모델 장애 안내가 준비되어 있는가?</li><li>점검 차단과 같은 턴 재시도 중복 처리의 보완이 완료되었는가?</li><li>AI를 전문 상담 또는 항상 만날 수 있는 사람처럼 소개하지 않는가?</li></ul></div>${callout('<strong>홍보 원칙:</strong> 핵심 두 경험인 랜덤채팅과 익명편지를 먼저 설명합니다. AI는 활성화와 운영 검증이 확인된 경우 부가 기능으로 다룹니다.')}`),
  page('CONTENT HANDOFF / 12', '여정별로 준비할 콘텐츠', '제안 항목은 제작·계측이 이미 끝났다는 뜻이 아닙니다. 실제 운영 상태와 원문 명세를 확인하며 사용합니다.',
    `${table(['단계','관련 과업','마케팅/운영 콘텐츠 준비'],[['진입·가입','UF-01~03','기기별 설치 안내, 학교 메일 인증, 첫 설정과 복구 설명'],['첫 채팅','UF-04~05','매칭 대기, 대화 시계, 연장 동의, 종료·다음 행동'],['안전','UF-06','나가기·차단·신고의 차이와 접수 결과'],['첫 편지','UF-07~08','수신자 확인, 발신자 비공개, 접수/읽음 구별, 답장'],['개인 공간','UF-09~10','삭제/폴더/외부 공유 차이, 소개·뱃지 공개 범위'],['지원','UF-11~12','증빙 비공개와 심사 결과, 문의·공지·답변 경로'],['재방문·통제','UF-13~14','알림 동의와 복귀, 수신 선호, 로그아웃·탈퇴 요청 구별'],['운영·보조','UF-15~17','권한별 운영 범위, 점검 영향, 조건부 AI 표시']])}<div class="section"><h3>네 가지 공통 확인</h3><div class="summary-grid">${card('01 · 실제 제공 상태', '잠금·점검·정지·권한·AI 활성 여부와 코드 기본값을 구분합니다.')}${card('02 · 실패 후 다음 행동', '인증 실패·대기·접수 실패·접근 불가에 재시도/이동 안내가 있는지 봅니다.')}${card('03 · 약속의 정확성', '동의·익명성·수신/삭제·데이터 보존 범위를 과장하지 않습니다.')}${card('04 · 성과의 근거', '다운로드가 아니라 쌍방 메시지/답장을 기준으로 첫 유효 대화를 측정하는 안을 검토합니다.')}</div></div>${note('실기기와 실제 운영 환경에서 모든 경로를 검증한 문서가 아닙니다. 원문의 “보완”을 현재 구현 완료로 바꾸지 않았으며, 중요한 공백을 각 여정에 표시했습니다.')}<p class="small spaced">출처: docs/USER-FLOWS.md · docs/PRD.md · docs/UX-GUIDELINES.md · 종합 검토 보고서.<br>상세 화면 경로·정책·수용 기준·기술 근거는 원문을 우선합니다. 원문 변경 시 각 과업과 안내 문구를 다시 검토하고 PDF를 재생성합니다.</p>`)
];

await mkdir(out, { recursive: true });
let executablePath = process.env.LANDY_PDF_BROWSER;
if (!executablePath) {
  for (const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']) {
    try { await access(candidate); executablePath = candidate; break; } catch { /* try next local browser */ }
  }
}
if (!executablePath) throw new Error('Set LANDY_PDF_BROWSER to a local Chrome/Edge executable');
const browser = await chromium.launch({ executablePath, headless: true });
const docs = [
  { name:'Landy-PRD-Marketing', title:'제품 요구사항 · PRD', kind:'PRODUCT', pages:prdPages },
  { name:'Landy-User-Flows-Marketing', title:'유저 플로우', kind:'JOURNEYS', pages:flowPages }
];
const report = [];
try {
  for (const doc of docs) {
    const html = render(doc.pages, doc.kind, doc.title);
    if (html.includes('\uFFFD')) throw new Error('Invalid Unicode');
    const htmlPath = join(scratch, doc.name + '.html');
    await writeFile(htmlPath, html);
    const view = await browser.newPage({ viewport:{width:794,height:1123}, deviceScaleFactor:1 });
    // This document is self-contained. Reject every network request.
    await view.route(/^https?:/, route => route.abort());
    await view.goto(pathToFileURL(htmlPath).href);
    await view.emulateMedia({ media:'print' });
    await view.evaluate(() => document.fonts.ready);
    const layout = await view.evaluate(() => ({
      fontLoaded: document.fonts.check('12px Wanted'),
      pages: [...document.querySelectorAll('.page')].map(p => {
        const b=p.getBoundingClientRect(), f=p.querySelector('.footer').getBoundingClientRect(), m=p.querySelector('main').getBoundingClientRect();
        const overflow=[...p.querySelectorAll('main *')].filter(e=>{
          const r=e.getBoundingClientRect();
          const decoration=e.matches('.step,.cover-art,.chat-art');
          return r.right>b.right-35 || r.left<b.left+35 || r.bottom>f.top-10 || (!decoration && e.scrollWidth>e.clientWidth+2);
        }).map(e=>({tag:e.tagName,text:e.textContent.slice(0,60)}));
        return {page:Number(p.dataset.page), contentBottom:Math.round(m.bottom-b.top), footerTop:Math.round(f.top-b.top), overflow};
      })
    }));
    if (!layout.fontLoaded || layout.pages.some(p=>p.overflow.length)) throw new Error(JSON.stringify({doc:doc.name,layout}));
    const pdf = await view.pdf({ path:join(out,doc.name+'.pdf'), preferCSSPageSize:true, printBackground:true, tagged:true, outline:true });
    const pageCount = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
    if (pageCount !== doc.pages.length) throw new Error(`PDF pages ${pageCount} != expected ${doc.pages.length}`);
    const previews=[];
    for (let i=0;i<doc.pages.length;i++) {
      const img = join(scratch,`${doc.name}-${i+1}.png`);
      await view.locator('.page').nth(i).screenshot({path:img}); previews.push(img);
    }
    report.push({file:join(out,doc.name+'.pdf'),pages:pageCount,bytes:pdf.length,fontLoaded:layout.fontLoaded,layout,previews});
    await view.close();
  }
} finally { await browser.close(); }
await writeFile(join(scratch,'validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({ scratch, coverage:{FR:requirements.length,NFR:nfrIds.length,UF:journeyData.length}, documents:report.map(({layout,previews,...r})=>r)},null,2));
