// content.js

// ══════════════════════════════════════════════════════════════
// 0. 상태
// ══════════════════════════════════════════════════════════════
let guide = { active: false, sequence: [], stepIdx: 0, timer: null };
let recognition = null; // Web Speech API


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
        index: i, tag: el.tagName.toLowerCase(),
        text: text.substring(0, 60), id: el.id || '',
        selector: s, href: el.href || '',
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
    /* ── 동그란 FAB 버튼 ── */
    #nui-fab {
      position: fixed;
      bottom: 28px; right: 28px;
      width: 56px; height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #004466, #00aacc);
      border: 2px solid rgba(0,212,255,0.6);
      box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 20px rgba(0,212,255,0.3);
      cursor: pointer; z-index: 1000002;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px;
      transition: transform .2s, box-shadow .2s;
      animation: nui-fab-in .35s cubic-bezier(.22,1,.36,1);
      user-select: none;
    }
    #nui-fab:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 28px rgba(0,0,0,0.5), 0 0 32px rgba(0,212,255,0.5);
    }
    #nui-fab.active {
      background: linear-gradient(135deg, #003344, #008899);
      transform: rotate(45deg) scale(1.05);
    }
    @keyframes nui-fab-in {
      from { transform: scale(0); opacity: 0; }
      to   { transform: scale(1); opacity: 1; }
    }

    /* ── 프롬프트 패널 (FAB 위에서 펼쳐짐) ── */
    #nui-panel {
      position: fixed;
      bottom: 96px; right: 28px;
      width: 320px;
      background: linear-gradient(155deg, rgba(4,8,24,0.98), rgba(6,18,44,0.98));
      border: 1px solid rgba(0,212,255,0.38);
      border-radius: 20px;
      padding: 18px 16px 14px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 24px rgba(0,212,255,0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      z-index: 1000001;
      animation: nui-panel-in .28s cubic-bezier(.22,1,.36,1);
      transform-origin: bottom right;
    }
    @keyframes nui-panel-in {
      from { opacity:0; transform: scale(0.85) translateY(12px); }
      to   { opacity:1; transform: scale(1)    translateY(0);    }
    }
    #nui-panel .p-title {
      font-size: 12px; font-weight: 800; letter-spacing: 1.4px;
      color: #00d4ff; text-transform: uppercase; margin-bottom: 12px;
    }
    #nui-panel .p-input-row {
      display: flex; gap: 8px; align-items: center;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(0,212,255,0.25);
      border-radius: 30px; padding: 8px 14px;
      margin-bottom: 12px;
    }
    #nui-panel .p-input-row:focus-within {
      border-color: rgba(0,212,255,0.6);
      box-shadow: 0 0 12px rgba(0,212,255,0.15);
    }
    #nui-input {
      flex:1; background:transparent; border:none; outline:none;
      color:#e8f4ff; font-size:14px; caret-color:#00d4ff;
    }
    #nui-input::placeholder { color:rgba(255,255,255,0.25); }

    /* 음성 버튼 */
    #nui-mic {
      background:none; border:none; cursor:pointer;
      font-size:18px; padding:0; flex-shrink:0;
      color:rgba(255,255,255,0.35);
      transition: color .2s, transform .15s;
      line-height:1;
    }
    #nui-mic:hover { color:rgba(0,212,255,0.8); }
    #nui-mic.listening {
      color:#ff4466;
      animation: nui-mic-pulse 1s ease-in-out infinite;
    }
    @keyframes nui-mic-pulse {
      0%,100% { transform: scale(1);    color:#ff4466; }
      50%      { transform: scale(1.25); color:#ff7799; }
    }

    #nui-send {
      width: 100%;
      background: linear-gradient(135deg, #005577, #00d4ff);
      border:none; border-radius:12px; padding:10px;
      color:#00060e; font-weight:800; font-size:14px;
      cursor:pointer; transition: opacity .15s;
    }
    #nui-send:hover    { opacity:.85; }
    #nui-send:disabled { opacity:.35; cursor:default; }

    /* 상태 텍스트 */
    #nui-status {
      text-align:center; font-size:11px; margin-top:8px;
      color:rgba(0,212,255,0.5); min-height:16px;
    }

    /* ── 오버레이 (어둡지 않게) ── */
    #nui-overlay {
      position:fixed; inset:0; background:rgba(0,0,0,0.15);
      z-index:999990; pointer-events:all; cursor:default;
      animation:nui-in .2s ease;
    }

    /* ── 타겟 글로우 ── */
    .nui-target {
      position:relative !important; z-index:999999 !important;
      border-radius:6px !important; outline:none !important;
      box-shadow:
        0 0 0 3px rgba(255,255,255,0.9),
        0 0 0 5px #00d4ff,
        0 0 20px 8px rgba(0,212,255,0.6),
        0 0 50px 18px rgba(0,212,255,0.22) !important;
      animation: nui-glow 1.6s ease-in-out infinite !important;
    }
    @keyframes nui-glow {
      0%,100% {
        box-shadow:
          0 0 0 3px rgba(255,255,255,0.9), 0 0 0 5px #00d4ff,
          0 0 20px 8px rgba(0,212,255,0.6), 0 0 50px 18px rgba(0,212,255,0.22);
      }
      50% {
        box-shadow:
          0 0 0 3px rgba(255,255,255,0.9), 0 0 0 8px #00d4ff,
          0 0 36px 14px rgba(0,212,255,0.8), 0 0 72px 28px rgba(0,212,255,0.36);
      }
    }

    /* ── 화살표 ── */
    #nui-arrow {
      position:fixed; z-index:1000000; font-size:26px; pointer-events:none;
      filter: drop-shadow(0 0 6px #00d4ff);
      animation: nui-bounce .85s ease-in-out infinite;
    }
    @keyframes nui-bounce {
      0%,100% { transform:translateY(0) rotate(-15deg); }
      50%      { transform:translateY(-10px) rotate(-15deg); }
    }

    /* ── STEP 툴팁 ── */
    #nui-tip {
      position:fixed; z-index:1000000;
      background:linear-gradient(135deg,rgba(4,8,24,0.97),rgba(6,18,44,0.97));
      border:1px solid rgba(0,212,255,0.42); border-radius:14px;
      padding:13px 16px; max-width:280px;
      box-shadow:0 10px 32px rgba(0,0,0,0.5),0 0 18px rgba(0,212,255,0.1);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      pointer-events:none; animation:nui-in .2s ease;
    }
    #nui-tip .t-step { font-size:10px; font-weight:800; letter-spacing:1.3px; color:#00d4ff; text-transform:uppercase; margin-bottom:6px; }
    #nui-tip .t-msg  { font-size:14px; color:#dff0ff; line-height:1.55; }
    #nui-tip .t-hint { margin-top:9px; padding-top:8px; border-top:1px solid rgba(0,212,255,0.15); font-size:11px; color:rgba(255,255,255,0.3); }

    /* ── "클릭하세요" CTA 버튼 ── */
    #nui-cta {
      position:fixed; z-index:1000000;
      background:linear-gradient(135deg,#005577,#00d4ff);
      border:none; border-radius:30px;
      padding:10px 22px;
      color:#00060e; font-weight:800; font-size:13px;
      cursor:pointer;
      box-shadow:0 6px 20px rgba(0,212,255,0.4);
      animation:nui-cta-in .3s cubic-bezier(.22,1,.36,1);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    #nui-cta:hover { filter:brightness(1.1); }
    @keyframes nui-cta-in {
      from { opacity:0; transform:translateY(8px) scale(.95); }
      to   { opacity:1; transform:translateY(0)  scale(1);   }
    }

    /* ── 카운트 진행바 (클릭 대기 중 없음) ── */

    /* ── 로드맵 ── */
    #nui-roadmap {
      position:fixed; top:50%; right:96px; transform:translateY(-50%);
      z-index:1000000;
      background:linear-gradient(180deg,rgba(4,8,24,0.96),rgba(6,18,44,0.96));
      border:1px solid rgba(0,212,255,0.24); border-radius:16px;
      padding:14px 18px; min-width:165px;
      box-shadow:0 8px 28px rgba(0,0,0,0.5);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      animation:nui-in .25s ease;
    }
    #nui-roadmap .rm-title { font-size:10px; font-weight:800; letter-spacing:1.5px; color:#00d4ff; text-transform:uppercase; margin-bottom:12px; }
    #nui-roadmap .rm-step  { display:flex; align-items:center; gap:8px; padding:5px 0; font-size:13px; color:rgba(255,255,255,0.28); }
    #nui-roadmap .rm-step.done { color:rgba(255,255,255,0.55); }
    #nui-roadmap .rm-step.done .dot { background:#00d4ff; }
    #nui-roadmap .rm-step.curr { color:#fff; font-weight:600; }
    #nui-roadmap .rm-step.curr .dot { background:#00d4ff; box-shadow:0 0 8px rgba(0,212,255,0.9); animation:nui-dot 1.4s infinite; }
    #nui-roadmap .dot { width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,0.15); flex-shrink:0; }

    /* 완료 토스트 */
    #nui-toast {
      position:fixed; bottom:100px; right:28px; z-index:1000003;
      background:linear-gradient(135deg,rgba(0,80,50,0.97),rgba(0,160,100,0.97));
      border:1px solid rgba(0,255,160,0.35); border-radius:16px;
      padding:12px 18px; color:#e0fff4; font-size:13px; font-weight:600;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      box-shadow:0 8px 24px rgba(0,0,0,0.4);
      animation:nui-in .25s ease;
    }

    @keyframes nui-in  { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
    @keyframes nui-dot { 0%,100%{box-shadow:0 0 4px rgba(0,212,255,0.5)} 50%{box-shadow:0 0 12px rgba(0,212,255,1)} }
  `;
  document.head.appendChild(s);
}


// ══════════════════════════════════════════════════════════════
// 3. 클릭 시퀀스 — 유저가 직접 클릭할 때까지 대기
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

  // 강조 표시
  highlightTarget(target, step.message, idx + 1, guide.sequence.length);

  // ── 유저 클릭을 기다림 ──────────────────────────────────
  waitForUserClick(target, () => {
    // 유저가 타겟을 직접 클릭했을 때
    clearHighlight();
    // 실제 클릭은 이미 브라우저가 처리했으므로 추가 click() 불필요
    // DOM 변화 대기 후 다음 단계
    waitForDomChange().then(async () => {
      await sleep(350);
      runStep(idx + 1);
    });
  });
}

// 타겟에 한 번만 발화하는 클릭 리스너
let _clickHandlerRef = null;
function waitForUserClick(target, cb) {
  // 이전 리스너 정리
  if (_clickHandlerRef) {
    document.removeEventListener('click', _clickHandlerRef, true);
    _clickHandlerRef = null;
  }

  _clickHandlerRef = function handler(e) {
    // 타겟 또는 타겟 내부를 클릭했을 때
    if (target.contains(e.target) || e.target === target) {
      document.removeEventListener('click', handler, true);
      _clickHandlerRef = null;
      // CTA 버튼 제거
      document.getElementById('nui-cta')?.remove();
      cb();
    }
  };
  document.addEventListener('click', _clickHandlerRef, true);
}

function cancelClickWait() {
  if (_clickHandlerRef) {
    document.removeEventListener('click', _clickHandlerRef, true);
    _clickHandlerRef = null;
  }
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
  cancelClickWait();
  clearHighlight();
  document.getElementById('nui-roadmap')?.remove();
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

  // 오버레이 (배경 클릭 = 가이드 중단)
  const ov = document.createElement('div');
  ov.id = 'nui-overlay';
  ov.addEventListener('click', e => {
    // 타겟 위면 중단 안 함
    if (!el.contains(e.target)) stopGuide();
  });
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
      <div class="t-hint">위 버튼을 직접 클릭하세요</div>
    `;
    document.body.appendChild(tip);
    requestAnimationFrame(() => {
      const tipH = tip.offsetHeight;
      const top  = Math.max(8, rect.top - tipH - 52);
      tip.style.top  = `${top}px`;
      tip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 295))}px`;
    });

    // CTA 버튼 (타겟 아래에 "클릭하세요" 버튼)
    const cta = document.createElement('button');
    cta.id = 'nui-cta';
    cta.textContent = `👉 "${el.textContent.trim().substring(0,14)}" 클릭하기`;
    cta.style.top  = `${Math.min(rect.bottom + 12, window.innerHeight - 60)}px`;
    cta.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
    cta.addEventListener('click', () => {
      cta.remove();
      el.click();
    });
    document.body.appendChild(cta);
  }, 350);
}

function clearHighlight() {
  document.querySelectorAll('.nui-target').forEach(el => el.classList.remove('nui-target'));
  ['nui-overlay','nui-tip','nui-arrow','nui-cta'].forEach(id => document.getElementById(id)?.remove());
  cancelClickWait();
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
  setStatus('분석 중...');

  const elements = getAllElements();
  chrome.runtime.sendMessage({ action: 'ANALYZE_WITH_GEMINI', prompt, domStructure: elements }, res => {
    setStatus('');
    if (!res || res.error) { setStatus('⚠ ' + (res?.error || '분석 실패')); return; }
    const seq = res.clickSequence;
    if (!seq || seq.length === 0) { setStatus('⚠ 관련 버튼을 찾지 못했어요'); return; }
    guide = { active: true, sequence: seq, stepIdx: 0, timer: null };
    closePanelKeepFab();
    runStep(0);
  });
}

function stopGuide() {
  guide.active = false;
  cancelClickWait();
  clearHighlight();
  document.getElementById('nui-roadmap')?.remove();
  chrome.storage.local.remove('nextui_last_guide');
}


// ══════════════════════════════════════════════════════════════
// 7. 음성 인식
// ══════════════════════════════════════════════════════════════
function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    const mic = document.getElementById('nui-mic');
    if (mic) { mic.title = '이 브라우저는 음성 인식을 지원하지 않아요'; mic.style.opacity = '.2'; }
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'ko-KR';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    document.getElementById('nui-mic')?.classList.add('listening');
    setStatus('🎤 듣는 중...');
  };

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results)
      .map(r => r[0].transcript).join('');
    const input = document.getElementById('nui-input');
    if (input) input.value = transcript;
    // 최종 결과면 자동 제출
    if (e.results[e.results.length - 1].isFinal) {
      setStatus('');
      document.getElementById('nui-mic')?.classList.remove('listening');
    }
  };

  recognition.onerror = (e) => {
    console.warn('[NUI] 음성 오류:', e.error);
    document.getElementById('nui-mic')?.classList.remove('listening');
    setStatus(e.error === 'not-allowed' ? '⚠ 마이크 권한이 필요해요' : '⚠ 음성 인식 실패');
  };

  recognition.onend = () => {
    document.getElementById('nui-mic')?.classList.remove('listening');
  };
}

function toggleVoice() {
  if (!recognition) return;
  const mic = document.getElementById('nui-mic');
  if (mic?.classList.contains('listening')) {
    recognition.stop();
  } else {
    document.getElementById('nui-input').value = '';
    recognition.start();
  }
}


// ══════════════════════════════════════════════════════════════
// 8. FAB + 패널 위젯
// ══════════════════════════════════════════════════════════════
function injectFab() {
  injectStyles();
  if (document.getElementById('nui-fab')) return;

  // FAB 버튼
  const fab = document.createElement('button');
  fab.id = 'nui-fab';
  fab.textContent = '✦';
  fab.title = '반딧불이 가이드';
  document.body.appendChild(fab);

  fab.addEventListener('click', togglePanel);
}

function togglePanel() {
  const existing = document.getElementById('nui-panel');
  const fab = document.getElementById('nui-fab');
  if (existing) {
    existing.remove();
    fab?.classList.remove('active');
  } else {
    openPanel();
    fab?.classList.add('active');
  }
}

function openPanel() {
  injectStyles();
  document.getElementById('nui-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'nui-panel';
  panel.innerHTML = `
    <div class="p-title">✦ 반딧불이 가이드</div>
    <div class="p-input-row">
      <input type="text" id="nui-input" placeholder="어디로 안내해 드릴까요?" autocomplete="off"/>
      <button id="nui-mic" title="음성 입력">🎤</button>
    </div>
    <button id="nui-send">안내 시작하기</button>
    <div id="nui-status"></div>
  `;
  document.body.appendChild(panel);

  // 이벤트
  document.getElementById('nui-send').addEventListener('click', () => {
    const p = document.getElementById('nui-input')?.value.trim();
    if (p) startGuide(p);
  });
  document.getElementById('nui-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('nui-send').click();
  });
  document.getElementById('nui-mic').addEventListener('click', toggleVoice);

  // 음성 초기화
  setupVoice();

  // 포커스
  setTimeout(() => document.getElementById('nui-input')?.focus(), 80);
}

function closePanelKeepFab() {
  document.getElementById('nui-panel')?.remove();
  document.getElementById('nui-fab')?.classList.remove('active');
}

function setStatus(msg) {
  const el = document.getElementById('nui-status');
  if (el) el.textContent = msg;
}


// ══════════════════════════════════════════════════════════════
// 9. 메시지 리스너
// ══════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'TOGGLE_WIDGET') {
    injectFab();
    sendResponse({ ok: true });
    return;
  }

  if (request.action === 'CRAWL_DOM') {
    sendResponse(getAllElements());
    return;
  }
});