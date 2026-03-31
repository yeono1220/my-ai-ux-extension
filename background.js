// background.js

// ── 아이콘 클릭 → 페이지에 플로팅 위젯 주입 ──────────────
chrome.action.onClicked.addListener(async (tab) => {
  const forbidden = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'data:'];
  if (!tab.url || forbidden.some(p => tab.url.startsWith(p))) return;

  // content.js 재주입 (이미 있어도 무방)
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });

  // 위젯 토글 명령
  chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_WIDGET' });
});


// ── Gemini 분석 요청 ──────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ANALYZE_WITH_GEMINI') {
    handleGeminiAnalysis(request.prompt, request.domStructure)
      .then(result => sendResponse(result))
      .catch(err   => sendResponse({ error: err.message }));
    return true;
  }
});

async function handleGeminiAnalysis(userPrompt, domStructure) {
  const data = await chrome.storage.local.get(['GEMINI_API_KEY']);
  const apiKey = data.GEMINI_API_KEY;
  if (!apiKey) throw new Error('API 키 누락 — 옵션 페이지에서 저장해주세요');

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const systemPrompt = `
당신은 웹 페이지 UI 가이드 도우미입니다.
사용자가 원하는 목적지까지 도달하기 위해 클릭해야 할 요소들을 순서대로 알려주세요.

핵심 규칙:
- 숨겨진 메뉴(wasHidden: true) 안에 목적지가 있다면, 그 메뉴를 열기 위한 상위 요소부터 클릭 순서에 포함하세요.
- selector는 DOM 요소 목록의 selector 필드를 그대로 사용하세요.
- message는 "~을 클릭하세요" 형식의 한국어 안내문입니다.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 절대 금지:
{
  "clickSequence": [
    { "selector": "<CSS 셀렉터>", "text": "<요소 텍스트>", "message": "<안내 메시지>" },
    { "selector": "<CSS 셀렉터>", "text": "<요소 텍스트>", "message": "<안내 메시지>" }
  ]
}
  `.trim();

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${systemPrompt}\n\n사용자 요청: ${userPrompt}\n\nDOM 요소 목록:\n${JSON.stringify(domStructure, null, 2)}`
        }]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini API 오류: ${err?.error?.message || response.status}`);
  }

  const resData = await response.json();
  const aiText  = resData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!aiText) throw new Error('빈 응답');

  console.log('[BG] AI 응답:', aiText);
  const match = aiText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON 파싱 실패');
  return JSON.parse(match[0]);
}