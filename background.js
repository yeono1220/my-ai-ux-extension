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
   - 예: 상품이 장바구니에 담김 / 계산 결과·세액이 화면에 표시됨 / 원하는 화면에 도착함
   - 달성됨 → "status":"done", "clickSequence":[]
2) 아직 달성되지 않았다면 → "status":"continue" 와 함께,
   현재 페이지에서 목표에 더 가까워지기 위해 클릭/입력/선택할 요소들을 순서대로.

각 단계(clickSequence 항목)는 세 종류의 action을 가질 수 있습니다:
- 클릭:  { "action":"click",  "selector":..., "text":<요소 텍스트>, "message":<안내> }
- 입력:  { "action":"type",   "selector":<입력칸 셀렉터>, "value":<입력할 값>, "text":..., "message":<안내> }
- 선택:  { "action":"select", "selector":<select 셀렉터>, "value":<선택할 옵션 텍스트>, "text":..., "message":<안내> }

★ 이 도우미는 자동으로 타이핑/선택하지 않습니다. "사용자가 직접 입력·선택하도록 안내"하는 방식입니다.
  (사용자가 값을 다 채우면 자동으로 다음 단계로 넘어갑니다.)

입력/선택이 필요할 때 (매우 중요):
- DOM 목록에서 isTextInput:true 인 폼 필드를 사용하세요. 각 필드에는 label(연결된 라벨, 예 "증여자와의 관계",
  "재산가액")과, select 의 경우 options(선택지 목록)가 함께 제공됩니다. 이 label/options 로 올바른 필드를 고르세요.
- 텍스트/숫자 칸(tag:"input", "textarea") → action:"type".
  · value 에는 넣을 값만. 숫자는 쉼표 없이 (예: 1억 → value:"100000000").
  · message 예: "재산가액 칸에 100000000 을 입력하세요"
- 드롭다운(tag:"select") → action:"select".
  · value 는 options 중 목표에 맞는 옵션 텍스트 그대로 (예: value:"외손주").
  · message 예: "증여자와의 관계에서 '외손주'를 선택하세요"
- 검색의 경우: [type(검색어) → click(검색 버튼)] 순서로.

핵심 규칙:
- 현재 페이지에 실제로 보이는 요소만 사용하세요. 다음 페이지의 요소는 추측하지 마세요.
- 여러 입력이 필요하면 한 번에 여러 type/select 단계를 순서대로 넣고, 마지막에 실행/계산/확인 버튼을 click 으로.
- "가장 싼", "최저가" 같은 조건이면 가격 정렬 버튼을 클릭하거나 가장 저렴한 항목을 선택하세요.
- 숨겨진 메뉴(wasHidden: true) 안에 목적지가 있다면, 그 메뉴를 여는 상위 요소부터 포함하세요.
- selector 는 DOM 요소 목록의 selector 필드를 그대로 사용하세요.
- message 는 짧고 명확한 한국어 안내문입니다.
- 목표가 달성되면(예: 계산 결과/세액이 화면에 표시됨) "status":"done", "clickSequence":[] 로 응답하세요.
- 보통 현재 페이지의 단계는 1~4개면 충분합니다. 확실한 것만 넣으세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 절대 금지:
{
  "status": "continue",
  "clickSequence": [
    { "action": "click",  "selector": "<셀렉터>", "text": "<텍스트>", "message": "<안내>" },
    { "action": "select", "selector": "<select 셀렉터>", "value": "<옵션>", "text": "<텍스트>", "message": "<안내>" },
    { "action": "type",   "selector": "<입력칸 셀렉터>", "value": "<값>", "text": "<텍스트>", "message": "<안내>" }
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