import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CATEGORIES = [
  '맛집', '여행', '뷰티', '패션', 'IT/테크', '육아',
  '인테리어', '건강', '반려동물', '자동차', '부동산',
  '경제/재테크', '교육', '문화/예술', '스포츠', '일상/라이프', '기타',
] as const;

// 카테고리 자동 추천용 키워드 매핑
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '맛집': ['맛집', '카페', '레스토랑', '음식', '요리', '먹방', '빵집', '베이커리', '디저트', '맛있', '식당'],
  '여행': ['여행', '호텔', '숙소', '관광', '해외', '투어', '리조트', '캠핑', '펜션', '항공', '비행기'],
  '뷰티': ['화장품', '스킨케어', '메이크업', '뷰티', '피부', '미용', '헤어', '네일', '향수'],
  '패션': ['패션', '코디', '옷', '스타일', '브랜드', '쇼핑', '의류', '악세서리', '신발', 'OOTD'],
  'IT/테크': ['IT', '프로그래밍', '코딩', '개발', '앱', '소프트웨어', '하드웨어', '노트북', '스마트폰', 'AI', '블로그', '테크'],
  '육아': ['육아', '아기', '유아', '임신', '출산', '어린이', '초등', '교육', '엄마', '아이'],
  '인테리어': ['인테리어', '가구', '리모델링', '홈스타일링', '집꾸미기', '수납', '정리', '이사'],
  '건강': ['건강', '운동', '다이어트', '헬스', '요가', '필라테스', '영양제', '식단', '의료', '병원'],
  '반려동물': ['반려', '강아지', '고양이', '펫', '애완', '동물병원', '사료', '산책'],
  '자동차': ['자동차', '차량', '드라이브', '신차', '중고차', '세차', '튜닝', '전기차'],
  '부동산': ['부동산', '아파트', '매매', '전세', '월세', '분양', '청약', '주택', '토지'],
  '경제/재테크': ['재테크', '투자', '주식', '부업', '경제', '금융', '저축', '펀드', '코인', '연금'],
  '교육': ['교육', '학습', '공부', '시험', '자격증', '학원', '영어', '수학', '대학', '입시'],
  '문화/예술': ['영화', '드라마', '음악', '공연', '전시', '책', '독서', '미술', '사진', '문화'],
  '스포츠': ['축구', '야구', '농구', '골프', '테니스', '등산', '자전거', '수영', '스포츠', '경기'],
  '일상/라이프': ['일상', '라이프', '하루', '기록', '생활', '취미'],
};

/**
 * GET /api/blog/category?blogId=xxx
 * 블로그 포스팅 분석 기반 카테고리 자동 추천
 */
export async function GET(request: NextRequest) {
  const blogId = new URL(request.url).searchParams.get('blogId');
  if (!blogId) return NextResponse.json({ error: 'blogId 필수' }, { status: 400 });

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
