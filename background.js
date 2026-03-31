// background.js

// ── 메시지 리스너 ─────────────────────────────────────────
// ✅ MV3 안전 패턴: IIFE 대신 Promise를 직접 .then() 체이닝
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ANALYZE_WITH_GEMINI") {
    console.log("[BG] 분석 요청 수신:", request.prompt);

    handleGeminiAnalysis(request.prompt, request.domStructure)
      .then(result => {
        console.log("[BG] Gemini 분석 성공:", result);
        sendResponse(result);
      })
      .catch(err => {
        console.error("[BG] 분석 실패:", err.message);
        sendResponse({ error: err.message });
      });

    return true; // ✅ 비동기 sendResponse 유지
  }
});

// ── Gemini API 호출 ───────────────────────────────────────
async function handleGeminiAnalysis(userPrompt, domStructure) {
  // ✅ options.js 저장 키와 동일하게 맞춤: GEMINI_API_KEY
  const data = await chrome.storage.local.get(['GEMINI_API_KEY']);
  const apiKey = data.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("[BG] API 키 없음 — 옵션 페이지에서 저장하세요.");
    throw new Error("API 키 누락");
  }

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const systemPrompt = `
당신은 웹 페이지 UI 가이드 도우미입니다.
사용자의 질문을 분석하고, 아래 DOM 요소 목록 중 가장 관련 있는 요소를 찾아주세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{
  "targetIndex": <숫자 — elements 배열의 index>,
  "targetSelector": "<CSS 셀렉터 문자열>",
  "reason": "<사용자에게 보여줄 안내 메시지>"
}
  `.trim();

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${systemPrompt}\n\n질문: ${userPrompt}\n\nDOM 요소 목록:\n${JSON.stringify(domStructure, null, 2)}`
        }]
      }]
    })
  });

  if (!response.ok) {
    const errData = await response.json();
    console.error("[BG] Gemini API 오류:", errData);
    throw new Error(`Gemini API 오류: ${errData?.error?.message || response.status}`);
  }

  const resData = await response.json();
  const aiText = resData.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!aiText) throw new Error("Gemini 응답이 비어있습니다.");
  console.log("[BG] AI 원본 응답:", aiText);

  // JSON만 추출 (마크다운 코드블록 포함 대응)
  const jsonMatch = aiText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON 파싱 실패: " + aiText);

  return JSON.parse(jsonMatch[0]);
}
