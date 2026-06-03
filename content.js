// content.js

// 중복 주입 가드 (manifest 자동 주입 + background.js 재주입으로 인한 재선언 방지)
if (!window.__nuiContentLoaded) {
window.__nuiContentLoaded = true;

// ══════════════════════════════════════════════════════════════
// 0. 상태
// ══════════════════════════════════════════════════════════════
let guide = { active: false, sequence: [], stepIdx: 0, timer: null, clickTarget: null, clickHandler: null };
const HIGHLIGHT_MS = 1800;

// 페이지 리로드/전환 후에도 위젯이 유지되도록 상태를 storage에 저장
const WIDGET_OPEN_KEY  = 'nextui_widget_open';   // 위젯 열림 여부
const WIDGET_POS_KEY   = 'nextui_widget_pos';    // 드래그한 위치
const WIDGET_DRAFT_KEY = 'nextui_widget_draft';  // 입력 중이던 텍스트

// 목표 기반 멀티페이지 안내: 사용자의 "최종 목표"를 storage에 저장해 두고
// 페이지가 바뀔 때마다 현재 페이지를 다시 분석해 다음 클릭을 재계획한다.
const GOAL_KEY  = 'nextui_goal';                 // { goal: string, ts: number }
const GOAL_TTL  = 10 * 60 * 1000;                // 목표 유효시간 10분
// 매 동작마다 DOM을 다시 읽어 "다음 한 동작"만 계획하는 observe→act 루프를 쓴다.
// 무한루프 방지: "같은 동작"이 연속으로 반복되면(진전 없음) 멈춘다.
let lastActionKey   = '';
let sameActionCount = 0;
function actionKey(s) { return `${s?.action || 'click'}|${s?.selector || ''}|${s?.value || ''}`; }
function resetActionGuard() { lastActionKey = ''; sameActionCount = 0; }
// 진행 중이던 AI 응답이 "중단/닫기 이후"에 뒤늦게 화면을 그리는 것을 막는 토큰.
// 새 계획 시작·중단 때 값을 올려서, 옛 콜백이 자기 토큰과 다르면 무시하게 한다.
let planToken = 0;


// ══════════════════════════════════════════════════════════════
// 1. DOM 크롤링
// ══════════════════════════════════════════════════════════════
function getAllElements() {
  const sel = [
    'a','button',
    '[role="button"]','[role="menuitem"]','[role="tab"]','[role="option"]',
    'input[type="button"]','input[type="submit"]','input[type="reset"]',
    // 입력/선택 폼 필드 (type/select 액션 대상)
    'input[type="text"]','input[type="search"]','input[type="number"]','input[type="tel"]',
    'input:not([type])','textarea','select',
    'input[name*="search" i]','input[id*="search" i]','input[class*="search" i]',
    'input[placeholder]',
    'summary','nav li a','.gnb a','.lnb a',
    '[class*="menu"] a','[class*="nav"] a','[class*="depth"] a','[class*="sub"] a',
  ].join(',');

  const seen = new Set();
  const items = Array.from(document.querySelectorAll(sel))
    .map((el, i) => {
      const tag  = el.tagName.toLowerCase();
      // 입력/선택 가능한 폼 필드인지 (AI가 type/select 액션 대상으로 고를 수 있게)
      const isField = tag === 'textarea' || tag === 'select' ||
        (tag === 'input' && !['button','submit','reset','checkbox','radio','hidden'].includes((el.getAttribute('type') || 'text').toLowerCase()));
      const label = isField ? getFieldLabel(el) : '';
      const text = getElText(el) || label;
      if (!text) return null;
      const s = getUniqueSelector(el);
      if (seen.has(s)) return null;
      seen.add(s);
      const rect = el.getBoundingClientRect();
      const cs   = window.getComputedStyle(el);
      const obj = {
        index: i, tag, text: text.substring(0, 60),
        id: el.id || '', selector: s, href: typeof el.href === 'string' ? el.href : '',
        inputType: el.getAttribute ? (el.getAttribute('type') || '') : '',
        isTextInput: isField,
        isVisible: rect.width > 0 && rect.height > 0,
        wasHidden: cs.display === 'none' || cs.visibility === 'hidden',
        location: { x: Math.round(rect.left), y: Math.round(rect.top) },
        size:     { width: Math.round(rect.width), height: Math.round(rect.height) },
      };
      if (label) obj.label = label.substring(0, 40);            // 연결된 라벨 (필드 식별용)
      if (tag === 'select') obj.options = getSelectOptions(el);  // 선택지 목록
      // 직접 입력 불가(readonly/disabled) + 옆 조회/검색 버튼이 있는 "선택형" 필드 표시
      if (isField && tag !== 'select') {
        if (el.readOnly || el.disabled) obj.readOnly = true;
        const lb = findNearbyLookupButton(el);
        if (lb) obj.lookup = (lb.textContent || lb.value || '조회').trim();
      }
      return obj;
    })
    .filter(Boolean);

  // ★ 화면에 "보이는" 요소를 앞으로 정렬한 뒤 자른다.
  //   (홈택스처럼 숨김 메가메뉴 링크가 수백 개면, 문서 순서로 자르면
  //    정작 보이는 검색 결과가 잘려서 AI가 못 보던 문제 해결)
  //   보이는 것끼리는 원래 순서 유지(안정 정렬).
  items.sort((a, b) => (b.isVisible === true ? 1 : 0) - (a.isVisible === true ? 1 : 0));
  return items.slice(0, 250);
}

function getElText(el) {
  // el.value 가 문자열이 아닐 수 있음(숫자형 value, DOM clobbering 등) → 타입 가드
  const val = typeof el.value === 'string' ? el.value.trim() : '';
  return el.innerText?.trim() || el.textContent?.trim() ||
         el.getAttribute?.('aria-label')?.trim() || el.getAttribute?.('title')?.trim() ||
         el.getAttribute?.('placeholder')?.trim() ||
         val ||
         el.getAttribute?.('name')?.trim() || '';
}

// 폼 필드에 연결된 라벨 텍스트 (예: "증여자와의 관계", "재산가액") — AI의 필드 식별을 돕는다
function getFieldLabel(el) {
  try {
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab && lab.textContent.trim()) return lab.textContent.trim();
    }
    const wrap = el.closest && el.closest('label');
    if (wrap && wrap.textContent.trim()) return wrap.textContent.trim();
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const ph = el.getAttribute && el.getAttribute('placeholder');
    if (ph && ph.trim()) return ph.trim();
  } catch {}
  return '';
}

// select 의 선택지 텍스트 목록 (AI가 어떤 옵션을 고를지 판단)
function getSelectOptions(el) {
  try {
    return Array.from(el.options || []).map(o => (o.textContent || o.value || '').trim())
      .filter(Boolean).slice(0, 30);
  } catch { return []; }
}

