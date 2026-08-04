/**
 * AI 자연어 인플루언서 검색 — 규칙 기반 파서
 */

export interface InfluencerSearchFilters {
  category?: string;
  keyword_text?: string;
  min_subscriber_count?: number;
  min_fan_count?: number;
  min_total_keywords?: number;
  min_top3_count?: number;
  sort_by?: 'subscriber_count' | 'fan_count' | 'total_keywords' | 'integrated_top3_count' | 'top3_ratio' | 'top1_count' | 'last_crawled_at' | 'first_seen_at';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  recency_days?: number;
  ranking_top_n?: number;
}

// 실제 DB/API 카테고리명에 맞춤
const CATEGORIES = [
  '여행', '패션', '뷰티', '푸드', 'IT테크', '자동차', '리빙', '육아',
  '생활건강', '게임', '동물/펫', '운동/레저', '프로스포츠', '방송/연예',
  '대중음악', '영화', '공연/전시/예술', '도서', '경제/비즈니스', '어학/교육',
] as const;

// 카테고리 별칭 매핑 (자연어 표현 → 실제 DB 카테고리명)
// 파워콘텐츠 키워드리스트 중분류 + 자연어 표현 통합
const CATEGORY_ALIASES: Record<string, string> = {
  // 뷰티 (파워콘텐츠: 미용)
  '뷰티': '뷰티', '화장품': '뷰티', '메이크업': '뷰티', '스킨케어': '뷰티', '미용': '뷰티',
  '미용케어': '뷰티', '뷰티리뷰': '뷰티', '화장품리뷰': '뷰티',
  // 도서
  '도서': '도서', '책': '도서', '독서': '도서', '도서리뷰': '도서', '북리뷰': '도서', '서평': '도서',
  '책리뷰': '도서', '독후감': '도서', '책추천': '도서', '신간': '도서',
  // 여행 (파워콘텐츠: 여행)
  '여행': '여행', '관광': '여행', '해외여행': '여행', '국내여행': '여행', '호텔': '여행', '호캉스': '여행',
  '항공': '여행', '렌터카': '여행', '여행사': '여행', '리조트': '여행', '펜션': '여행',
  '숙박시설': '여행', '게스트하우스': '여행', '에어비앤비': '여행', '민박': '여행',
  // 푸드 (파워콘텐츠: 식품/음료)
  '맛집': '푸드', '음식': '푸드', '먹방': '푸드', '레스토랑': '푸드', '푸드': '푸드', '요리': '푸드',
  '레시피': '푸드', '베이킹': '푸드', '식당': '푸드', '출장요리': '푸드', '식품': '푸드',
  '음료': '푸드', '카페': '푸드', '디저트': '푸드', '프랜차이즈': '푸드',
  // 동물/펫 (파워콘텐츠: 가정/생활 > 애완동물)
  '동물': '동물/펫', '반려동물': '동물/펫', '펫': '동물/펫', '강아지': '동물/펫', '고양이': '동물/펫',
  '애완동물': '동물/펫',
  // 어학/교육 (파워콘텐츠: 교육/취업)
  '어학': '어학/교육', '외국어': '어학/교육', '영어': '어학/교육', '일본어': '어학/교육', '교육': '어학/교육',
  '학원': '어학/교육', '과외': '어학/교육', '학습지': '어학/교육', '홈스터디': '어학/교육',
  '국비지원': '어학/교육', '평생교육': '어학/교육', '유학': '어학/교육', '취업': '어학/교육',
  '고시학원': '어학/교육', '수능': '어학/교육', '입시': '어학/교육', '운전학원': '어학/교육',
  '컴퓨터학원': '어학/교육', '미용학원': '어학/교육', '승무원학원': '어학/교육',
  '요리학원': '어학/교육', '제과제빵': '어학/교육', '디자인학원': '어학/교육',
  '간호학원': '어학/교육', '세무학원': '어학/교육', '회계학원': '어학/교육',
  '연기학원': '어학/교육', '방송학원': '어학/교육', '경매학원': '어학/교육',
  // 공연/전시/예술
  '공연': '공연/전시/예술', '전시': '공연/전시/예술', '예술': '공연/전시/예술',
  // 경제/비즈니스 (파워콘텐츠: 금융/보험, 전문서비스, 인쇄/문구/사무기기)
  '경제': '경제/비즈니스', '비즈니스': '경제/비즈니스', '재테크': '경제/비즈니스',
  '부동산': '경제/비즈니스', '주식': '경제/비즈니스', '금융': '경제/비즈니스',
  '건축': '경제/비즈니스', '시공': '경제/비즈니스', '설비': '경제/비즈니스',
  '광고': '경제/비즈니스', '홍보': '경제/비즈니스', '금융컨설팅': '경제/비즈니스',
  '대출': '경제/비즈니스', '번역': '경제/비즈니스', '통역': '경제/비즈니스',
  '법률': '경제/비즈니스', '보험': '경제/비즈니스', '인쇄소': '경제/비즈니스',
  '저축': '경제/비즈니스', '연금': '경제/비즈니스', '증권': '경제/비즈니스',
  '창업': '경제/비즈니스', '산업기기': '경제/비즈니스', '판촉용품': '경제/비즈니스',
  // 패션 (파워콘텐츠: 의류/패션잡화)
  '패션': '패션', '옷': '패션', '의류': '패션', '잡화': '패션', '쇼핑몰': '패션', '명품': '패션',
  '브랜드': '패션', '주얼리': '패션', '패션잡화': '패션', '특수의류': '패션',
  // 생활건강 (파워콘텐츠: 의료)
  '생활건강': '생활건강', '건강': '생활건강', '다이어트': '생활건강', '영양제': '생활건강',
  '병원': '생활건강', '치과': '생활건강', '한의원': '생활건강',
  '내과': '생활건강', '이비인후과': '생활건강', '노인병원': '생활건강', '요양원': '생활건강',
  '비뇨기과': '생활건강', '산부인과': '생활건강', '성형외과': '생활건강', '피부과': '생활건강',
  '안과': '생활건강', '외과': '생활건강', '의료기기': '생활건강', '정신건강의학과': '생활건강',
  // 리빙 (파워콘텐츠: 가정/생활, 꽃/이벤트)
  '인테리어': '리빙', '리빙': '리빙', '집꾸미기': '리빙',
  '가구': '리빙', '생활용품': '리빙', '세탁': '리빙', '청소': '리빙',
  '렌탈서비스': '리빙', '인테리어소품': '리빙', '이사': '리빙',
  '장례': '리빙', '상조': '리빙', '이벤트': '리빙', '스튜디오': '리빙', '운세': '리빙',
  '사주': '리빙', '작명': '리빙',
  // 육아 (파워콘텐츠: 결혼/출산/육아)
  '육아': '육아', '아기': '육아', '임신': '육아', '출산': '육아', '유아용품': '육아',
  '키즈카페': '육아', '장난감': '육아', '유아동용품': '육아', '웨딩': '육아', '웨딩서비스': '육아',
  // 게임
  '게임': '게임',
  // IT테크 (파워콘텐츠: IT/텔레콤, 전자/가전)
  'it테크': 'IT테크', '컴퓨터': 'IT테크', '테크': 'IT테크', '프로그래밍': 'IT테크',
  '생활가전': 'IT테크', '웹호스팅': 'IT테크', '사이트제작': 'IT테크', '중고가전': 'IT테크',
  '주변기기': 'IT테크', '통신서비스': 'IT테크', '솔루션': 'IT테크',
  'it수리': 'IT테크', 'it시스템': 'IT테크',
  // 운동/레저 (파워콘텐츠: 레저스포츠/취미)
  '운동': '운동/레저', '레저': '운동/레저', '헬스': '운동/레저', '필라테스': '운동/레저',
  '요가': '운동/레저', '등산': '운동/레저', '캠핑': '운동/레저', '낚시': '운동/레저',
  '강습': '운동/레저',
  // 프로스포츠
  '스포츠': '프로스포츠', '프로스포츠': '프로스포츠', '축구': '프로스포츠', '야구': '프로스포츠', '골프': '프로스포츠',
  // 자동차 (파워콘텐츠: 자동차)
  '자동차': '자동차', '차': '자동차', '드라이브': '자동차', '수입차': '자동차', '전기차': '자동차',
  '중고차': '자동차', '자동차용품': '자동차', '리스': '자동차',
  // 대중음악
  '음악': '대중음악', '대중음악': '대중음악', '노래': '대중음악',
  // 영화
  '영화': '영화', '드라마': '영화', '넷플릭스': '영화',
  // 방송/연예
  '방송': '방송/연예', '연예': '방송/연예', '엔터테인먼트': '방송/연예',
};

