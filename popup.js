// popup.js
console.log("팝업 스크립트 로드됨!"); 
alert("팝업이 실행되었습니다!"); // 이 창이 뜨는지 확인
document.getElementById('runBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('promptInput').value;
  console.log("버튼 클릭됨! 프롬프트:", prompt); // 이게 콘솔에 찍혀야 함
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // content.js를 먼저 강제로 주입
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });

  // 그 다음 메시지 전송
  chrome.tabs.sendMessage(tab.id, { 
    action: "EXTRACT_AND_ANALYZE", 
    prompt: prompt 
  });
});