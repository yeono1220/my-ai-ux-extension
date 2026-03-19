// background.js
const MODEL_NAME = "gemini-1.5-flash";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ASK_GEMINI") {
    // 저장소에서 API 키를 먼저 가져온 뒤 호출
    chrome.storage.local.get(["GEMINI_API_KEY"], (result) => {
      if (!result.GEMINI_API_KEY) {
        alert("API 키를 먼저 설정해주세요!");
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
  const finalPrompt = `
    당신은 웹 UI 자동화 전문가입니다.
    사용자 요청: "${userPrompt}"
    현재 페이지의 버튼/링크 목록: ${JSON.stringify(elements)}

    목록 중에서 사용자의 요청을 수행하기 위해 클릭해야 할 가장 적절한 'selector'를 딱 하나만 고르세요.
    반드시 아래 JSON 형식으로만 답변하세요. 다른 설명은 절대 하지 마세요.
    {"target": "선택한_selector_문자열"}
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