// 세부 주제 키워드 (광고주 업종 + 인플루언서 전문 분야 매칭용)
// 긴 키워드를 먼저 매칭하도록 길이 내림차순 정렬
const TOPIC_KEYWORDS = [
  // 여행 (파워콘텐츠: 국내여행, 해외여행, 숙박시설)
  '해외여행', '국내여행', '호캉스', '호텔', '항공', '렌터카', '여행사', '리조트', '펜션',
  '게스트하우스', '에어비앤비', '숙박시설', '민박',
  // 뷰티 (파워콘텐츠: 미용케어, 화장품)
  '스킨케어', '메이크업', '색조화장', '기초화장', '화장품', '피부과', '네일', '헤어', '향수',
  '성형', '에스테틱', '미용케어',
  // 푸드 (파워콘텐츠: 식당/출장요리, 식품/음료판매)
  '맛집', '카페', '베이킹', '요리', '디저트', '레스토랑', '배달', '프랜차이즈',
  '건강식품', '다이어트식품', '와인', '맥주', '커피', '식당', '출장요리', '식품', '음료',
  // 패션 (파워콘텐츠: 일반의류, 전문/특수의류, 패션잡화)
  '쇼핑몰', '명품', '브랜드', '주얼리', '시계', '가방', '신발', '스트릿',
  '패션잡화', '특수의류',
  // 육아 (파워콘텐츠: 웨딩서비스/컨설팅, 출산/유아동용품, 출산/육아관련서비스)
  '유아용품', '키즈카페', '장난감', '분유', '기저귀', '아기옷', '임신', '출산', '육아',
  '유아동용품', '웨딩서비스', '웨딩',
  // 자동차 (파워콘텐츠: 렌터카, 자동차용품/서비스, 중고차, 판매/리스)
  '수입차', '전기차', '타이어', '세차', '카시트', '중고차', '튜닝',
  '자동차용품', '리스',
  // 생활건강 (파워콘텐츠: 내과/이비인후과, 노인병원/요양원, 비뇨기과, 산부인과, 성형외과/피부과, 안과, 외과, 의료기기, 정신건강의학과, 치과, 한의원)
  '다이어트', '영양제', '운동기구', '병원', '치과', '한의원', '약국', '건강검진',
  '내과', '이비인후과', '노인병원', '요양원', '비뇨기과', '산부인과', '성형외과',
  '안과', '외과', '의료기기', '정신건강의학과',
  // 리빙 (파워콘텐츠: 가구/기타, 렌탈서비스, 생활서비스, 생활용품, 세탁/청소, 스튜디오/사진, 애완동물, 운세/사주/작명, 이벤트, 이사, 인테리어, 인테리어소품, 장례/상조)
  '인테리어', '집꾸미기', '가구', '가전', '침구', '수납', '조명', '이사',
  '렌탈서비스', '생활용품', '세탁', '청소', '인테리어소품',
  '장례', '상조', '스튜디오',
  // IT테크 (파워콘텐츠: IT수리/관리서비스, IT시스템/솔루션, 생활가전, 웹호스팅/사이트제작, 중고가전, 컴퓨터/주변기기, 통신서비스판매/홍보)
  '스마트폰', '노트북', '태블릿', '가젯', '앱', '소프트웨어',
  '생활가전', '웹호스팅', '사이트제작', '중고가전', '주변기기', '통신서비스', '솔루션',
  // 동물/펫
  '강아지', '고양이', '사료', '간식', '동물병원', '펫시터', '펫용품', '애완동물',
  // 운동/레저 (파워콘텐츠: 강습/프로그램, 용품판매/임대)
  '필라테스', '헬스', '요가', '수영', '스키', '자전거', '러닝', '등산', '캠핑', '낚시', '골프',
  // 경제/비즈니스 (파워콘텐츠: 건축/시공/설비, 광고/홍보, 금융컨설팅, 대출/맞춤, 판촉용품제작/판매, 번역/통역, 법률, 보험, 부동산, 산업기기, 인쇄소, 저축/연금, 증권, 창업)
  '부동산', '주식', '재테크', '보험', '대출', '창업',
  '건축', '시공', '설비', '금융컨설팅', '번역', '통역', '법률',
  '인쇄소', '저축', '연금', '증권', '산업기기', '판촉용품',
  // 어학/교육 (파워콘텐츠: 간호학원, 건축/인테리어학원, 고시학원, 과외/학습지/홈스터디, 국비지원/평생교육, 미술/디자인학원, 미용학원, 부동산/경매학원, 세무/회계학원, 수능/입시학원, 승무원학원, 어학, 연기/방송학원, 요리/제과제빵/음료학원, 운전학원, 유학, 취업, 컴퓨터학원)
  '영어학원', '온라인강의', '자격증', '입시', '과외', '학습지', '홈스터디',
  '국비지원', '평생교육', '유학', '고시학원', '수능', '운전학원',
  '컴퓨터학원', '미용학원', '승무원학원', '제과제빵', '디자인학원',
  '간호학원', '세무학원', '회계학원', '연기학원', '방송학원', '경매학원',
].sort((a, b) => b.length - a.length); // 긴 키워드 우선 매칭

