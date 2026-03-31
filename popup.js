// popup.js

document.getElementById('runBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('promptInput').value.trim();
  if (!prompt) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // ✅ chrome://, edge://, about:// 등 주입 불가 페이지 차단
  const forbidden = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'data:'];
  if (!tab.url || forbidden.some(prefix => tab.url.startsWith(prefix))) {
    alert("이 페이지에서는 동작하지 않습니다.\n일반 웹 페이지(http/https)에서 사용해주세요.");
    return;
  }

  // 1. content.js 주입
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  } catch (e) {
    console.error("[Popup] content.js 주입 실패:", e.message);
    alert("스크립트 주입 실패: " + e.message);
    return;
  }

  // 2. content.js에서 DOM 크롤링
  chrome.tabs.sendMessage(tab.id, { action: "CRAWL_DOM" }, (domStructure) => {
    if (chrome.runtime.lastError) {
      console.error("[Popup] CRAWL_DOM 오류:", chrome.runtime.lastError.message);
      return;
    }

    // 3. background에 Gemini 분석 요청
    chrome.runtime.sendMessage({
      action: "ANALYZE_WITH_GEMINI",
      prompt: prompt,
      domStructure: domStructure
    }, (aiResponse) => {
      if (chrome.runtime.lastError) {
        console.error("[Popup] ANALYZE 오류:", chrome.runtime.lastError.message);
        return;
      }
      if (!aiResponse || aiResponse.error) {
        console.warn("[Popup] AI 응답 오류:", aiResponse?.error);
        alert("AI 분석 실패: " + (aiResponse?.error || "응답 없음"));
        return;
      }

      // 4. 결과를 content.js로 전달해서 화면에 적용
      chrome.tabs.sendMessage(tab.id, {
        action: "APPLY_GUIDE",
        aiResponse: aiResponse
      });
    });
  });
});