// 입력칸 근처에 "조회/검색/찾기/선택" 버튼이 있으면 반환 (= 팝업으로 채우는 lookup 필드)
function findNearbyLookupButton(el) {
  try {
    const re = /조회|검색|찾기|선택|돋보기/;
    const ir = el.getBoundingClientRect();
    if (ir.width <= 0 && ir.height <= 0) return null;

    // 입력칸에서 위로 몇 단계 조상까지 넓혀 후보를 모은 뒤, "같은 줄·오른쪽 근처"를 위치로 고른다.
    let scope = el;
    for (let up = 0; up < 6 && scope.parentElement; up++) scope = scope.parentElement;
    scope = scope || document.body;
    const cands = Array.from(scope.querySelectorAll(
      'button,a,input[type="button"],input[type="submit"],input[type="image"],[role="button"],span[onclick],img[onclick]'
    ));

    let best = null, bestDist = Infinity;
    for (const b of cands) {
      if (b === el) continue;
      const t = (b.textContent || b.value || (b.getAttribute && (b.getAttribute('aria-label') || b.getAttribute('title') || b.getAttribute('alt'))) || '').trim();
      if (!t || !re.test(t)) continue;
      const r = b.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      // 같은 줄(세로로 겹침) + 입력칸 오른쪽 가까이(또는 살짝 겹침)
      const sameRow = Math.abs(r.top - ir.top) < Math.max(ir.height, r.height) * 1.6;
      if (!sameRow) continue;
      const dx = r.left - ir.right;            // 입력칸 오른쪽 끝으로부터의 거리
      if (dx < -ir.width || dx > 220) continue; // 너무 멀면 다른 칸의 버튼 → 제외
      const dist = Math.abs(dx);
      if (dist < bestDist) { bestDist = dist; best = b; }
    }
    return best;
  } catch {}
  return null;
}

function getUniqueSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const parts = []; let cur = el;
  while (cur && cur.nodeType === 1 && cur.tagName !== 'BODY') {
    let seg = cur.tagName.toLowerCase();
    if (cur.id) { seg = `#${CSS.escape(cur.id)}`; parts.unshift(seg); break; }
    const sibs = Array.from(cur.parentNode?.children || []).filter(c => c.tagName === cur.tagName);
    if (sibs.length > 1) seg += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
    parts.unshift(seg); cur = cur.parentNode;
  }
  return parts.join(' > ');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


