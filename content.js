// content.js

// ── 1. DOM 크롤링 ──────────────────────────────────────────
function getClickableElements() {
  const selectors = 'button, a, [role="button"], input[type="button"], input[type="submit"]';
  return Array.from(document.querySelectorAll(selectors)).map((el, index) => {
    const rect = el.getBoundingClientRect();
    const text = (el.innerText || el.getAttribute('aria-label') || el.value || "").trim().substring(0, 50);
    return {
      index,
      tag:       el.tagName.toLowerCase(),
      text,
      id:        el.id || "",
      selector:  getUniqueSelector(el),
      location:  { x: Math.round(rect.left), y: Math.round(rect.top) },
      size:      { width: Math.round(rect.width), height: Math.round(rect.height) },
      isVisible: rect.width > 0 && rect.height > 0
    };
  }).filter(el => el.text.length > 0 && el.isVisible).slice(0, 50);
}

function getUniqueSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.tagName === 'BODY') return 'body';
  let path = el.tagName.toLowerCase();
  if (el.className) path += `.${el.className.trim().split(/\s+/).join('.')}`;
  return path;
}

// ── 2. 반딧불이 하이라이트 ────────────────────────────────
function applyFirefly(selectorOrIndex, message) {
  document.querySelectorAll('.ux-guide-firefly-target').forEach(el => {
    el.classList.remove('ux-guide-firefly-target');
  });
  document.querySelector('.ux-guide-tooltip')?.remove();

  let target;
  if (typeof selectorOrIndex === 'number') {
    const all = document.querySelectorAll(
      'button, a, [role="button"], input[type="button"], input[type="submit"]'
    );
    target = all[selectorOrIndex];
  } else {
    target = document.querySelector(selectorOrIndex);
  }

  if (!target) {
    console.warn("[Next UI] 타겟 요소를 찾을 수 없습니다:", selectorOrIndex);
    return;
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('ux-guide-firefly-target');

  const tip = document.createElement('div');
  tip.className = 'ux-guide-tooltip';
  tip.innerText = `✨ ${message}`;
  document.body.appendChild(tip);

  const rect = target.getBoundingClientRect();
  tip.style.cssText = `
    position: absolute;
    top: ${rect.top + window.scrollY - 45}px;
    left: ${rect.left + window.scrollX}px;
    background: #333; color: #fff;
    padding: 8px 12px; border-radius: 8px;
    z-index: 10001; font-size: 14px; pointer-events: none;
  `;
}

// ── 3. 로드맵 UI ──────────────────────────────────────────
function createRoadmap(steps, currentStepIndex) {
  document.querySelector('.ux-roadmap-container')?.remove();
  const container = document.createElement('div');
  container.className = 'ux-roadmap-container';
  steps.forEach((step, index) => {
    const stepEl = document.createElement('div');
    const state = index === currentStepIndex ? 'active' : index < currentStepIndex ? 'completed' : '';
    stepEl.className = `step ${state}`;
    stepEl.innerText = `${index + 1}. ${step}`;
    container.appendChild(stepEl);
  });
  document.body.appendChild(container);
}

// ── 4. CSS 적용 ───────────────────────────────────────────
function applyCustomStyle(cssCode) {
  let styleTag = document.getElementById('gemini-style');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'gemini-style';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = cssCode;
  console.log("[Next UI] 스타일 적용 완료");
}

// ── 5. 메시지 리스너 (단일) ───────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // popup → content: DOM 크롤링 후 동기 반환
  if (request.action === "CRAWL_DOM") {
    const elements = getClickableElements();
    console.log(`[Next UI] 크롤링 완료: ${elements.length}개`);
    sendResponse(elements); // ✅ 동기 응답
    return;
  }

  // popup → content: AI 결과 화면 적용
  if (request.action === "APPLY_GUIDE") {
    const res = request.aiResponse;
    if (!res) return;

    if (res.targetIndex !== undefined) {
      applyFirefly(res.targetIndex, res.reason || "이 버튼을 클릭하세요!");
    } else if (res.targetSelector) {
      applyFirefly(res.targetSelector, res.reason || "이 버튼을 클릭하세요!");
    }
    if (res.steps) createRoadmap(res.steps, res.currentStep || 0);
    if (res.css)   applyCustomStyle(res.css);

    sendResponse({ ok: true });
    return;
  }
});
