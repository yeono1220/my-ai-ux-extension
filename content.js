// content.js

// 중복 주입 가드 (manifest 자동 주입 + background.js 재주입으로 인한 재선언 방지)
if (!window.__nuiContentLoaded) {
window.__nuiContentLoaded = true;

// ══════════════════════════════════════════════════════════════
// 0. 상태
// ══════════════════════════════════════════════════════════════
let guide = { active: false, sequence: [], stepIdx: 0, timer: null, clickTarget: null, clickHandler: null };
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
  if (!guide.active || idx >= guide.sequence.length) {
    finishGuide(); return;
  }
  const step = guide.sequence[idx];
  guide.stepIdx = idx;
  renderRoadmap(idx);

  // UI가 1클릭 후 동적으로 변하는 경우 대비: 타겟이 나타날 때까지 폴링
  const target = await waitForTarget(step.selector, step.text, 5000);
  if (!guide.active) return;
  if (!target) {
    console.warn('[NUI] 타겟 못 찾음 (5s 대기 후):', step.text);
    showError(`${idx + 1}단계 버튼을 찾지 못했어요: ${step.text}`);
    stopGuide();
    return;
  }

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

      // 페이지 전환 대비: 다음 단계(또는 완료) 상태를 즉시 저장
      const nextIdx = idx + 1;
      chrome.storage.local.set({
        nextui_last_guide: { sequence: guide.sequence, stepIdx: nextIdx, ts: Date.now() }
      });

      clearHighlight();

      if (nextIdx >= guide.sequence.length) {
        // 마지막 단계: 페이지 전환이 일어나면 새 페이지에서 resume IIFE가 배너를 띄움
        // 전환이 없으면 1.2초 후 같은 페이지에서 finishGuide 호출 (배너 깜빡임 방지)
        let navigating = false;
        const onUnload = () => { navigating = true; };
        window.addEventListener('beforeunload', onUnload, { once: true });
        setTimeout(() => {
          window.removeEventListener('beforeunload', onUnload);
          if (!navigating) finishGuide();
        }, 1200);
      } else {
        runStep(nextIdx);
      }
    } else {
      // 타겟 바깥 클릭 → 안내 중단 (기존 오버레이 클릭 동작과 동등)
      stopGuide();
    }
  };
  guide.clickTarget = target;
  guide.clickHandler = onDocClick;
  document.addEventListener('click', onDocClick, true);
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

  const SEL = 'a,button,summary,[role="button"],[role="menuitem"],[role="tab"],[role="option"],[role="link"],[onclick],input[type="button"],input[type="submit"],input[type="reset"]';
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
  return null;
}

function nrm(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getElTextNorm(el) {
  return nrm(el.textContent) ||
         nrm(el.getAttribute && el.getAttribute('aria-label')) ||
         nrm(el.getAttribute && el.getAttribute('title')) ||
         nrm(el.value);
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
  // storage는 dismiss 시점에 클리어 — 페이지 전환 시 새 페이지 resume이 배너를 띄울 수 있도록

  // 위젯 유지: 목적지 도착 후에도 다음 질문 가능하도록
  if (!document.getElementById('nui-widget')) {
    injectFloatingWidget();
  }

  // 로드맵을 도착 상태로 리렌더 (마지막 단계 highlighted)
  renderArrivedRoadmap();

  // 가운데 큰 도착 배너 (어르신 가독성)
  showArrivalBanner();
}

function renderArrivedRoadmap() {
  if (!guide.sequence || guide.sequence.length === 0) return;
  injectStyles();
  document.getElementById('nui-roadmap')?.remove();
  const c = document.createElement('div'); c.id = 'nui-roadmap';
  c.innerHTML = '<div class="rm-title">클릭 순서</div>';
  guide.sequence.forEach((step, i) => {
    const isLast = i === guide.sequence.length - 1;
    const cls = isLast ? 'curr arrived' : 'done';
    const d = document.createElement('div');
    d.className = `rm-step ${cls}`;
    d.innerHTML = `<div class="dot"></div><span>${step.text}</span>`;
    c.appendChild(d);
  });
  document.body.appendChild(c);
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
    chrome.storage.local.remove('nextui_last_guide');
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
    guide = { active: true, sequence: seq, stepIdx: 0, timer: null, clickTarget: null, clickHandler: null };
    runStep(0);
  });
}

function stopGuide() {
  guide.active = false;
  if (guide.clickHandler) {
    document.removeEventListener('click', guide.clickHandler, true);
    guide.clickHandler = null;
    guide.clickTarget = null;
  }
  clearHighlight();
  clearTimeout(guide.timer);
  document.getElementById('nui-roadmap')?.remove();
  document.getElementById('nui-bar')?.remove();
  document.getElementById('nui-arrival')?.remove();
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
    <button class="wm" id="nui-mic" title="음성으로 말하기" aria-label="음성으로 말하기">🎤</button>
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

  // 음성 입력 (어르신 친화)
  document.getElementById('nui-mic').addEventListener('click', startVoiceInput);

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
    const data = await chrome.storage.local.get('nextui_last_guide');
    const saved = data?.nextui_last_guide;
    if (!saved || !Array.isArray(saved.sequence)) return;
    // 5분 초과면 만료 처리
    if (Date.now() - (saved.ts || 0) > 5 * 60 * 1000) {
      chrome.storage.local.remove('nextui_last_guide');
      return;
    }
    // 페이지 로드 완료 대기
    if (document.readyState !== 'complete') {
      await new Promise(r => window.addEventListener('load', r, { once: true }));
    }
    await sleep(600);

    // 마지막 클릭 후 페이지 전환 → 새 페이지에서 완료 처리
    if (saved.stepIdx >= saved.sequence.length) {
      guide = { active: true, sequence: saved.sequence, stepIdx: saved.stepIdx, timer: null, clickTarget: null, clickHandler: null };
      console.log('[NUI] 목적지 도착 (페이지 전환 후)');
      finishGuide();
      return;
    }

    guide = { active: true, sequence: saved.sequence, stepIdx: saved.stepIdx, timer: null, clickTarget: null, clickHandler: null };
    console.log('[NUI] 재개:', saved.stepIdx + 1, '/', saved.sequence.length);
    runStep(saved.stepIdx);
  } catch (e) {
    console.warn('[NUI] resume failed:', e);
  }
})();

} // end __nuiContentLoaded guard
