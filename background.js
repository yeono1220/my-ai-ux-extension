// background.js

async function getApiKey() {
  const data = await chrome.storage.local.get(['GEMINI_API_KEY']);
  console.log(" [LOG] 저장소에서 키 호출 결과:", data.GEMINI_API_KEY ? "키 존재함" : "키 없음!");
  return data.GEMINI_API_KEY;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ANALYZE_WITH_GEMINI") {
    console.log(" [LOG] 팝업으로부터 분석 요청 받음:", request.prompt);
    
    (async () => {
      try {
        const apiKey = await getApiKey();
        if (!apiKey) {
          console.error(" [ERROR] API 키가 없습니다. 콘솔에서 등록하세요.");
          sendResponse({ error: "API 키 누락" });
          return;
        }

        console.log(" [LOG] Gemini API 호출 시작...");
        const result = await handleGeminiAnalysis(request.prompt, request.domStructure, apiKey);
        console.log(" [LOG] Gemini 분석 성공:", result);
        sendResponse(result);
      } catch (error) {
        console.error(" [ERROR] 분석 중 예외 발생:", error);
        sendResponse({ error: error.message });
      }
    })();
    return true; 
  }
});

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