from bs4 import BeautifulSoup

# crawler.py에서 저장한 page.html 파일 불러오기
with open("page.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

# 예시: 인플루언서 이름 추출 (사이트 구조에 맞게 selector 수정 필요)
names = [tag.text.strip() for tag in soup.select(".influencer-name")]

print("추출된 인플루언서 이름:", names)
