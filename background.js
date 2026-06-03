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
당신은 웹 페이지에서 사용자의 "최종 목표"를 단계별 클릭으로 안내하는 도우미입니다.
입력으로 사용자의 최종 목표와 "현재 페이지"의 DOM 요소 목록이 주어집니다.
한 번의 클릭으로 페이지가 전환될 수 있으므로, 당신은 "현재 페이지"에서 할 수 있는
다음 클릭들만 계획하면 됩니다. 페이지가 바뀌면 새 페이지에서 다시 호출됩니다.

먼저 판단하세요:
1) 목표가 현재 페이지에서 이미 달성되었는가?
   - 예: 상품이 장바구니에 담겼고 그 확인 화면/장바구니 페이지가 보임
   - 달성됨 → "status":"done", "clickSequence":[]
2) 아직 달성되지 않았다면 → "status":"continue" 와 함께,
   현재 페이지에서 목표에 더 가까워지기 위해 클릭할 요소들을 순서대로.

각 단계(clickSequence 항목)는 두 종류의 action을 가질 수 있습니다:
- 클릭: { "action":"click", "selector":..., "text":<요소 텍스트>, "message":<안내> }
- 입력: { "action":"type", "selector":<입력창 셀렉터>, "value":<입력할 검색어>, "text":<요소 텍스트>, "message":<안내> }

검색이 필요할 때 (매우 중요):
- 이 도우미는 자동으로 타이핑하지 않습니다. "사용자가 직접 입력하도록 안내"하는 방식입니다.
- 1단계: DOM 목록에서 isTextInput:true 인 검색 입력창을 찾아 action:"type" 으로 안내하세요.
  · value 에는 사용자 목표에서 뽑아낸 "검색어"만 넣으세요.
    (예: 목표가 "가장 싼 휴대용 선풍기..." → value:"휴대용 선풍기")
  · message 는 "검색창에 '휴대용 선풍기' 라고 입력하세요" 형식으로 작성하세요.
- 2단계: 그 다음에 검색 버튼(또는 돋보기 아이콘)을 action:"click" 으로 안내하세요.
  · message 는 "검색 버튼을 누르세요" 형식.
- 즉 검색은 보통 [type 1개 + click 1개] 두 단계로 구성됩니다.
- 입력창은 보통 tag:"input" 이고 placeholder(예: "찾고 싶은 상품을...")가 text에 들어 있습니다.

핵심 규칙:
- 현재 페이지에 실제로 보이는 요소만 사용하세요. 다음 페이지의 요소는 추측하지 마세요.
- "가장 싼", "최저가" 같은 조건이면 가격 정렬(낮은 가격순) 버튼을 우선 클릭하거나,
  목록에서 가장 저렴해 보이는 상품을 선택하세요.
- 숨겨진 메뉴(wasHidden: true) 안에 목적지가 있다면, 그 메뉴를 여는 상위 요소부터 포함하세요.
- selector는 DOM 요소 목록의 selector 필드를 그대로 사용하세요.
- message는 짧은 한국어 안내문입니다. (클릭: "~을 클릭하세요", 입력: "~을 검색합니다")
- 보통 현재 페이지의 단계는 1~3개면 충분합니다. 확실한 것만 넣으세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 절대 금지:
{
  "status": "continue",
  "clickSequence": [
    { "action": "type", "selector": "<입력창 셀렉터>", "value": "<검색어>", "text": "<요소 텍스트>", "message": "<안내 메시지>" },
    { "action": "click", "selector": "<CSS 셀렉터>", "text": "<요소 텍스트>", "message": "<안내 메시지>" }
  ]
}
  `.trim();

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${systemPrompt}\n\n사용자 최종 목표: ${userPrompt}\n\n현재 페이지 DOM 요소 목록:\n${JSON.stringify(domStructure, null, 2)}`
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