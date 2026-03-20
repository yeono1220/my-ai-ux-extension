const MODEL_NAME = "gemini-2.5-flash";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ASK_GEMINI") {
    console.log("[로그 3: Background] 요청 수신됨");
    
    chrome.storage.local.get(["GEMINI_API_KEY"], (result) => {
      if (!result.GEMINI_API_KEY) {
        console.error("[로그 3-에러] API 키가 없습니다.");
        sendResponse({ target: null, error: "API_KEY_MISSING" });
        return;
      }

      callGemini(request.prompt, request.elements, result.GEMINI_API_KEY)
        .then(response => {
          console.log("[로그 3-완료] Gemini 응답 성공");
          sendResponse(response);
        })
        .catch(err => {
          console.error("[로그 3-에러] 호출 실패:", err);
          sendResponse({ target: null, error: err.message });
        });
    });
    return true; // 비동기 응답을 위해 포트 유지
  }
});

// background.js 내의 callGemini 함수 부분 수정
async function callGemini(userPrompt, elements, apiKey) {
  // 모델 경로를 'models/gemini-1.5-flash'로 정확히 수정
  const MODEL_ID = "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL_ID}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ 
        parts: [{ 
          text: `사용자 요청: ${userPrompt}\n요소 목록: ${JSON.stringify(elements)}\n위 목록 중 클릭할 요소의 selector를 JSON {"target": "..."} 형식으로만 답하세요.` 
        }] 
      }]
    })
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message); // 여기서 'models/not found' 에러가 발생했었음
  }

  const aiText = data.candidates[0].content.parts[0].text;
  const jsonMatch = aiText.match(/\{.*\}/);
  return JSON.parse(jsonMatch[0]);
}