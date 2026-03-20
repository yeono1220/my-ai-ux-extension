
const MODEL_NAME = "gemini-2.0-flash";

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
// background.js 내의 callGemini 함수 수정
async function callGemini(userPrompt, elements, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        contents: [{
            parts: [{
            text: `사용자 요청: "${userPrompt}"
            이 웹페이지의 배경을 완전히 검은색으로 바꾸고 글자는 흰색으로 바꾸는 CSS 코드를 작성하세요. 
            단순히 body만 바꾸지 말고, 페이지 전체 레이아웃이 검게 보이도록 모든 배경 요소를 포함하세요.
            반드시 {"css": "코드"} 형식의 JSON으로만 답하세요.`            }]
        }],
        generationConfig: {
            response_mime_type: "application/json"
                }
            })
        });

    const data = await response.json();

    if (data.error) {
      console.error("--- [로그 3-에러] 상세 내용 ---", data.error);
      throw new Error(data.error.message);
    }

    const aiText = data.candidates[0].content.parts[0].text;
    // 만약 AI가 ```json ... ``` 같은 마크다운을 붙여준다면 정규식으로 추출
    const jsonMatch = aiText.match(/\{.*\}/s);
    return JSON.parse(jsonMatch ? jsonMatch[0] : aiText);

  } catch (error) {
    console.error("[로그 3-에러] 호출 실패:", error);
    throw error;
  }
}