// ══════════════════════════════════════════════════════════════
// 2. 스타일
// ══════════════════════════════════════════════════════════════
function injectStyles() {
  if (document.getElementById('nui-styles')) return;
  const s = document.createElement('style');
  s.id = 'nui-styles';
  s.textContent = `
    /* ── 오버레이 (시각용 — 클릭은 document 레벨에서 처리) ── */
    #nui-overlay {
      position:fixed; inset:0; background:rgba(0,0,0,0.15);
      z-index:999990; pointer-events:none;
      animation:nui-in .25s ease;
    }

    /* ── 버튼 강조 글로우 ── */
    .nui-target {
      position:relative !important;
      z-index:999999 !important;
      border-radius:6px !important;
      outline: 3px solid #00d4ff !important;
      outline-offset: 3px !important;
      box-shadow:
        0 0 0 6px rgba(0,212,255,0.25),
        0 0 20px 8px rgba(0,212,255,0.5),
        0 0 55px 18px rgba(0,212,255,0.2) !important;
      animation: nui-glow 1.6s ease-in-out infinite !important;
      transition: box-shadow .3s ease !important;
    }
    @keyframes nui-glow {
      0%,100% {
        box-shadow:
          0 0 0 6px rgba(0,212,255,0.25),
          0 0 20px 8px rgba(0,212,255,0.5),
          0 0 55px 18px rgba(0,212,255,0.2);
      }
      50% {
        box-shadow:
          0 0 0 8px rgba(0,212,255,0.35),
          0 0 36px 14px rgba(0,212,255,0.75),
          0 0 75px 28px rgba(0,212,255,0.35);
      }
    }

    /* ── 화살표 (타겟 오른쪽에 살짝 겹치게) ── */
    #nui-arrow {
      position:fixed; z-index:1000000; font-size:30px; pointer-events:none;
      filter: drop-shadow(0 0 6px #00d4ff) drop-shadow(0 0 14px rgba(0,212,255,0.6));
      animation: nui-bounce .85s ease-in-out infinite;
    }
    @keyframes nui-bounce {
      0%,100% { transform: translateX(0); }
      50%      { transform: translateX(-8px); }
    }

    /* ── 단계 툴팁 ── */
    #nui-tip {
      position:fixed; z-index:1000000;
      background: linear-gradient(135deg, rgba(5,5,16,0.97), rgba(7,20,44,0.97));
      border: 1px solid rgba(0,212,255,0.45);
      border-radius: 14px; padding: 14px 18px; max-width: 290px;
      box-shadow: 0 10px 32px rgba(0,0,0,0.5), 0 0 20px rgba(0,212,255,0.12);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      pointer-events: none; animation: nui-in .2s ease;
    }
    #nui-tip .t-step {
      font-size: 10px; font-weight: 800; letter-spacing: 1.4px;
      color: #00d4ff; text-transform: uppercase; margin-bottom: 7px;
    }
    #nui-tip .t-msg {
      font-size: 14px; color: #dff0ff; line-height: 1.55;
    }
    #nui-tip .t-skip {
      margin-top: 9px; padding-top: 8px;
      border-top: 1px solid rgba(0,212,255,0.15);
      font-size: 11px; color: rgba(255,255,255,0.3); text-align: right;
    }

    /* ── 카운트다운 바 ── */
    #nui-bar {
      position:fixed; bottom:0; left:0; height:3px; z-index:1000001;
      background: linear-gradient(90deg, #00d4ff, #0077aa);
      box-shadow: 0 0 8px rgba(0,212,255,0.7);
      pointer-events:none;
    }

    /* ── 진행 로드맵 (우측) ── */
    #nui-roadmap {
      position:fixed; top:50%; right:20px; transform:translateY(-50%);
      z-index:1000000;
      background: linear-gradient(180deg, rgba(5,5,16,0.96), rgba(7,20,44,0.96));
      border: 1px solid rgba(0,212,255,0.25); border-radius:16px;
      padding: 16px 18px; min-width: 170px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      animation: nui-in .3s ease;
    }
    #nui-roadmap .rm-title {
      font-size:10px; font-weight:800; letter-spacing:1.5px;
      color:#00d4ff; text-transform:uppercase; margin-bottom:13px;
    }
    #nui-roadmap .rm-step {
      display:flex; align-items:center; gap:9px;
      padding:5px 0; font-size:13px; color:rgba(255,255,255,0.28);
    }
    #nui-roadmap .rm-step.done  { color:rgba(255,255,255,0.55); }
    #nui-roadmap .rm-step.done span {
      text-decoration: line-through;
      text-decoration-color: rgba(0,212,255,0.7);
      text-decoration-thickness: 1.5px;
    }
    #nui-roadmap .rm-step.done  .dot {
      background:#00d4ff;
      width: 9px; height: 9px;
      margin-left: 3px; /* 작아진 크기 보정 */
    }
    #nui-roadmap .rm-step.curr  { color:#fff; font-weight:600; }
    #nui-roadmap .rm-step.curr  .dot {
      background:#00d4ff;
      box-shadow: 0 0 8px rgba(0,212,255,0.9);
      animation: nui-dot 1.4s infinite;
    }
    #nui-roadmap .rm-step.curr.arrived {
      color:#fff !important; font-weight:700;
    }
    #nui-roadmap .rm-step.curr.arrived .dot {
      background:#00d97a !important;
      color:#fff !important; font-weight:900;
      box-shadow: 0 0 14px rgba(0,217,122,0.85) !important;
      animation: none !important;
      font-size: 9px;
    }
    #nui-roadmap .rm-step.curr.arrived .dot::before { content: "✓"; }
    #nui-roadmap .dot {
      width:14px; height:14px; border-radius:50%;
      background:rgba(255,255,255,0.15); flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      line-height:1;
    }

    /* ── 플로팅 위젯 ── */
    #nui-widget {
      position: fixed;
      bottom: 28px; left: 50%; transform: translateX(-50%);
      z-index: 1000002;
      background: linear-gradient(135deg, rgba(5,5,16,0.97), rgba(7,20,44,0.97));
      border: 1px solid rgba(0,212,255,0.35);
      border-radius: 40px;
      padding: 10px 16px;
      display: flex; align-items: center; gap: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 0 24px rgba(0,212,255,0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-width: 500px;
      cursor: grab; user-select: none;
      animation: nui-rise .35s cubic-bezier(.22,1,.36,1);
    }
    #nui-widget:active { cursor: grabbing; }
    #nui-widget .wi   { font-size:15px; color:#00d4ff; flex-shrink:0; }
    /* 호스트 페이지의 전역 input 스타일이 새어들지 않도록 !important로 격리 */
    #nui-widget input#nui-input {
      flex:1 1 auto !important;
      box-sizing:border-box !important;
      width:auto !important; min-width:0 !important; height:auto !important;
      background:transparent !important; border:none !important; outline:none !important;
      box-shadow:none !important; border-radius:0 !important;
      margin:0 !important; padding:0 !important;
      color:#e8f4ff !important; font-size:14px !important; line-height:1.4 !important;
      font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      caret-color:#00d4ff !important; text-align:left !important;
    }
    #nui-widget input#nui-input::placeholder { color:rgba(255,255,255,0.25) !important; }
    #nui-widget .wb {
      background: linear-gradient(135deg, #006e8c, #00d4ff);
      border:none; border-radius:22px; padding:7px 16px;
      color:#00060e; font-weight:800; font-size:13px;
      cursor:pointer; flex-shrink:0; transition:opacity .15s;
    }
    #nui-widget .wb:hover  { opacity:.8; }
    #nui-widget .wb:disabled { opacity:.4; cursor:default; }
    #nui-widget .wc {
      background:none; border:none; color:rgba(255,255,255,0.25);
      font-size:20px; cursor:pointer; padding:0 2px; flex-shrink:0;
      line-height:1; transition:color .2s;
    }
    #nui-widget .wc:hover { color:rgba(255,255,255,0.7); }

    /* ── 음성 입력 버튼 ── */
    #nui-widget .wm {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(0,212,255,0.3);
      border-radius: 50%;
      width: 34px; height: 34px;
      cursor: pointer;
      font-size: 16px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: background .15s, transform .15s;
      color: #e8f4ff;
    }
    #nui-widget .wm:hover { background: rgba(0,212,255,0.18); }
    #nui-widget .wm.listening {
      background: rgba(255,80,80,0.28);
      border-color: rgba(255,80,80,0.7);
      animation: nui-pulse 1.2s ease-in-out infinite;
    }
    @keyframes nui-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(255,80,80,0.55); }
      50%     { box-shadow: 0 0 0 8px rgba(255,80,80,0); }
    }

    /* 완료 토스트 (레거시 — 작은 알림용) */
    #nui-toast {
      position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
      z-index:1000003;
      background: linear-gradient(135deg, rgba(0,100,70,0.97), rgba(0,160,100,0.97));
      border:1px solid rgba(0,255,160,0.4); border-radius:30px;
      padding:10px 22px; color:#e0fff4; font-size:14px; font-weight:600;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      box-shadow:0 8px 24px rgba(0,0,0,0.4);
      animation:nui-in .25s ease;
    }

    /* 도착 배너 (어르신 가독성 — 화면 중앙 가로 알약) */
    #nui-arrival {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000005;
      background: linear-gradient(135deg, #008a4a, #00b96a);
      border-radius: 100px;
      padding: 22px 70px;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      text-align: center; white-space: nowrap;
      box-shadow:
        0 0 60px 18px rgba(0,255,160,0.45),
        0 12px 36px rgba(0,0,0,0.45);
      display: inline-flex; align-items: center; gap: 12px;
      font-size: 28px; font-weight: 800; letter-spacing: 0.5px;
      animation: nui-arrive .4s cubic-bezier(.22,1,.36,1);
    }
    #nui-arrival .ar-check {
      font-size: 28px; line-height: 1; font-weight: 800;
    }
    @keyframes nui-arrive {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }

    /* 로드맵 도착 강조 — 마지막 단계가 highlighted일 때 */
    #nui-roadmap .rm-step.arrived {
      color: #c4ffe2 !important; font-weight: 700;
    }
    #nui-roadmap .rm-step.arrived .dot {
      background: #00ffa8 !important;
      box-shadow: 0 0 14px rgba(0,255,168,0.95) !important;
      animation: nui-dot 1.2s infinite;
    }

    @keyframes nui-in   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes nui-rise { from{opacity:0;transform:translateX(-50%) translateY(20px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
    @keyframes nui-dot  { 0%,100%{box-shadow:0 0 4px rgba(0,212,255,0.5)} 50%{box-shadow:0 0 12px rgba(0,212,255,1)} }
  `;
  document.head.appendChild(s);
}


