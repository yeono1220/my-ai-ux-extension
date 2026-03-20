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
        const elements = getClickableElements(); 
        
        chrome.runtime.sendMessage({
          type: "ASK_GEMINI",
          prompt: request.prompt,
          elements: elements
        }, (response) => {
          // [수정] 응답에 css가 있으면 페이지에 입힙니다.
          if (response && response.css) {
            applyCustomStyle(response.css);
          }
        });
    }
});


// content.js 내의 applyCustomStyle 함수 수정
function applyCustomStyle(cssCode) {
    let styleTag = document.getElementById('gemini-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'gemini-style';
        document.head.appendChild(styleTag);
    }
    
    // Gemini가 준 CSS가 단순할 경우를 대비해, 
    // 모든 영역을 강제로 검게 만드는 '치트키' CSS를 추가합니다.
    const forceDark = `
        html, body, #container, #contents, .main_content { 
            background-color: #000000 !important; 
            background: #000000 !important;
            color: #ffffff !important; 
        }
        div, section, header, footer {
            background-color: transparent !important;
        }
    `;
    
    styleTag.textContent = cssCode + forceDark; 
    console.log("[로그] 스타일 강제 적용 완료!");
}