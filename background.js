// background.js

async function getApiKey() {
  const data = await chrome.storage.local.get(['GEMINI_API_KEY']);
  console.log(" [LOG] 저장소에서 키 호출 결과:", data.GEMINI_API_KEY ? "키 존재함" : "키 없음!");
  return data.GEMINI_API_KEY;
}

// background.js

// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ASK_GEMINI")
 {
    // 비동기 처리를 위해 즉시 실행 함수(IIFE) 사용
    (async () => {
      try {
        // 1. 저장소에서 키 가져오기 (간접 인용)
        const data = await chrome.storage.local.get(['GEMINI_API_KEY']);
        const apiKey = data.GEMINI_API_KEY;

        if (!apiKey) throw new Error("API KEY가 없습니다.");

        // 2. Gemini API 호출
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `웹 페이지 버튼 목록: ${JSON.stringify(request.domStructure)}\n\n질문: "${request.prompt}"\n\n가장 적합한 버튼의 'index'를 골라 JSON으로만 답하세요. 예: {"targetIndex": 2, "reason": "이 버튼을 누르세요"}`
              }]
            }]
          })
        });

        const result = await response.json();
        const aiText = result.candidates[0].content.parts[0].text;
        const jsonResult = JSON.parse(aiText.match(/\{.*\}/s)[0]);

        // 3. 응답 보내기
        sendResponse(jsonResult);
      } catch (err) {
        console.error("AI 분석 에러:", err);
        sendResponse({ error: err.message });
      }
    })();

    return true; // ⭐ 중요: 이 줄이 없으면 'message port closed' 에러가 납니다.
  }
});

async function runGeminiTask(request, sendResponse) {
  try {
    const data = await chrome.storage.local.get(['GEMINI_API_KEY']);
    const apiKey = data.GEMINI_API_KEY;

    if (!apiKey) throw new Error("API KEY가 없습니다.");

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `웹 페이지의 버튼 목록입니다: ${JSON.stringify(request.domStructure)}\n\n사용자 질문: "${request.prompt}"\n\n질문에 가장 적합한 버튼의 'index'를 골라 JSON으로 답하세요. 예: {"targetIndex": 5, "reason": "이 버튼을 누르세요"}`
          }]
        }]
      })
    });

    const result = await response.json();
    const aiText = result.candidates[0].content.parts[0].text;
    const jsonResult = JSON.parse(aiText.match(/\{.*\}/s)[0]);

    console.log(" [LOG] AI 분석 성공:", jsonResult);
    sendResponse(jsonResult); // 이제 안전하게 응답이 전달됩니다.
  } catch (err) {
    console.error(" [ERROR]", err);
    sendResponse({ error: err.message });
  }
}
async function handleGeminiAnalysis(userPrompt, domStructure, apiKey) {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `웹 안내 가이드... (생략) \n질문: ${userPrompt}\n구조: ${JSON.stringify(domStructure)}` }] }]
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error(" [ERROR] Gemini API 응답 에러:", errorData);
    throw new Error("API 응답 실패");
  }

  const data = await response.json();
  const aiText = data.candidates[0].content.parts[0].text;
  console.log(" [LOG] AI 원본 응답:", aiText);

  const jsonMatch = aiText.match(/\{.*\}/s);
  return JSON.parse(jsonMatch[0]);
}