// ══════════════════════════════════════════════════════════════
// 3. 클릭 시퀀스 실행
// ══════════════════════════════════════════════════════════════
async function runStep(idx) {
  if (!guide.active) return;
  // 이 페이지의 계획을 모두 소진 → 목표 기준으로 재계획
  if (idx >= guide.sequence.length) { replanSamePage(); return; }
  const step = guide.sequence[idx];
  guide.stepIdx = idx;

  // UI가 1클릭 후 동적으로 변하는 경우 대비: 타겟이 나타날 때까지 폴링
  const target = await waitForTarget(step.selector, step.text, 5000);
  if (!guide.active) return;
  if (!target) {
    console.warn('[NUI] 타겟 못 찾음 (5s 대기 후):', step.text);
    // 못 찾은 타겟을 기록해 다음 재계획 때 AI에게 피드백 → "그건 없으니 다른 걸 골라라"
    chrome.storage.local.get(GOAL_KEY, (d) => {
      const g = d?.[GOAL_KEY];
      if (g) chrome.storage.local.set({ [GOAL_KEY]: { ...g, lastMiss: step.text || step.value || step.selector || '' } });
      replanSamePage();
    });
    return;
  }

  // ── 입력/선택(type/select) 액션: 사용자가 직접 입력·선택하도록 유도 (자동 입력 X) ──
  // 대상 필드를 스포트라이트하고 "○○○를 입력/선택하세요" 안내 → 사용자가 값을 채우면
  // (input/change 감지) 다음 단계로 넘어간다. 텍스트칸·숫자칸·드롭다운(select) 모두 지원.
  if (step.action === 'type' || step.action === 'fill' || step.action === 'select') {
    const term = step.value || '';
    const isSelect = target.tagName === 'SELECT';
    // 근처에 "조회/검색/찾기/선택" 버튼이 있으면 = 직접 입력이 아니라 팝업으로 선택하는 필드
    const lookupBtn = findNearbyLookupButton(target);
    const lookupName = lookupBtn ? (lookupBtn.textContent || lookupBtn.value || '조회').trim() : '';
    // "조회/찾기/선택" 버튼 = 눌러서 목록에서 고르는 필드(관계 등). "검색"은 보통 타이핑 후 검색.
    const isLookupStyle = !!lookupName && /조회|찾기|선택/.test(lookupName);

    // ★ 직접 입력 불가(readonly) 이거나, 옆 버튼이 "조회/찾기/선택"형이면:
    //   입력시키지 말고 "그 버튼을 누르도록" 안내한다 (눌러서 팝업/목록에서 선택 → 자동 재계획).
    //   (관계 칸처럼 글자가 쳐지는 것처럼 보여도 실제로는 조회로 골라야 하는 경우 포함)
    if (!isSelect && lookupBtn && (target.readOnly || target.disabled || isLookupStyle)) {
      const msg = step.message ||
        `${term ? `'${term}' 선택을 위해 ` : ''}'${lookupName}' 버튼을 누르세요`;
      highlightTarget(lookupBtn, msg, idx + 1, guide.sequence.length);
      const onLookupClick = (ev) => {
        if (!guide.active) return;
        const path = ev.composedPath ? ev.composedPath() : [];
        const inside = path.includes(lookupBtn) || lookupBtn.contains(ev.target);
        if (inside) {
          document.removeEventListener('click', onLookupClick, true);
          guide.clickHandler = null; guide.clickTarget = null;
          clearHighlight();
          advanceAfterAction(idx);   // 팝업 열림/화면 변화 → DOM 다시 읽어 선택 안내
        } else {
          const interactive = ev.target && ev.target.closest &&
            ev.target.closest('a,button,input,select,textarea,summary,label,[role="button"],[onclick]');
          if (!interactive) { stopGoal(); showNotice('안내를 중단했어요.'); }
        }
      };
      guide.clickTarget = lookupBtn;
      guide.clickHandler = onLookupClick;
      document.addEventListener('click', onLookupClick, true);
      return;
    }
    const defMsg = isSelect
      ? (term ? `'${term}' 을(를) 선택하세요` : '항목을 선택하세요')
      : (lookupName
          ? (term ? `'${term}' 입력 후 옆의 '${lookupName}' 버튼으로 선택하세요` : `옆의 '${lookupName}' 버튼으로 선택하세요`)
          : (term ? `'${term}' 라고 입력하세요` : '내용을 입력하세요'));
    highlightTarget(target, step.message || defMsg, idx + 1, guide.sequence.length);
    try { target.focus(); } catch {}

    // 공백·쉼표 등 기호 무시 비교 ("100,000,000" ≈ "100000000", "휴대용 선풍기" ≈ "휴대용선풍기")
    const squash = (x) => nrm(x).replace(/[^0-9a-z가-힣]/g, '');
    const expect = squash(term);
    const currentVal = () => {
      if (isSelect) {
        const opt = target.options && target.options[target.selectedIndex];
        return squash(opt ? (opt.textContent || opt.value) : '');
      }
      return squash(typeof target.value === 'string' ? target.value : '');
    };

    const goNext = () => {
      if (guide.cleanup) { guide.cleanup(); guide.cleanup = null; }
      clearHighlight();
      const nextIdx = idx + 1;
      if (nextIdx < guide.sequence.length) { resetActionGuard(); runStep(nextIdx); }
      else { replanSamePage(); }
    };

    // 타이핑 중(input): 기대값이 다 들어왔을 때만 진행
    const checkTyping = () => {
      if (!guide.active) return;
      const cur = currentVal();
      if (expect ? cur.includes(expect) : cur.length > 0) goNext();
    };
    // 값 확정(change): 드롭다운 선택, "조회" 팝업으로 채움, blur 등으로 값이 확정된 경우.
    // 이때는 기대 텍스트와 정확히 안 맞아도(예: "손주"로 안내했는데 조회로 "외손주(직계비속)"가
    // 채워짐) "비어있지 않으면" 다음으로 진행한다 → 조회형 필드에서 안 넘어가던 문제 해결.
    const checkCommitted = () => {
      if (!guide.active) return;
      if (currentVal().length > 0) goNext();
    };
    const onKey = (e) => {
      if (e.key !== 'Enter') return;  // 엔터로 바로 진행 (검색 제출 등)
      if (guide.cleanup) { guide.cleanup(); guide.cleanup = null; }
      clearHighlight();
      advanceAfterAction(idx);
    };

    // 안전장치(settle 폴링): 조회 팝업이 이벤트 없이 값을 꽂거나, change가 안 뜨는
    // 필드라도, "값이 (처음과 달라져) 채워지고 잠시 멈추면" 다음으로 진행 → 영영 멈춤 방지.
    const initialVal = currentVal();
    let lastTs = Date.now();
    const mark = () => { lastTs = Date.now(); };
    const onInput  = () => { mark(); checkTyping(); };
    const onChange = () => { mark(); checkCommitted(); };
    const poll = setInterval(() => {
      if (!guide.active) return;
      const cur = currentVal();
      if (cur.length > 0 && cur !== initialVal && (Date.now() - lastTs) > 2000) goNext();
    }, 600);

    target.addEventListener('input',  onInput);
    target.addEventListener('change', onChange);
    if (!isSelect) target.addEventListener('keydown', onKey);
    guide.cleanup = () => {
      clearInterval(poll);
      target.removeEventListener('input',  onInput);
      target.removeEventListener('change', onChange);
      target.removeEventListener('keydown', onKey);
    };
    return;
  }

  // ── 기본(click) 액션: 사용자가 직접 클릭하도록 강조 ──
  highlightTarget(target, step.message, idx + 1, guide.sequence.length);
  showCountdown(HIGHLIGHT_MS);

  // 사용자 실제 클릭 대기 — document capture로 타겟 포함 여부 판정
  const onDocClick = (ev) => {
    if (!guide.active) return;
    const path = ev.composedPath ? ev.composedPath() : [];
    const insideTarget = path.includes(target) || target.contains(ev.target);
    if (insideTarget) {
      document.removeEventListener('click', onDocClick, true);
      guide.clickHandler = null;
      guide.clickTarget = null;
      console.log('[NUI] 사용자 클릭:', step.text);
      clearHighlight();
      advanceAfterAction(idx);
    } else {
      // 타겟이 아닌 곳 클릭. 두 경우를 구분한다:
      //  (a) "빈 배경"(버튼·링크·입력 등 상호작용 요소가 아님) 클릭 → 사용자가 중단을 원함 → 취소
      //  (b) 다른 "버튼/링크" 클릭 → AI가 잡은 타겟과 실제 요소가 다를 수 있고, 그 클릭이
      //      페이지를 전환시키면 목표가 그대로 이어받아야 함 → 취소하지 않고 유지
      const interactive = ev.target && ev.target.closest &&
        ev.target.closest('a,button,input,select,textarea,summary,label,[role="button"],[role="menuitem"],[role="tab"],[role="option"],[role="link"],[onclick]');
      if (interactive) {
        console.log('[NUI] 타겟 외 버튼/링크 클릭 — 목표 유지');
      } else {
        console.log('[NUI] 배경 클릭 — 안내 중단');
        stopGoal();          // 목표 취소 + 시각요소 정리
        showNotice('안내를 중단했어요.');
      }
    }
  };
  guide.clickTarget = target;
  guide.clickHandler = onDocClick;
  document.addEventListener('click', onDocClick, true);
}

