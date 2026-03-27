// options.js

// options.js
document.getElementById('saveBtn').addEventListener('click', () => {
  const key = document.getElementById('apiKeyInput').value;
  chrome.storage.local.set({ gemini_api_key: key }, () => {
    alert('API 키가 안전하게 저장되었습니다.');
  });
});

// 페이지 로드 시 기존 키가 있다면 보여주기
chrome.storage.local.get(["GEMINI_API_KEY"], (result) => {
  if (result.GEMINI_API_KEY) {
    document.getElementById('apiKey').value = result.GEMINI_API_KEY;
  }
});