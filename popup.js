document.getElementById('runBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('promptInput').value;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // content.js에 분석 요청 메시지 전송
  chrome.tabs.sendMessage(tab.id, { 
    action: "EXTRACT_AND_ANALYZE", 
    prompt: prompt 
  });
});