// 한 단계(클릭 또는 입력) 완료 후 진행 처리.
// 페이지가 전환되면 새 페이지의 resume IIFE가 목표(GOAL_KEY)를 읽어 자동 재계획한다.
// 전환이 없으면 같은 페이지에서 다음 단계로 가거나, 계획이 끝났으면 재계획한다.
function advanceAfterAction(idx) {
  const nextIdx = idx + 1;
  const moreSteps = nextIdx < guide.sequence.length;
  let navigating = false;
  // 같은 탭 전환 감지: beforeunload + pagehide(더 신뢰도 높음)
  const onLeave = () => { navigating = true; };
  window.addEventListener('beforeunload', onLeave, { once: true });
  window.addEventListener('pagehide',     onLeave, { once: true });
  setTimeout(() => {
    window.removeEventListener('beforeunload', onLeave);
    window.removeEventListener('pagehide',     onLeave);
    if (navigating) return;          // 같은 탭에서 페이지 전환 → 새 페이지 resume이 이어받음
    // 새 탭이 열려 사용자가 그쪽으로 이동한 경우: 이 탭은 백그라운드(hidden)가 됨.
    // 이때 이 탭에서 재계획하면 새 탭과 충돌("삑")하므로 진행하지 않는다.
    // 새 탭은 공유 storage의 목표/위젯을 읽어 스스로 이어받는다.
    if (document.hidden || document.visibilityState === 'hidden') {
      // 새 탭/팝업창으로 이동함 → 이 탭은 멈추고, 돌아오면(아래 visibilitychange) 다시 계획.
      awaitingReturn = true;
      return;
    }
    if (!guide.active) return;
    if (moreSteps) {
      resetActionGuard();               // 같은 페이지에서 진전 → 카운터 리셋
      runStep(nextIdx);
    } else {
      replanSamePage();             // 같은 페이지 계획 소진 → 목표 기준 재계획
    }
  }, 800);
}

// 팝업창/새 탭에서 돌아왔을 때(이 탭이 다시 보이게 됨) 목표 기준으로 다시 계획.
// (조회 팝업이 별도 창으로 열렸다가 선택 후 닫혀 부모 화면으로 돌아오는 경우 대응)
let awaitingReturn = false;
let visResumeBound = false;
function setupVisibilityResume() {
  if (visResumeBound) return;
  visResumeBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !awaitingReturn) return;
    awaitingReturn = false;
    chrome.storage.local.get(GOAL_KEY, (d) => {
      const g = d?.[GOAL_KEY];
      if (g && g.goal) setTimeout(() => { if (!document.hidden) planAndRun(g.goal); }, 500);
    });
  });
}

async function waitForTarget(selector, textHint, maxMs) {
  const start = Date.now();
  const interval = 150;
  let t = findTarget(selector, textHint);
  if (t) return t;
  while (Date.now() - start < maxMs) {
    if (!guide.active) return null;
    await sleep(interval);
    t = findTarget(selector, textHint);
    if (t) return t;
  }
  return null;
}

function findTarget(selector, textHint) {
  if (selector) {
    try {
      const el = document.querySelector(selector);
      if (el) return el;
    } catch {} // selector가 깨진 경우 무시하고 텍스트 매칭으로 fallback
  }
  if (!textHint) return null;
  const hint = nrm(textHint);
  if (!hint) return null;

  const SEL = 'a,button,summary,[role="button"],[role="menuitem"],[role="tab"],[role="option"],[role="link"],[onclick],input[type="button"],input[type="submit"],input[type="reset"],input[type="text"],input[type="search"],input[type="number"],input[type="tel"],input:not([type]),textarea,select';
  const all = Array.from(document.querySelectorAll(SEL));
  const visible = all.filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const candidates = visible.length ? visible : all;

  // 1. 정확히 일치
  for (const e of candidates) {
    if (getElTextNorm(e) === hint) return e;
  }
  // 2. 요소 텍스트가 hint를 포함
  for (const e of candidates) {
    const t = getElTextNorm(e);
    if (t && hint.length >= 2 && t.includes(hint)) return e;
  }
  // 3. hint가 요소 텍스트를 포함 (요소 텍스트가 너무 짧으면 제외)
  for (const e of candidates) {
    const t = getElTextNorm(e);
    if (t && t.length >= 2 && hint.includes(t)) return e;
  }
  // 4. 단어 단위 매칭: hint의 모든 단어가 요소 텍스트에 들어있으면 매칭
  //    (예: hint "증여세 자동계산" ↔ 요소 "증여세 신고 > … > (모의계산) 증여세 자동계산")
  const hintWords = hint.split(' ').filter(w => w.length >= 2);
  if (hintWords.length) {
    for (const e of candidates) {
      const t = getElTextNorm(e);
      if (t && hintWords.every(w => t.includes(w))) return e;
    }
  }
  return null;
}

function nrm(s) {
  // 문자열이 아닌 값(숫자, 엘리먼트 등)이 들어와도 안전하게 처리
  const str = typeof s === 'string' ? s : '';
  return str.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getElTextNorm(el) {
  const val = typeof el.value === 'string' ? el.value : '';
  return nrm(el.textContent) ||
         nrm(el.getAttribute && el.getAttribute('aria-label')) ||
         nrm(el.getAttribute && el.getAttribute('title')) ||
         nrm(el.getAttribute && el.getAttribute('placeholder')) ||
         nrm(val) ||
         nrm(el.getAttribute && el.getAttribute('name'));
}

function waitForDomChange() {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; ob.disconnect(); resolve(); } };
    const ob = new MutationObserver(finish);
    ob.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class','style','aria-expanded','aria-hidden']
    });
    setTimeout(finish, 2500);
  });
}

