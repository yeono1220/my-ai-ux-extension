// background.js
const MODEL_NAME = "gemini-1.5-flash";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ASK_GEMINI") {
    // 저장소에서 API 키를 먼저 가져온 뒤 호출
    chrome.storage.local.get(["GEMINI_API_KEY"], (result) => {
     if (!result.GEMINI_API_KEY) {
        // alert 대신 로그를 남기고 실행 중단
        console.error("API 키가 없습니다.");
        sendResponse({ target: null, error: "API_KEY_MISSING" });
        return;
      }
      callGemini(request.prompt, request.elements, result.GEMINI_API_KEY).then(sendResponse);
    });
    return true; 
  }
});

async function callGemini(userPrompt, elements, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
  // 제미나이에게 줄 프롬프트 (가장 중요!)
  // background.js 내 프롬프트 수정
const finalPrompt = `
  당신은 웹 UI 분석 전문가입니다.
  사용자 요청: "${userPrompt}"
  
  아래는 현재 페이지의 클릭 가능한 요소 목록입니다. 
  각 요소는 텍스트, Selector, 위치(x, y), 크기 정보를 포함하고 있습니다.
  목록: ${JSON.stringify(elements)}

  [지침]
  1. 사용자의 의도와 가장 일치하는 텍스트를 가진 요소를 찾으세요.
  2. 만약 텍스트가 모호하다면, 일반적인 웹 레이아웃(예: 상단 우측은 로그인/마이페이지)을 고려하세요.
  3. 반드시 아래 JSON 형식으로만 응답하세요:
  {"target": "선택한_selector"}
`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }]
      })
    });

    const data = await response.json();
    // 제미나이의 답변 텍스트 추출
    const aiResponse = data.candidates[0].content.parts[0].text;
    
    // JSON 부분만 파싱 (가끔 AI가 ```json ... ``` 처럼 보낼 때를 대비)
    const jsonMatch = aiResponse.match(/\{.*\}/);
    return JSON.parse(jsonMatch[0]);
    
  } catch (error) {
    console.error("Gemini 호출 에러:", error);
    return { target: null };
  }
}