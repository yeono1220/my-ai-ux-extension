// options.js

// 페이지 로드 시 저장된 키 불러오기
chrome.storage.local.get(['GEMINI_API_KEY'], (result) => {
  if (result.GEMINI_API_KEY) {
    document.getElementById('apiKey').value = result.GEMINI_API_KEY;
  }
});

// 저장 버튼
document.getElementById('saveBtn').addEventListener('click', () => {
  const key = document.getElementById('apiKey').value.trim();
  if (!key) {
    document.getElementById('status').innerText = '❌ API 키를 입력하세요.';
    return;
  }

  // ✅ background.js와 동일한 키 이름 'GEMINI_API_KEY' 사용
  chrome.storage.local.set({ GEMINI_API_KEY: key }, () => {
    document.getElementById('status').innerText = '✅ 저장되었습니다!';
    setTimeout(() => { document.getElementById('status').innerText = ''; }, 2000);
  });
});