function finishGoal() {
  guide.active = false;
  resetActionGuard();
  clearHighlight();
  // 목표 달성 → 더 이상 새 페이지에서 자동 재계획하지 않도록 목표 제거
  chrome.storage.local.remove(GOAL_KEY);

  // 위젯 유지: 목적지 도착 후에도 다음 질문 가능하도록
  ensureWidget();

  // 가운데 큰 도착 배너 (어르신 가독성)
  showArrivalBanner();
}

function showArrivalBanner() {
  document.getElementById('nui-toast')?.remove();
  document.getElementById('nui-arrival')?.remove();
  const banner = document.createElement('div');
  banner.id = 'nui-arrival';
  banner.innerHTML = `<span class="ar-check">✓</span><span>도착했습니다!</span>`;
  document.body.appendChild(banner);
  setTimeout(() => {
    banner.remove();
    document.getElementById('nui-roadmap')?.remove();
    chrome.storage.local.remove(GOAL_KEY);
  }, 5000);
}


// ══════════════════════════════════════════════════════════════
// 4. 강조 UI
// ══════════════════════════════════════════════════════════════
function highlightTarget(el, message, num, total) {
  injectStyles();
  clearHighlight();
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 오버레이 (시각적 강조용 — 클릭 처리는 document 레벨)
  const ov = document.createElement('div');
  ov.id = 'nui-overlay';
  document.body.appendChild(ov);

  setTimeout(() => {
    if (!document.body.contains(el)) return;
    el.classList.add('nui-target');

    const rect = el.getBoundingClientRect();

    // 화살표 (타겟 오른쪽에 살짝 겹치게 배치)
    const arrow = document.createElement('div');
    arrow.id = 'nui-arrow';
    arrow.textContent = '👈';
    arrow.style.top  = `${rect.top + rect.height / 2 - 18}px`;
    arrow.style.left = `${rect.right - 8}px`;
    document.body.appendChild(arrow);

    // 툴팁
    const tip = document.createElement('div');
    tip.id = 'nui-tip';
    tip.innerHTML = `
      <div class="t-step">STEP ${num} / ${total}</div>
      <div class="t-msg">${message}</div>
      <div class="t-skip">배경 클릭 시 중단</div>
    `;
    document.body.appendChild(tip);
    requestAnimationFrame(() => {
      // 말풍선이 "타겟 버튼을 가리지 않도록" 빈 공간(위→아래→오른쪽→왼쪽)에 배치
      const tipH = tip.offsetHeight, tipW = tip.offsetWidth;
      const gap = 14;
      const vw = window.innerWidth, vh = window.innerHeight;
      const clampX = (x) => Math.max(8, Math.min(x, vw - tipW - 8));
      const clampY = (y) => Math.max(8, Math.min(y, vh - tipH - 8));
      let top, left;
      if (rect.top - tipH - gap >= 8) {                       // 위에 공간
        top = rect.top - tipH - gap;        left = clampX(rect.left);
      } else if (rect.bottom + gap + tipH <= vh - 8) {        // 아래에 공간
        top = rect.bottom + gap;            left = clampX(rect.left);
      } else if (rect.right + gap + tipW <= vw - 8) {         // 오른쪽에 공간
        left = rect.right + gap;            top  = clampY(rect.top);
      } else if (rect.left - gap - tipW >= 8) {               // 왼쪽에 공간
        left = rect.left - gap - tipW;      top  = clampY(rect.top);
      } else {                                                // 공간 없음: 상단 모서리
        top = 8;                            left = clampX(rect.left);
      }
      tip.style.top  = `${top}px`;
      tip.style.left = `${left}px`;
    });
  }, 150);
}

function clearHighlight() {
  document.querySelectorAll('.nui-target').forEach(el => el.classList.remove('nui-target'));
  ['nui-overlay','nui-tip','nui-arrow','nui-bar','nui-roadmap'].forEach(id => document.getElementById(id)?.remove());
  clearTimeout(guide.timer);
}

