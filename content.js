// content.js

// ══════════════════════════════════════════════════════════════
// 0. 상태
// ══════════════════════════════════════════════════════════════
let guide = { active: false, sequence: [], stepIdx: 0, timer: null };
const HIGHLIGHT_MS = 1800;


// ══════════════════════════════════════════════════════════════
// 1. DOM 크롤링
// ══════════════════════════════════════════════════════════════
function getAllElements() {
  const sel = [
    'a','button',
    '[role="button"]','[role="menuitem"]','[role="tab"]','[role="option"]',
    'input[type="button"]','input[type="submit"]','input[type="reset"]',
    'summary','nav li a','.gnb a','.lnb a',
    '[class*="menu"] a','[class*="nav"] a','[class*="depth"] a','[class*="sub"] a',
  ].join(',');

  const seen = new Set();
  return Array.from(document.querySelectorAll(sel))
    .map((el, i) => {
      const text = getElText(el);
      if (!text) return null;
      const s = getUniqueSelector(el);
      if (seen.has(s)) return null;
      seen.add(s);
      const rect = el.getBoundingClientRect();
      const cs   = window.getComputedStyle(el);
      return {
        index: i, tag: el.tagName.toLowerCase(), text: text.substring(0, 60),
        id: el.id || '', selector: s, href: el.href || '',
        isVisible: rect.width > 0 && rect.height > 0,
        wasHidden: cs.display === 'none' || cs.visibility === 'hidden',
        location: { x: Math.round(rect.left), y: Math.round(rect.top) },
        size:     { width: Math.round(rect.width), height: Math.round(rect.height) },
      };
    })
    .filter(Boolean).slice(0, 200);
}

function getElText(el) {
  return el.innerText?.trim() || el.textContent?.trim() ||
         el.getAttribute('aria-label')?.trim() || el.getAttribute('title')?.trim() ||
         el.value?.trim() || '';
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
    /* ── 오버레이 ── */
    #nui-overlay {
      position:fixed; inset:0; background:rgba(0,0,0,0.15);
      z-index:999990; pointer-events:all; cursor:pointer;
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

    /* ── 화살표 ── */
    #nui-arrow {
      position:fixed; z-index:1000000; font-size:26px; pointer-events:none;
      filter: drop-shadow(0 0 6px #00d4ff) drop-shadow(0 0 14px rgba(0,212,255,0.6));
      animation: nui-bounce .85s ease-in-out infinite;
    }
    @keyframes nui-bounce {
      0%,100% { transform: translateY(0) rotate(-15deg); }
      50%      { transform: translateY(-10px) rotate(-15deg); }
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
    #nui-roadmap .rm-step.done  .dot { background:#00d4ff; }
    #nui-roadmap .rm-step.curr  { color:#fff; font-weight:600; }
    #nui-roadmap .rm-step.curr  .dot {
      background:#00d4ff;
      box-shadow: 0 0 8px rgba(0,212,255,0.9);
      animation: nui-dot 1.4s infinite;
    }
    #nui-roadmap .dot {
      width:7px; height:7px; border-radius:50%;
      background:rgba(255,255,255,0.15); flex-shrink:0;
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
      min-width: 340px;
      cursor: grab; user-select: none;
      animation: nui-rise .35s cubic-bezier(.22,1,.36,1);
    }
    #nui-widget:active { cursor: grabbing; }
    #nui-widget .wi   { font-size:15px; color:#00d4ff; flex-shrink:0; }
    #nui-widget input {
      flex:1; background:transparent; border:none; outline:none;
      color:#e8f4ff; font-size:14px; caret-color:#00d4ff;
    }
    #nui-widget input::placeholder { color:rgba(255,255,255,0.25); }
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

    /* 완료 토스트 */
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
  if (!guide.active || idx >= guide.sequence.length) {
    finishGuide(); return;
  }
  const step = guide.sequence[idx];
  guide.stepIdx = idx;
  renderRoadmap(idx);

  const target = findTarget(step.selector, step.text);
  if (!target) {
    console.warn('[NUI] 타겟 없음, 스킵:', step.text);
    await sleep(300); runStep(idx + 1); return;
  }

  highlightTarget(target, step.message, idx + 1, guide.sequence.length);
  showCountdown(HIGHLIGHT_MS);

  guide.timer = setTimeout(async () => {
    clearHighlight();
    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true }));
    await sleep(80);
    target.click();
    console.log('[NUI] 클릭:', step.text);
    await waitForDomChange();
    await sleep(350);
    runStep(idx + 1);
  }, HIGHLIGHT_MS);
}

