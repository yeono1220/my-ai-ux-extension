// content.js 상단 또는 적절한 위치에 추가
function getClickableElements() {
  // 클릭 가능한 요소들 수집
  const elements = document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
  
  return Array.from(elements).map(el => {
    const rect = el.getBoundingClientRect(); // 요소의 위치/크기 정보 (dom.py 로직 반영)
    const text = el.innerText.trim() || el.getAttribute('aria-label') || el.value || "";
    
    return {
      tag: el.tagName.toLowerCase(),
      text: text,
      id: el.id || "",
      className: el.className || "",
      selector: getUniqueSelector(el),
      // Gemini에게 전달할 시각적 좌표 데이터
      location: { x: Math.round(rect.left), y: Math.round(rect.top) },
      size: { width: Math.round(rect.width), height: Math.round(rect.height) },
      isVisible: rect.width > 0 && rect.height > 0
    };
  }).filter(el => el.text.length > 0 && el.isVisible).slice(0, 50); // 상위 50개 제한
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

function executeAction(selector) {
  const targetEl = document.querySelector(selector);
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.style.outline = "8px solid #00D4FF";
    // ... 시각적 피드백 스타일 코드 생략 ...
    setTimeout(() => {
      targetEl.click();
      console.log(`[Next UI] Clicked: ${selector}`);
    }, 1500);
  } else {
    alert("죄송합니다. 버튼을 찾았지만 페이지에서 실행할 수 없습니다.");
  }
}

// Popup으로부터 메시지를 받는 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "EXTRACT_AND_ANALYZE") {
    // 1. DOM 요소 수집 (기존 getClickableElements 함수 필요)
    const elements = getClickableElements(); 
    
    // 2. Background로 API 분석 요청 전송
    chrome.runtime.sendMessage({
      type: "ASK_GEMINI",
      prompt: request.prompt,
      elements: elements
    }, (response) => {
      if (response && response.target) {
        executeAction(response.target);
      }
    });
  }
});