function showCountdown(ms) {
  document.getElementById('nui-bar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'nui-bar'; bar.style.width = '100%';
  document.body.appendChild(bar);
  requestAnimationFrame(() => {
    bar.style.transition = `width ${ms}ms linear`;
    bar.style.width = '0%';
  });
}


// ══════════════════════════════════════════════════════════════
// 5. 로드맵
// ══════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════
// 6. 시작 / 중단
// ══════════════════════════════════════════════════════════════
// 사용자가 프롬프트를 입력 → 최종 목표로 저장하고 현재 페이지부터 계획 시작.
// 목표는 storage에 남아 페이지가 전환돼도 새 페이지에서 자동으로 이어진다.
async function startGuide(prompt) {
  stopGuide();
  resetActionGuard();
  chrome.storage.local.set({ [GOAL_KEY]: { goal: prompt, ts: Date.now() } });
  chrome.storage.local.remove(WIDGET_DRAFT_KEY);
  planAndRun(prompt);
}

// 현재 페이지를 크롤링해 "목표 기준 다음 클릭"을 Gemini에 요청하고 실행한다.
// 한 단계를 사람이 읽을 수 있는 짧은 설명으로 (AI 메모리용)
function describeStep(s) {
  if (!s) return '';
  if (s.action === 'type' || s.action === 'fill') return `'${s.value || ''}' 입력 (${s.text || s.message || ''})`;
  if (s.action === 'select') return `'${s.value || ''}' 선택`;
  return `'${s.text || s.message || ''}' 클릭`;
}

function planAndRun(goal) {
  if (!goal) return;
  // 이전 단계에서 붙은 리스너 정리 (목표/위젯은 유지) — 재계획 시 리스너 누수 방지
  if (guide.clickHandler) {
    document.removeEventListener('click', guide.clickHandler, true);
    guide.clickHandler = null; guide.clickTarget = null;
  }
  if (guide.cleanup) { try { guide.cleanup(); } catch {} guide.cleanup = null; }
  const myToken = ++planToken;   // 이 계획 요청의 토큰 (중단/새 계획 시 무효화됨)
  setWidgetState('loading');

  chrome.storage.local.get(GOAL_KEY, (d) => {
    if (myToken !== planToken) return;   // 이미 중단/교체됨 → 무시
    const g = d?.[GOAL_KEY] || {};
    let history = Array.isArray(g.history) ? g.history : [];
    // 이전 페이지에서 실행한 계획을 history(메모리)로 합친다.
    // ※ 이 기록은 "계획 시점"(페이지가 막 로드된 직후)에 저장하므로
    //    클릭→네비게이션 경합 없이 안전하게 남는다.
    if (Array.isArray(g.currentPlanDesc) && g.currentPlanDesc.length) {
      history = history.concat(g.currentPlanDesc).slice(-20);
    }
    // 직전에 못 찾은 타겟(있으면) → AI에게 피드백해 다른 요소를 고르게 한다.
    const lastMiss = g.lastMiss || '';

    const elements = getAllElements();
    chrome.runtime.sendMessage(
      { action: 'ANALYZE_WITH_GEMINI', prompt: goal, history, lastMiss, domStructure: elements },
      res => {
        if (myToken !== planToken) return;   // 중단/교체된 요청 → 화면 그리지 않음
        setWidgetState('idle');
        if (!res || res.error) {
          showError(res?.error || '분석 실패');
          ensureWidget();
          return;
        }
        const seq = Array.isArray(res.clickSequence) ? res.clickSequence : [];

        // status가 'unclear' → 추측하지 말고 중단하고 추가 정보를 요청한다.
        if (res.status === 'unclear') {
          console.log('[NUI] 불명확 → 중단하고 추가 정보 요청');
          stopGoal();
          showNotice(res.message || '어디로 안내할지 명확하지 않아요.\n조금만 더 자세히 말씀해 주세요.', 4000);
          ensureWidget();
          return;
        }

        // status가 'done'이거나 할 게 없으면 목표 달성으로 간주
        if (res.status === 'done' || seq.length === 0) {
          chrome.storage.local.set({ [GOAL_KEY]: { goal, ts: Date.now(), history } });
          finishGoal();
          return;
        }

        // ★ observe→act: AI가 여러 개를 줘도 "딱 다음 한 동작"만 실행한다.
        //   그 동작이 끝나면(전환 또는 같은 페이지) DOM을 다시 읽어 새로 계획한다.
        const next = seq[0];

        // 무한루프/과잉행동 방지:
        //  - 같은 동작이 반복되거나(진전 없음),
        //  - 이미 history에 있는(=이미 한) 동작을 또 제안하면 "중복"으로 카운트.
        const key  = actionKey(next);
        const desc = describeStep(next);
        const isRedundant = history.includes(desc);
        if (key === lastActionKey || isRedundant) sameActionCount++;
        else { sameActionCount = 0; lastActionKey = key; }
        if (sameActionCount > 2) {
          // 이미 목적지에 도착해 더 할 게 없는데 AI가 계속 추가 동작을 내는 상황 → 종료
          console.log('[NUI] 중복/과잉 동작 감지 → 종료');
          finishGoal();
          return;
        }

        // 방금 실행할 한 동작을 메모리에 기록 (다음 재계획 때 history로 누적 → 반복 방지)
        chrome.storage.local.set({
          [GOAL_KEY]: { goal, ts: Date.now(), history, currentPlanDesc: [describeStep(next)] }
        });

        guide = { active: true, sequence: [next], stepIdx: 0, timer: null, clickTarget: null, clickHandler: null };
        runStep(0);
      }
    );
  });
}

// 한 동작이 끝났는데 페이지 전환이 없을 때: 현재 DOM을 다시 읽어 "다음 한 동작"을 계획.
// (무한루프 방지는 planAndRun 안의 "같은 동작 반복" 가드가 담당)
function replanSamePage() {
  chrome.storage.local.get(GOAL_KEY, (d) => {
    const g = d?.[GOAL_KEY]?.goal;
    if (g) planAndRun(g);
    else ensureWidget();
  });
}

// 진행 중인 안내(시각 요소)만 정리. 위젯과 목표(GOAL_KEY)는 건드리지 않는다.
function stopGuide() {
  guide.active = false;
  planToken++;   // 진행 중이던 AI 응답 콜백 무효화 (닫은 뒤 말풍선 갑툭튀 방지)
  if (guide.clickHandler) {
    document.removeEventListener('click', guide.clickHandler, true);
    guide.clickHandler = null;
    guide.clickTarget = null;
  }
  // 입력(type) 단계에서 붙인 input/keydown 리스너 정리
  if (guide.cleanup) { try { guide.cleanup(); } catch {} guide.cleanup = null; }
  clearHighlight();
  clearTimeout(guide.timer);
  document.getElementById('nui-roadmap')?.remove();
  document.getElementById('nui-bar')?.remove();
  document.getElementById('nui-arrival')?.remove();
}

// 목표 자체를 취소 (사용자가 위젯을 닫거나 안내 밖을 클릭). 위젯은 호출부에서 관리.
function stopGoal() {
  resetActionGuard();
  chrome.storage.local.remove(GOAL_KEY);
  stopGuide();
}

function showError(msg) {
  const tip = document.getElementById('nui-tip') || (() => {
    const d = document.createElement('div'); d.id = 'nui-tip'; document.body.appendChild(d); return d;
  })();
  injectStyles();
  tip.innerHTML = `<div class="t-step" style="color:#ff6b6b">오류</div><div class="t-msg">${msg}</div>`;
  tip.style.top  = '50%'; tip.style.left = '50%';
  tip.style.transform = 'translate(-50%,-50%)';
  setTimeout(() => tip.remove(), 3000);
}

// 중립 안내 토스트 (중단/추가 정보 요청 등). 화면 중앙에 잠깐 표시.
function showNotice(msg, ms) {
  injectStyles();
  document.getElementById('nui-tip')?.remove();
  const d = document.createElement('div');
  d.id = 'nui-tip';
  d.innerHTML = `<div class="t-msg">${msg}</div>`;
  d.style.top = '50%'; d.style.left = '50%';
  d.style.transform = 'translate(-50%,-50%)';
  d.style.textAlign = 'center';
  d.style.whiteSpace = 'pre-line';   // \n 줄바꿈 표시
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms || 2600);
}


// ══════════════════════════════════════════════════════════════
// 7. 플로팅 위젯
// ══════════════════════════════════════════════════════════════
// 위젯 DOM 생성 (토글 없음). 저장된 위치/입력 초안을 복원한다.
function buildWidget() {
  setupVisibilityResume();   // 팝업창 복귀 시 자동 재계획 리스너 등록(1회)
  const w = document.createElement('div'); w.id = 'nui-widget';
  w.innerHTML = `
    <span class="wi">✦</span>
    <input type="text" id="nui-input" placeholder="어디로 안내해 드릴까요?" autocomplete="off"/>
    <button class="wm" id="nui-mic" title="음성으로 말하기" aria-label="음성으로 말하기">🎤</button>
    <button class="wb" id="nui-send">안내</button>
    <button class="wc" id="nui-close">×</button>
  `;
  document.body.appendChild(w);

  const input = document.getElementById('nui-input');

  // 리로드 후에도 위치/입력 텍스트 유지
  chrome.storage.local.get([WIDGET_POS_KEY, WIDGET_DRAFT_KEY], (d) => {
    const pos = d?.[WIDGET_POS_KEY];
    if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
      w.style.cssText += ';transition:none;transform:none;bottom:auto;';
      w.style.left = pos.left + 'px';
      w.style.top  = pos.top + 'px';
    }
    if (input && d?.[WIDGET_DRAFT_KEY]) input.value = d[WIDGET_DRAFT_KEY];
  });

  document.getElementById('nui-close').addEventListener('click', () => {
    stopGoal();
    w.remove();
    // 사용자가 명시적으로 닫음 → 다음 페이지에서 자동 복원하지 않음
    chrome.storage.local.set({ [WIDGET_OPEN_KEY]: false });
    chrome.storage.local.remove(WIDGET_DRAFT_KEY);
  });

  const doSend = () => {
    const p = input?.value.trim();
    if (p) {
      chrome.storage.local.remove(WIDGET_DRAFT_KEY);
      if (input) input.value = '';   // 전송 후 입력창 자동 초기화
      startGuide(p);
    }
  };
  document.getElementById('nui-send').addEventListener('click', doSend);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSend();
  });
  // 입력 중이던 텍스트 저장 (페이지 전환 시 손실 방지)
  input.addEventListener('input', () => {
    chrome.storage.local.set({ [WIDGET_DRAFT_KEY]: input.value });
  });

  // 음성 입력 (어르신 친화)
  document.getElementById('nui-mic').addEventListener('click', startVoiceInput);

  // 드래그 + 위치 저장
  let drag = false, moved = false, sx, sy, ox, oy;
  w.addEventListener('mousedown', e => {
    if (['INPUT','BUTTON'].includes(e.target.tagName)) return;
    drag = true; moved = false;
    const r = w.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    w.style.cssText += ';transition:none;transform:none;bottom:auto;';
    w.style.left = ox+'px'; w.style.top = oy+'px';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    moved = true;
    w.style.left = (ox + e.clientX - sx)+'px';
    w.style.top  = (oy + e.clientY - sy)+'px';
  });
  document.addEventListener('mouseup', () => {
    if (drag && moved) {
      const r = w.getBoundingClientRect();
      chrome.storage.local.set({
        [WIDGET_POS_KEY]: { left: Math.round(r.left), top: Math.round(r.top) }
      });
    }
    drag = false;
  });

  // 포커스
  setTimeout(() => document.getElementById('nui-input')?.focus(), 100);
  return w;
}

