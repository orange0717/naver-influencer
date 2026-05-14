from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://ninfle.kr/")
    page.wait_for_timeout(3000)  # JS 로딩 대기
    html = page.content()

    # HTML 저장 → parser.py에서 불러오기
    with open("page.html", "w", encoding="utf-8") as f:
        f.write(html)

    print(html[:500])  # HTML 일부 출력 → 크롤링 성공 여부 확인
    browser.close()