function findTarget(selector, textHint) {
  if (selector) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  if (textHint) {
    const hint = textHint.trim();
    return Array.from(document.querySelectorAll(
      'a,button,[role="menuitem"],[role="button"],[role="tab"]'
    )).find(e => {
      const t = e.textContent.trim();
      return t === hint || t.includes(hint);
    }) || null;
  }
  return null;
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

function finishGuide() {
  guide.active = false;
  clearHighlight();
  document.getElementById('nui-roadmap')?.remove();
  // 완료 토스트
  const toast = document.createElement('div');
  toast.id = 'nui-toast';
  toast.textContent = '✓ 목적지에 도착했습니다!';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}


// ══════════════════════════════════════════════════════════════
// 4. 강조 UI
// ══════════════════════════════════════════════════════════════
function highlightTarget(el, message, num, total) {
  injectStyles();
  clearHighlight();
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 오버레이 (클릭 시 중단)
  const ov = document.createElement('div');
  ov.id = 'nui-overlay';
  ov.title = '클릭하면 안내를 중단합니다';
  ov.addEventListener('click', stopGuide);
  document.body.appendChild(ov);

  setTimeout(() => {
    if (!document.body.contains(el)) return;
    el.classList.add('nui-target');

    const rect = el.getBoundingClientRect();

    // 화살표
    const arrow = document.createElement('div');
    arrow.id = 'nui-arrow';
    arrow.textContent = '👆';
    arrow.style.top  = `${Math.max(4, rect.top - 44)}px`;
    arrow.style.left = `${rect.left + rect.width / 2 - 14}px`;
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
      const top = Math.max(8, rect.top - tip.offsetHeight - 52);
      tip.style.top  = `${top}px`;
      tip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 310))}px`;
    });
  }, 350);
}

function clearHighlight() {
  document.querySelectorAll('.nui-target').forEach(el => el.classList.remove('nui-target'));
  ['nui-overlay','nui-tip','nui-arrow','nui-bar'].forEach(id => document.getElementById(id)?.remove());
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
function renderRoadmap(currIdx) {
  injectStyles();
  document.getElementById('nui-roadmap')?.remove();
  const c = document.createElement('div'); c.id = 'nui-roadmap';
  c.innerHTML = '<div class="rm-title">클릭 순서</div>';
  guide.sequence.forEach((step, i) => {
    const cls = i < currIdx ? 'done' : i === currIdx ? 'curr' : '';
    const d = document.createElement('div');
    d.className = `rm-step ${cls}`;
    d.innerHTML = `<div class="dot"></div><span>${step.text}</span>`;
    c.appendChild(d);
  });
  document.body.appendChild(c);
}


// ══════════════════════════════════════════════════════════════
// 6. 시작 / 중단
// ══════════════════════════════════════════════════════════════
async function startGuide(prompt) {
  stopGuide();
  chrome.storage.local.remove('nextui_last_guide');
  setWidgetState('loading');

  const elements = getAllElements();
  chrome.runtime.sendMessage({ action: 'ANALYZE_WITH_GEMINI', prompt, domStructure: elements }, res => {
    setWidgetState('idle');
    if (!res || res.error) {
      showError(res?.error || '분석 실패');
      return;
    }
    const seq = res.clickSequence;
    if (!seq || seq.length === 0) { showError('관련 버튼을 찾지 못했어요'); return; }
    guide = { active: true, sequence: seq, stepIdx: 0, timer: null };
    runStep(0);
  });
}

function stopGuide() {
  guide.active = false;
  clearHighlight();
  clearTimeout(guide.timer);
  document.getElementById('nui-roadmap')?.remove();
  document.getElementById('nui-bar')?.remove();
  chrome.storage.local.remove('nextui_last_guide');
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


// ══════════════════════════════════════════════════════════════
// 7. 플로팅 위젯
// ══════════════════════════════════════════════════════════════
function injectFloatingWidget() {
  injectStyles();
  if (document.getElementById('nui-widget')) {
    // 이미 있으면 토글 (닫기)
    stopGuide();
    document.getElementById('nui-widget').remove();
    return;
  }

  const w = document.createElement('div'); w.id = 'nui-widget';
  w.innerHTML = `
    <span class="wi">✦</span>
    <input type="text" id="nui-input" placeholder="어디로 안내해 드릴까요?" autocomplete="off"/>
    <button class="wb" id="nui-send">안내</button>
    <button class="wc" id="nui-close">×</button>
  `;
  document.body.appendChild(w);

  document.getElementById('nui-close').addEventListener('click', () => {
    stopGuide(); w.remove();
  });

  const doSend = () => {
    const p = document.getElementById('nui-input')?.value.trim();
    if (p) startGuide(p);
  };
  document.getElementById('nui-send').addEventListener('click', doSend);
  document.getElementById('nui-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSend();
  });

  // 드래그
  let drag = false, sx, sy, ox, oy;
  w.addEventListener('mousedown', e => {
    if (['INPUT','BUTTON'].includes(e.target.tagName)) return;
    drag = true;
    const r = w.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    w.style.cssText += ';transition:none;transform:none;bottom:auto;';
    w.style.left = ox+'px'; w.style.top = oy+'px';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    w.style.left = (ox + e.clientX - sx)+'px';
    w.style.top  = (oy + e.clientY - sy)+'px';
  });
  document.addEventListener('mouseup', () => { drag = false; });

  // 포커스
  setTimeout(() => document.getElementById('nui-input')?.focus(), 100);
}

function setWidgetState(state) {
  const btn = document.getElementById('nui-send');
  if (!btn) return;
  btn.textContent = state === 'loading' ? '...' : '안내';
  btn.disabled = state === 'loading';
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