// 아이콘 클릭 → 토글 (열기/닫기). 열림 상태를 storage에 기록.
function injectFloatingWidget() {
  injectStyles();
  if (document.getElementById('nui-widget')) {
    // 이미 있으면 토글 (닫기) → 진행 중 목표도 취소
    stopGoal();
    document.getElementById('nui-widget').remove();
    chrome.storage.local.set({ [WIDGET_OPEN_KEY]: false });
    return;
  }
  // ★ 아이콘으로 "새로 열 때"마다 이전 대화(목표·메모리·입력 초안)를 초기화한다.
  //   (페이지 이동 중 자동 복원은 ensureWidget을 쓰므로 여기서만 초기화 → 같은 작업은 안 끊김)
  stopGoal();                                              // 진행 중 목표/시각요소 정리
  resetActionGuard();
  chrome.storage.local.remove([GOAL_KEY, WIDGET_DRAFT_KEY]); // 이전 목표/메모리/초안 제거 (위치는 유지)
  buildWidget();
  chrome.storage.local.set({ [WIDGET_OPEN_KEY]: true });
}

// 위젯이 없으면 생성 (토글하지 않음). 페이지 전환 복원/도착 후 재노출에 사용.
function ensureWidget() {
  if (document.getElementById('nui-widget')) return;
  injectStyles();
  buildWidget();
  chrome.storage.local.set({ [WIDGET_OPEN_KEY]: true });
}

function setWidgetState(state) {
  const btn = document.getElementById('nui-send');
  if (!btn) return;
  btn.textContent = state === 'loading' ? '...' : '안내';
  btn.disabled = state === 'loading';
}

let voiceRec = null;
function startVoiceInput() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showError('이 브라우저는 음성 인식을 지원하지 않습니다');
    return;
  }
  const mic = document.getElementById('nui-mic');
  const input = document.getElementById('nui-input');

  // 이미 녹음 중이면 중단
  if (voiceRec) {
    try { voiceRec.stop(); } catch {}
    return;
  }

  const rec = new SR();
  rec.lang = 'ko-KR';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  voiceRec = rec;

  mic?.classList.add('listening');
  if (input) {
    input.value = '';
    input.placeholder = '말씀하세요...';
  }

  rec.onresult = (ev) => {
    let interim = '', finalText = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) finalText += t;
      else interim += t;
    }
    if (input) input.value = (finalText || interim).trim();
  };

  rec.onerror = (ev) => {
    console.warn('[NUI] 음성 인식 오류:', ev.error);
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
      showError('마이크 권한이 필요합니다. 주소창의 자물쇠 아이콘에서 허용해주세요.');
    } else if (ev.error === 'no-speech') {
      showError('음성이 들리지 않았어요. 다시 시도해주세요.');
    } else {
      showError(`음성 인식 오류: ${ev.error}`);
    }
  };

  rec.onend = () => {
    voiceRec = null;
    mic?.classList.remove('listening');
    if (input) input.placeholder = '어디로 안내해 드릴까요?';
    const text = input?.value.trim();
    if (text) startGuide(text);
  };

  try {
    rec.start();
  } catch (e) {
    voiceRec = null;
    mic?.classList.remove('listening');
    showError('음성 인식을 시작할 수 없습니다');
  }
}


// ══════════════════════════════════════════════════════════════
// 8. 메시지 리스너
// ══════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // 아이콘 클릭 → 위젯 토글
  if (request.action === 'TOGGLE_WIDGET') {
    injectFloatingWidget();
    sendResponse({ ok: true });
    return;
  }

  if (request.action === 'CRAWL_DOM') {
    sendResponse(getAllElements());
    return;
  }
});


// ══════════════════════════════════════════════════════════════
// 9. 페이지 전환 후 자동 재개
// ══════════════════════════════════════════════════════════════
(async function tryResumeGuide() {
  try {
    const data = await chrome.storage.local.get([GOAL_KEY, WIDGET_OPEN_KEY]);
    const widgetOpen = data?.[WIDGET_OPEN_KEY];
    const goalObj = data?.[GOAL_KEY];

    // 페이지 로드 완료 대기
    if (document.readyState !== 'complete') {
      await new Promise(r => window.addEventListener('load', r, { once: true }));
    }

    // ── 위젯 복원 ──
    // 위젯이 열려 있던 상태라면 리로드/페이지 전환 후에도 다시 띄운다.
    // (사용자가 ×로 닫았으면 widgetOpen=false → 복원하지 않음)
    if (widgetOpen) ensureWidget();

    // 진행 중인 목표가 없으면 위젯만 복원하고 종료
    if (!goalObj || !goalObj.goal) return;
    // 목표 만료 처리 (10분)
    if (Date.now() - (goalObj.ts || 0) > GOAL_TTL) {
      chrome.storage.local.remove(GOAL_KEY);
      return;
    }

    // 새 페이지가 안정화되도록 잠시 대기 후, 목표 기준으로 다시 계획.
    // → 한 번의 프롬프트로 검색 → 결과 → 상품 → 장바구니까지 자동으로 이어진다.
    await sleep(800);
    resetActionGuard();
    console.log('[NUI] 목표 이어서 진행:', goalObj.goal);
    planAndRun(goalObj.goal);
  } catch (e) {
    console.warn('[NUI] resume failed:', e);
  }
})();

} // end __nuiContentLoaded guard
