// popup.js
document.getElementById('runBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('promptInput').value;
  
  // 현재 활성화된 탭에 명령 전달
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // content.js에 'EXTRACT_AND_ANALYZE' 액션 메시지 전송
  chrome.tabs.sendMessage(tab.id, { 
    action: "EXTRACT_AND_ANALYZE", 
    prompt: prompt 
  });
});