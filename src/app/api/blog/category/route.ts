import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { assertBlogResourceAccess } from '@/lib/blog-access';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// 네이버 공식 블로그 주제 분류
const CATEGORIES = [
  '문학·책', '영화', '미술·디자인', '공연·전시', '음악', '드라마', '스타·연예인', '만화·애니', '방송',
  '일상·생각', '육아·결혼', '반려동물', '좋은글·이미지', '패션·미용', '인테리어·DIY', '요리·레시피', '상품리뷰', '원예·재배',
  '게임', '스포츠', '사진', '자동차', '취미', '국내여행', '세계여행', '맛집',
  'IT·컴퓨터', '사회·정치', '건강·의학', '비즈니스·경제', '어학·외국어', '교육·학문',
  '주제선택안함',
] as const;

// 카테고리 자동 추천용 키워드 매핑
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '문학·책': ['책', '독서', '문학', '소설', '시', '에세이', '서평', '작가', '출판', '도서', '명언', '글귀', '명대사'],
  '영화': ['영화', '시네마', '극장', '관람', '감독', '배우', '개봉', '넷플릭스', '디즈니'],
  '미술·디자인': ['미술', '디자인', '그림', '일러스트', '캘리그래피', '전시', '아트'],
  '공연·전시': ['공연', '전시', '뮤지컬', '연극', '콘서트', '오페라', '페스티벌'],
  '음악': ['음악', '노래', '가수', '앨범', '콘서트', '악기', '피아노', '기타'],
  '드라마': ['드라마', '시청률', '방영', '출연', 'tvN', 'SBS', 'KBS', 'MBC'],
  '스타·연예인': ['연예인', '아이돌', '배우', '가수', '셀럽', '팬', '컴백'],
  '만화·애니': ['만화', '애니', '웹툰', '애니메이션', '코믹스'],
  '방송': ['방송', '예능', '프로그램', '유튜브', 'TV', '채널'],
  '일상·생각': ['일상', '생각', '하루', '기록', '라이프', '생활', '다이어리'],
  '육아·결혼': ['육아', '아기', '유아', '임신', '출산', '결혼', '웨딩', '엄마', '아이'],
  '반려동물': ['반려', '강아지', '고양이', '펫', '애완', '동물병원', '사료', '산책'],
  '좋은글·이미지': ['좋은글', '명언', '글귀', '감성', '힐링', '위로', '동기부여', '자기계발'],
  '패션·미용': ['패션', '뷰티', '코디', '옷', '화장품', '스킨케어', '메이크업', '헤어', '네일', '향수'],
  '인테리어·DIY': ['인테리어', '가구', 'DIY', '리모델링', '홈스타일링', '집꾸미기', '수납'],
  '요리·레시피': ['요리', '레시피', '음식', '베이킹', '홈쿡', '밑반찬', '식단'],
  '상품리뷰': ['리뷰', '언박싱', '체험', '제품', '구매', '쇼핑', '가전'],
  '원예·재배': ['원예', '식물', '화분', '정원', '텃밭', '재배', '꽃'],
  '게임': ['게임', '롤', '배그', '스팀', 'PC게임', '모바일게임', '플스', '닌텐도'],
  '스포츠': ['축구', '야구', '농구', '골프', '테니스', '등산', '자전거', '수영', '스포츠', '헬스'],
  '사진': ['사진', '촬영', '카메라', 'DSLR', '풍경', '인물사진', '포토'],
  '자동차': ['자동차', '차량', '드라이브', '신차', '중고차', '세차', '튜닝', '전기차'],
  '취미': ['취미', '공예', '수집', '낚시', '캠핑', '등산'],
  '국내여행': ['국내여행', '서울', '부산', '제주', '강원', '경주', '전주', '여행', '펜션', '호텔'],
  '세계여행': ['해외여행', '유럽', '일본', '동남아', '미국', '태국', '베트남', '여행'],
  '맛집': ['맛집', '카페', '레스토랑', '먹방', '빵집', '베이커리', '디저트', '맛있', '식당'],
  'IT·컴퓨터': ['IT', '프로그래밍', '코딩', '개발', '컴퓨터', '소프트웨어', '노트북', '스마트폰', 'AI', '테크'],
  '사회·정치': ['사회', '정치', '시사', '뉴스', '경제', '부동산', '법률'],
  '건강·의학': ['건강', '운동', '다이어트', '의학', '병원', '영양제', '요가', '필라테스'],
  '비즈니스·경제': ['비즈니스', '경제', '재테크', '투자', '주식', '부동산', '창업', '마케팅', '금융'],
  '어학·외국어': ['영어', '일본어', '중국어', '외국어', '토익', '토플', '어학', '회화'],
  '교육·학문': ['교육', '학습', '공부', '시험', '자격증', '학원', '대학', '입시', '과학'],
};

/**
 * GET /api/blog/category?blogId=xxx
 * 블로그 포스팅 분석 기반 카테고리 자동 추천
 */
export async function GET(request: NextRequest) {
  const blogId = new URL(request.url).searchParams.get('blogId');
  if (!blogId) return NextResponse.json({ error: 'blogId 필수' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  // 현재 저장된 카테고리 조회
  const { data: scoreData } = await supabase
    .from('blog_scores')
    .select('category')
    .eq('blog_id', blogId)
    .single();

  // 블로그 키워드에서 카테고리 추천
  const { data: keywords } = await supabase
    .from('blog_keywords')
    .select('keyword')
    .eq('blog_id', blogId)
    .eq('is_active', true)
    .limit(30);

  let suggested = '기타';
  if (keywords && keywords.length > 0) {
    const kwTexts = keywords.map(k => k.keyword.toLowerCase());
    const scores: Record<string, number> = {};

    for (const [cat, catKeywords] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0;
      for (const kw of kwTexts) {
        for (const ck of catKeywords) {
          if (kw.includes(ck) || ck.includes(kw)) {
            score++;
          }
        }
      }
      if (score > 0) scores[cat] = score;
    }

    const topCat = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    if (topCat) suggested = topCat[0];
  }

  return NextResponse.json({
    current: scoreData?.category || '기타',
    suggested,
    categories: CATEGORIES,
  });
}

/**
 * POST /api/blog/category
 * 카테고리 저장
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { blogId, category } = await request.json();
  if (!blogId || !category) {
    return NextResponse.json({ error: 'blogId, category 필수' }, { status: 400 });
  }

  const denied = await assertBlogResourceAccess(request, String(blogId));
  if (denied) return denied;

  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: '유효하지 않은 카테고리' }, { status: 400 });
  }

  const { error } = await supabase
    .from('blog_scores')
    .upsert({
      blog_id: blogId,
      category,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'blog_id' });

  if (error) {
    return NextResponse.json({ error: '카테고리 저장 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true, category });
}
