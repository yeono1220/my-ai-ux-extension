import json
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

def get_dom_structure(url):
    # 1. 크롬 드라이버 설정
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')  # 화면 없이 실행 (속도 향상)
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

    try:
        driver.get(url)
        driver.implicitly_wait(5) # 로딩 대기

        # 2. 모든 요소(Element) 가져오기
        elements = driver.find_elements(By.XPATH, "//*")
        dom_data = []

        for el in elements:
            try:
                # 가이드에 꼭 필요한 정보만 추출
                tag_name = el.tag_name
                # 버튼이나 링크 등 클릭 가능한 요소 위주로 필터링 가능
                if tag_name in ['button', 'a', 'input', 'select']:
                    dom_data.append({
                        "tag": tag_name,
                        "id": el.get_attribute("id"),
                        "class": el.get_attribute("class"),
                        "text": el.text.strip(),
                        "location": el.location, # {'x': 100, 'y': 200}
                        "size": el.size,         # {'width': 50, 'height': 30}
                    })
            except:
                continue

        # 3. JSON 파일로 저장
        with open('dom_structure.json', 'w', encoding='utf-8') as f:
            json.dump(dom_data, f, ensure_ascii=False, indent=4)
        
        print(f"성공! {len(dom_data)}개의 요소를 추출했습니다.")

    finally:
        driver.quit()

# 실행
get_dom_structure("https://www.naver.com") # 테스트하고 싶은 URL 입력