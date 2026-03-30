// content.js — 정리된 단일 파일
// ============================================================
 
// ── 1. DOM 크롤링 ──────────────────────────────────────────
function getClickableElements() {
  const selectors = 'button, a, [role="button"], input[type="button"], input[type="submit"]';
  const elements = Array.from(document.querySelectorAll(selectors));
 
  return elements.map((el, index) => {
    const rect = el.getBoundingClientRect();
    const text = (el.innerText || el.getAttribute('aria-label') || el.value || "").trim().substring(0, 50);
 
    return {
      index:     index,
      tag:       el.tagName.toLowerCase(),
      text:      text,
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
  if (el.className) {
    path += `.${el.className.trim().split(/\s+/).join('.')}`;
  }
  return path;
}
 
// ── 2. 반딧불이 하이라이트 ────────────────────────────────
function applyFirefly(selectorOrIndex, message) {
  // 기존 하이라이트 제거
  document.querySelectorAll('.ux-guide-firefly-target').forEach(el => {
    el.classList.remove('ux-guide-firefly-target');
  });
  const oldTooltip = document.querySelector('.ux-guide-tooltip');
  if (oldTooltip) oldTooltip.remove();
 
  // selector(문자열) 또는 index(숫자) 둘 다 지원
  let target;
  if (typeof selectorOrIndex === 'number') {
    const all = document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
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
 
  // 툴팁 생성
  const tip = document.createElement('div');
  tip.className = 'ux-guide-tooltip';
  tip.innerText = `✨ ${message}`;
  document.body.appendChild(tip);
 
  const rect = target.getBoundingClientRect();
  tip.style.cssText = `
    position: absolute;
    top: ${rect.top + window.scrollY - 45}px;
    left: ${rect.left + window.scrollX}px;
    background: #333;
    color: #fff;
    padding: 8px 12px;
    border-radius: 8px;
    z-index: 10001;
    font-size: 14px;
  `;
}
 
// ── 3. 로드맵 UI ──────────────────────────────────────────
function createRoadmap(steps, currentStepIndex) {
  const existing = document.querySelector('.ux-roadmap-container');
  if (existing) existing.remove();
 
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
 
// ── 4. CSS 강제 적용 ──────────────────────────────────────
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
 
// ── 5. 메시지 리스너 (단일 통합) ─────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
 
  // popup.js → content.js: 프롬프트 수신 후 DOM 크롤링 → background로 전달
  if (request.action === "EXTRACT_AND_ANALYZE") {
    console.log("[Next UI] 가이드 요청 수신:", request.prompt);
 
    const elements = getClickableElements();
    console.log(`[Next UI] 크롤링 완료: ${elements.length}개 요소`);
 
    chrome.runtime.sendMessage({
      action: "ANALYZE_WITH_GEMINI",   // ✅ background.js 수신 키와 통일
      prompt: request.prompt,
      domStructure: elements
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[Next UI] background 응답 오류:", chrome.runtime.lastError.message);
        return;
      }
      if (!response) {
        console.warn("[Next UI] 응답 없음");
        return;
      }
 
      // AI 응답 처리
      if (response.targetIndex !== undefined) {
        applyFirefly(response.targetIndex, response.reason || "이 버튼을 클릭하세요!");
      } else if (response.targetSelector) {
        applyFirefly(response.targetSelector, response.reason || "이 버튼을 클릭하세요!");
      }
 
      if (response.steps) {
        createRoadmap(response.steps, response.currentStep || 0);
      }
 
      if (response.css) {
        applyCustomStyle(response.css);
      }
    });
 
    return true; // 비동기 sendResponse 유지
  }
});
