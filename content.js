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
// content.js

// 1. 화면의 주요 요소 정보를 추출하는 함수
function getDomSnapshot() {
  const interactiveElements = Array.from(document.querySelectorAll('button, a, input, [role="button"]'));
  return interactiveElements.map((el, index) => ({
    id: index,
    tagName: el.tagName,
    text: el.innerText.trim() || el.ariaLabel || el.placeholder,
    selector: getUniqueSelector(el) // 요소를 다시 찾기 위한 고유 셀렉터 추출 함수
  })).filter(item => item.text.length > 0); // 텍스트가 있는 것만 전송 (토큰 절약)
}

// 2. 가이드 시작 함수
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "START_GUIDE") {
    const domStructure = getDomSnapshot();
    
    // Background Script를 통해 Gemini에게 물어봄
    chrome.runtime.sendMessage({
      action: "ANALYZE_WITH_GEMINI",
      prompt: request.prompt,
      domStructure: domStructure
    }, (aiResponse) => {
      if (aiResponse && aiResponse.targetSelector) {
        applyFirefly(aiResponse.targetSelector, aiResponse.reason);
      }
    });
  }
});

function applyFirefly(selector, message) {
  const target = document.querySelector(selector);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('ux-guide-firefly-target'); // 이전에 정의한 번쩍이는 CSS
    showNativeTooltip(target, message); // AI가 설명해준 이유를 툴팁으로 표시
  }
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
// 1. 단계별 로드맵 생성 함수
function createRoadmap(steps, currentStepIndex) {
  const existing = document.querySelector('.ux-roadmap-container');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.className = 'ux-roadmap-container';

  steps.forEach((step, index) => {
    const stepEl = document.createElement('div');
    stepEl.className = `step ${index === currentStepIndex ? 'active' : (index < currentStepIndex ? 'completed' : '')}`;
    stepEl.innerText = `${index + 1}. ${step}`;
    container.appendChild(stepEl);
  });

  document.body.appendChild(container);
}

// 2. 반딧불이 가이드(하이라이트) 적용 함수
function guideToElement(selector, message) {
  // 기존 하이라이트 제거
  document.querySelectorAll('.firefly-highlight').forEach(el => el.classList.remove('firefly-highlight'));

  const target = document.querySelector(selector);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('firefly-highlight');

    // 간단한 툴팁 추가 (반딧불이 설명)
    showFireflyTooltip(target, message);
  }
}

function showFireflyTooltip(target, message) {
  let tooltip = document.querySelector('.firefly-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'firefly-tooltip';
    document.body.appendChild(tooltip);
  }
  
  const rect = target.getBoundingClientRect();
  tooltip.style.position = 'absolute';
  tooltip.style.top = `${rect.bottom + window.scrollY + 10}px`;
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.innerText = `💡 ${message}`;
  tooltip.style.background = '#333';
  tooltip.style.color = '#fff';
  tooltip.style.padding = '8px 12px';
  tooltip.style.borderRadius = '8px';
  tooltip.style.zIndex = '10001';
}

// 3. 실행 예시 (국세청/금융 사이트 가정)
// 실제로는 background.js나 popup.js에서 AI 분석 결과를 받아 실행하게 됩니다.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "start_guide") {
    // 예: "계좌 이체" 가이드 시작
    const mySteps = ["로그인", "이체 메뉴 선택", "금액 입력", "인증 및 완료"];
    createRoadmap(mySteps, 1); // 현재 2단계인 '이체 메뉴 선택' 진행 중
    
    // 이체 버튼 하이라이트 (실제 사이트의 selector에 맞게 변경 필요)
    guideToElement('button[aria-label="이체"]', "이 버튼을 누르면 돈을 보낼 수 있어요!");
  }
});
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
function startGuiding(text) {
  // 1. 기존에 적용된 가이드 효과 모두 제거 (초기화)
  document.querySelectorAll('.ux-guide-firefly-target').forEach(el => {
    el.classList.remove('ux-guide-firefly-target');
  });
  const oldTooltip = document.querySelector('.ux-guide-tooltip');
  if (oldTooltip) oldTooltip.remove();

  // 2. 타겟 찾기
  const buttons = Array.from(document.querySelectorAll('button, a, input[type="button"]'));
  // 입력된 텍스트와 가장 유사한 버튼 찾기
  const target = buttons.find(el => 
    el.innerText.includes(text) || 
    (el.ariaLabel && el.ariaLabel.includes(text))
  );

  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // 3. 클래스 추가 (스타일 시트에 정의된 것만 사용)
    target.classList.add('ux-guide-firefly-target');
    
    // 4. 툴팁 생성
    const tip = document.createElement('div');
    tip.className = 'ux-guide-tooltip';
    tip.innerText = `✨ 이 버튼을 클릭하세요: "${target.innerText.trim()}"`;
    
    document.body.appendChild(tip);

    // 위치 계산 (target 내부가 아니라 body에 붙여서 사이트 깨짐 방지)
    const rect = target.getBoundingClientRect();
    tip.style.top = `${rect.top + window.scrollY - 45}px`;
    tip.style.left = `${rect.left + window.scrollX}px`;
  }
}