/**
 * 자연어 쿼리를 구조화된 필터로 변환하는 규칙 기반 파서
 */
export function parseQueryToFilters(query: string): InfluencerSearchFilters {
  const filters: InfluencerSearchFilters = {};
  const q = query.toLowerCase();

  // ── 카테고리 감지 (긴 별칭 우선, 앞쪽 경계만 체크) ──
  // 한국어 조사(를, 을, 에, 의 등)가 뒤에 붙으므로 뒤쪽 경계는 체크하지 않음
  const sortedAliases = Object.entries(CATEGORY_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, category] of sortedAliases) {
    const lower = alias.toLowerCase();
    const idx = q.indexOf(lower);
    if (idx === -1) continue;
    const before = idx === 0 ? ' ' : q[idx - 1];
    if (before === ' ') {
      filters.category = category;
      break;
    }
  }

  // ── 키워드 텍스트 감지 (토픽 키워드, 앞쪽 경계만 체크) ──
  for (const topic of TOPIC_KEYWORDS) {
    const lower = topic.toLowerCase();
    const idx = q.indexOf(lower);
    if (idx === -1) continue;
    const before = idx === 0 ? ' ' : q[idx - 1];
    if (before === ' ') {
      filters.keyword_text = topic;
      break;
    }
  }

  // ── 숫자 파싱 ──
  // "상위 N명" / "탑 N" / "TOP N" → TOP3 비율 기준으로 상위 N명 표시
  const topNMatch = q.match(/(?:상위|탑|top)\s*(\d+)\s*(?:명|위|개)?/i);
  if (topNMatch) {
    filters.limit = parseInt(topNMatch[1]);
    if (!filters.sort_by) {
      filters.sort_by = 'top3_ratio';
      filters.sort_order = 'desc';
    }
  }

  // "N명" (단독 사용 시 limit)
  if (!filters.limit) {
    const limitMatch = q.match(/(\d+)\s*명/);
    if (limitMatch) {
      filters.limit = parseInt(limitMatch[1]);
    }
  }

  // "팬수 1만명 이상" / "팬 1만명 이상" / "구독자 5천명 이상" / "팔로워 1k 이상"
  const fanMatch = q.match(/(?:팬수?|구독자수?|팔로워)\s*(\d+)\s*(만|천|k)?\s*(?:명)?\s*이상/i);
  if (fanMatch) {
    let num = parseInt(fanMatch[1]);
    if (fanMatch[2] === '만') num *= 10000;
    else if (fanMatch[2] === '천' || fanMatch[2]?.toLowerCase() === 'k') num *= 1000;
    if (q.includes('팬')) filters.min_fan_count = num;
    else filters.min_subscriber_count = num;
  }

  // "키워드 N개 이상" / "키챌 N건 이상" / "챌린지 N개 이상"
  const kwCountMatch = q.match(/(?:키워드|키챌|챌린지)\s*(\d+)\s*(?:개|건)?\s*이상/);
  if (kwCountMatch) {
    filters.min_total_keywords = parseInt(kwCountMatch[1]);
  }

  // "TOP3 N회 이상"
  const top3Match = q.match(/(?:top\s*3|탑3)\s*(\d+)\s*(?:회|번)?\s*이상/i);
  if (top3Match) {
    filters.min_top3_count = parseInt(top3Match[1]);
  }

  // ── 정렬 감지 ──
  if (q.includes('top3 비율') || q.includes('탑3 비율') || q.includes('top3비율')) {
    filters.sort_by = 'top3_ratio';
    filters.sort_order = 'desc';
  } else if (q.includes('구독자') && (q.includes('많은') || q.includes('높은') || q.includes('순'))) {
    filters.sort_by = 'subscriber_count';
    filters.sort_order = 'desc';
  } else if (q.includes('팬') && (q.includes('많은') || q.includes('높은') || q.includes('순'))) {
    filters.sort_by = 'fan_count';
    filters.sort_order = 'desc';
  } else if (q.includes('1위') || q.includes('1등')) {
    filters.sort_by = 'top1_count';
    filters.sort_order = 'desc';
  } else if (q.includes('신규') || q.includes('새로') || q.includes('최근 선정') || q.includes('새로운')) {
    filters.sort_by = 'first_seen_at';
    filters.sort_order = 'desc';
  } else if (q.includes('키워드') && (q.includes('많은') || q.includes('많이'))) {
    filters.sort_by = 'total_keywords';
    filters.sort_order = 'desc';
  }

  // ── 최근 활동 감지 ──
  if (q.includes('꾸준히') || q.includes('꾸준한') || q.includes('활발') || q.includes('활동') || q.includes('포스팅')) {
    filters.recency_days = filters.recency_days || 30;
  }
  if (q.includes('최근')) {
    const recentMatch = q.match(/최근\s*(\d+)\s*(?:일|개월)/);
    if (recentMatch) {
      const num = parseInt(recentMatch[1]);
      filters.recency_days = q.includes('개월') ? num * 30 : num;
    } else {
      filters.recency_days = filters.recency_days || 30;
    }
  }

  // ── keyword_text가 있으면 카테고리 필터 제거 (너무 좁아짐) ──
  // "부동산"은 경제·비즈니스로 매핑되지만, 실제로는 keyword_text로 검색하는 게 적합
  if (filters.keyword_text && filters.category) {
    delete filters.category;
  }

  // ── 기본값 ──
  if (!filters.limit) filters.limit = 10;
  if (!filters.sort_by) filters.sort_by = 'integrated_top3_count';
  if (!filters.sort_order) filters.sort_order = 'desc';

  return filters;
}

