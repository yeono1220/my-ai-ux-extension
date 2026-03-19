document.getElementById('runBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('promptInput').value;
  
  // 현재 활성화된 탭에 명령 전달
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (p) => { 
        // content.js에 정의된 함수 실행
        window.autoClickByAI(p); 
    },
    args: [prompt]
  });
});