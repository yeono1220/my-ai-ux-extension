/**
 * 1. 현재 페이지에서 클릭 가능한 모든 요소(버튼, 링크 등) 수집
 */
function getClickableElements() {
  const elements = document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
  return Array.from(elements).map(el => {
    // 부모 요소나 본인의 텍스트를 조합하여 문맥 파악
    const text = el.innerText.trim() || el.getAttribute('aria-label') || el.value || "";
    return {
      text: text,
      id: el.id || "",
      className: el.className || "",
      // 해당 요소를 다시 찾기 위한 최적의 CSS Selector 생성
      selector: getUniqueSelector(el)
    };
  }).filter(el => el.text.length > 0).slice(0, 100); // 상위 100개로 제한 (토큰 절약)
}

/**
 * 2. 요소를 특정하기 위한 고유 Selector 생성 함수
 */
function getUniqueSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.tagName === 'BODY') return 'body';
  
  // ID가 없을 경우 경로를 따라 생성 (간단 버전)
  let path = el.tagName.toLowerCase();
  if (el.className) {
    path += `.${el.className.trim().split(/\s+/).join('.')}`;
  }
  return path;
}

/**
 * 3. Gemini가 찾아준 버튼을 하이라이트하고 클릭하는 함수
 */
function executeAction(selector) {
  const targetEl = document.querySelector(selector);
  
  if (targetEl) {
    // 화면 중앙으로 이동
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 시각적 피드백 (반짝이는 효과)
    targetEl.style.transition = "all 0.5s ease";
    targetEl.style.outline = "8px solid #00D4FF";
    targetEl.style.outlineOffset = "4px";
    targetEl.style.boxShadow = "0 0 30px #00D4FF";
    targetEl.style.transform = "scale(1.1)";

    // 1.5초 뒤 실제 클릭 수행
    setTimeout(() => {
      targetEl.click();
      console.log(`[Next UI] Clicked: ${selector}`);
    }, 1500);
  } else {
    alert("죄송합니다. 버튼을 찾았지만 페이지에서 실행할 수 없습니다.");
  }
}

/**
 * 4. Popup이나 Background로부터 메시지 수신
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "EXTRACT_AND_ANALYZE") {
    const elements = getClickableElements();
    
    // Background Script(Gemini 연동부)로 데이터 전달
    chrome.runtime.sendMessage({
      type: "ASK_GEMINI",
      prompt: request.prompt,
      elements: elements
    }, (response) => {
      if (response && response.target) {
        executeAction(response.target);
      } else {
        alert("Gemini가 적절한 버튼을 찾지 못했습니다. 다시 명령해 주세요.");
      }
    });
  }
  
  // UI 테마 변경 (기존 기능 유지)
  if (request.action === "APPLY_BLUE_THEME") {
    document.body.style.filter = "hue-rotate(180deg) brightness(0.8)"; // 간단한 블루톤 변환 예시
    sendResponse({status: "Theme Applied"});
  }
});

console.log("Next UI Content Script Loaded!");