// ── 파워콘텐츠 95K 키워드 매칭 (서버사이드 전용) ──

// 키워드 → 카테고리 역방향 맵 (lazy 초기화)
let _keywordMap: Map<string, string> | null = null;

function getKeywordMap(): Map<string, string> {
  if (_keywordMap) return _keywordMap;
  try {
    // 서버사이드에서만 JSON 로드 (2.3MB)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require('./power-content-keywords.json') as Record<string, string[]>;
    _keywordMap = new Map();
    for (const [cat, keywords] of Object.entries(data)) {
      for (const kw of keywords) {
        _keywordMap.set(kw.toLowerCase(), cat);
      }
    }
    return _keywordMap;
  } catch {
    _keywordMap = new Map();
    return _keywordMap;
  }
}

/**
 * 파워콘텐츠 95,168개 키워드에서 쿼리와 매칭되는 키워드 찾기
 * 서버사이드 전용 (JSON 파일 로드)
 *
 * 방식: 쿼리에서 불용어를 제거한 후, 남은 토큰 조합(3어절→2어절→1어절)을
 * 파워콘텐츠 키워드 맵에서 O(1) 룩업
 */
export function matchPowerContentKeyword(query: string): { keyword: string; category: string } | null {
  const map = getKeywordMap();
  if (map.size === 0) return null;

  const q = query.toLowerCase().trim();

  // 불용어 (검색 의도 표현, 파서에서 이미 처리하는 단어들)
  const stopwords = new Set([
    '인플루언서', '블로거', '유튜버', '크리에이터', '찾아줘', '찾아주세요',
    '추천', '추천해줘', '추천해주세요', '알려줘', '알려주세요', '보여줘', '보여주세요',
    '관련', '분야', '전문', '카테고리', '검색', '팬수', '구독자', '팔로워',
    '이상', '이하', '많은', '높은', '순', '명', '만', '천', '상위', '탑', 'top',
    '최근', '활발', '활동', '꾸준히', '신규', '새로운',
  ]);

  // 토큰화 (공백 분리)
  const tokens = q.split(/\s+/).filter(t => t.length >= 2 && !stopwords.has(t));

  // 긴 조합부터 매칭 시도 (3어절 → 2어절 → 1어절)
  for (let len = Math.min(tokens.length, 3); len >= 1; len--) {
    for (let i = 0; i <= tokens.length - len; i++) {
      const phrase = tokens.slice(i, i + len).join('');
      const cat = map.get(phrase);
      if (cat) {
        // 원본 키워드 (대소문자 보존을 위해 맵에서 다시 찾기)
        return { keyword: phrase, category: cat };
      }
    }
  }

  // 공백 없이 전체 쿼리에서도 시도 (e.g., "프로폴리스인플루언서" → "프로폴리스" 추출)
  const cleanQ = tokens.join('');
  if (cleanQ.length >= 2) {
    const cat = map.get(cleanQ);
    if (cat) return { keyword: cleanQ, category: cat };
  }

  return null;
}
