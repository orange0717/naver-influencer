import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 이미지 HEAD 요청 허용 도메인 (SSRF 방지)
const ALLOWED_IMAGE_HOSTS = [
  'postfiles.pstatic.net',
  'blogfiles.pstatic.net',
  'mblogthumb-phinf.pstatic.net',
  'blogpfthumb-phinf.pstatic.net',
  'storep-phinf.pstatic.net',
  'pup-review-phinf.pstatic.net',
  'ssl.pstatic.net',
  'img.naver.net',
];

export interface ImageAnalysis {
  url: string;
  /** 파일 크기 (bytes) */
  size: number;
  /** 원본 사진 여부 (100KB 이상 = 직접 촬영 가능성 높음) */
  isOriginal: boolean;
  /** Naver CDN 업로드 여부 */
  isNaverUpload: boolean;
}

export interface PostAnalysis {
  postId: string;
  title: string;
  /** 본문 글자 수 (공백 제외) */
  charCount: number;
  /** 본문 단어 수 */
  wordCount: number;
  /** 이미지 수 */
  imageCount: number;
  /** 동영상 수 */
  videoCount: number;
  /** 문단 수 */
  paragraphCount: number;
  /** 링크 수 (외부 참조) */
  linkCount: number;
  /** 소제목(h2,h3,strong 등) 수 */
  headingCount: number;
  /** 지도/장소 임베드 수 */
  mapCount: number;
  /** 1인칭 대명사 수 (나/저/우리 등) → 경험 지표 */
  personalPronounCount: number;
  /** 고유 단어 비율 (0~1) → 독창성 지표 */
  uniqueWordRatio: number;
  /** 리스트 항목 수 → 구조화/심층성 */
  listItemCount: number;
  /** 인용문/블록인용 수 → 신뢰성 */
  quotationCount: number;
  /** 표/테이블 수 → 심층성 */
  tableCount: number;
  /** 본문에서 추출한 텍스트 미리보기 (200자) */
  textPreview: string;
  /** 본문 전체 정규화 텍스트 — 키워드밀도/엔티티 등 점수 계산용(2026-07-17 추가, UI 노출 안 함) */
  fullText: string;
  /** 이미지 분석 결과 */
  images: ImageAnalysis[];
  /** 원본 사진 수 (100KB 이상 큰 파일) */
  originalImageCount: number;
  /** 평균 이미지 크기 (KB) */
  avgImageSizeKB: number;
  /** 내부 링크 수 (blog.naver.com으로 향하는 링크) — AI 점수 산정용(2026-07-17 추가) */
  internalLinkCount: number;
  /** 외부 링크 URL 목록 — 출처 활용 판별(공식/뉴스/정부 도메인 여부)용(2026-07-17 추가) */
  externalLinkUrls: string[];
  /** FAQ 구조 감지 여부(자주 묻는 질문/FAQ/Q&A 패턴) — AEO 점수용(2026-07-17 추가) */
  faqDetected: boolean;
  /** 분석 성공 여부 */
  success: boolean;
}

export interface BlogAnalysisResult {
  blogId: string;
  analyzedCount: number;
  totalPosts: number;
  posts: PostAnalysis[];
  /** 블로그 전체 평균 */
  averages: {
    charCount: number;
    wordCount: number;
    imageCount: number;
    videoCount: number;
    paragraphCount: number;
    linkCount: number;
    headingCount: number;
    personalPronounCount: number;
    uniqueWordRatio: number;
    listItemCount: number;
    quotationCount: number;
  };
  /** 점수 계산용 지표 */
  metrics: {
    /** 경험: 이미지가 많은 글 비율 (3장 이상) */
    postsWithImages: number;
    /** 심층성: 1000자 이상 글 비율 */
    longPosts: number;
    /** 가독성: 소제목이 있는 글 비율 */
    postsWithHeadings: number;
    /** 독창성: 평균 글자 수 (긴 글 = 독자적 콘텐츠) */
    avgCharCount: number;
    /** 경험: 동영상/지도 포함 글 비율 */
    postsWithMedia: number;
    /** 경험: 원본 사진(100KB+) 비율 — 직접 촬영 증거 */
    originalImageRatio: number;
    /** 경험: 평균 이미지 크기 (KB) */
    avgImageSizeKB: number;
    /** 경험: 원본 사진이 있는 글 비율 */
    postsWithOriginalImages: number;
    /** 경험: 1인칭 대명사 평균 비율 — 직접 경험 증거 */
    avgPersonalPronounRatio: number;
    /** 독창성: 고유 단어 비율 평균 */
    avgUniqueWordRatio: number;
    /** 가독성: 리스트 사용 글 비율 */
    postsWithLists: number;
    /** 신뢰성: 인용문 있는 글 비율 */
    postsWithQuotations: number;
  };
}

/**
 * 네이버 블로그 글 본문을 가져와서 구조를 분석합니다.
 * PostView.naver URL에서 본문 HTML을 추출합니다.
 * 원래 src/app/api/blog/analyze/route.ts에 있던 analyzePost()를 그대로 옮긴 것 —
 * 포스팅 분석(/my/post-analysis) 페이지와 AI 브리핑 대시보드 점수 산정이 이 함수를 공유한다.
 */
export async function analyzePost(blogId: string, logNo: string): Promise<PostAnalysis> {
  const result: PostAnalysis = {
    postId: logNo,
    title: '',
    charCount: 0,
    wordCount: 0,
    imageCount: 0,
    videoCount: 0,
    paragraphCount: 0,
    linkCount: 0,
    headingCount: 0,
    mapCount: 0,
    personalPronounCount: 0,
    uniqueWordRatio: 0,
    listItemCount: 0,
    quotationCount: 0,
    tableCount: 0,
    textPreview: '',
    fullText: '',
    images: [],
    originalImageCount: 0,
    avgImageSizeKB: 0,
    internalLinkCount: 0,
    externalLinkUrls: [],
    faqDetected: false,
    success: false,
  };

  try {
    // PostView.naver로 직접 접근하면 iframe 없이 본문 HTML을 받을 수 있음
    const url = `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${logNo}&directAccess=false`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        'Referer': `https://blog.naver.com/${blogId}`,
      },
    });

    if (!res.ok) return result;

    const html = await res.text();
    if (html.length < 200) return result;

    const $ = cheerio.load(html);

    // 제목 추출
    result.title = $('meta[property="og:title"]').attr('content')?.trim()
      || $('.se-title-text').text().trim()
      || $('title').text().replace(/\s*[-:]\s*네이버\s*블로그.*/, '').trim()
      || '';

    // ── 본문 영역 찾기 ──
    // 네이버 스마트에디터 3 (SE3) 구조
    const contentSelectors = [
      '.se-main-container',       // SE3 메인 컨테이너
      '#postViewArea',             // 구형 에디터
      '.post-view',                // 대체
      '#viewTypeSelector',         // 폴백
    ];

    let $content: cheerio.Cheerio<any> | null = null;
    for (const sel of contentSelectors) {
      const found = $(sel);
      if (found.length > 0 && found.text().trim().length > 10) {
        $content = found;
        break;
      }
    }

    if (!$content) {
      // 최후의 수단: body에서 네비게이션/헤더/푸터 제외
      $content = $('body');
    }

    // ── 텍스트 분석 ──
    // 스크립트, 스타일 제거
    $content.find('script, style, noscript').remove();

    const textContent = $content.text()
      .replace(/\s+/g, ' ')
      .trim();

    // 글자 수 (공백 제외)
    result.charCount = textContent.replace(/\s/g, '').length;
    // 단어 수 (한국어: 띄어쓰기 기준)
    result.wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
    // 텍스트 미리보기
    result.textPreview = textContent.substring(0, 200);
    result.fullText = textContent;

    // ── 이미지 분석 (URL 추출 + HEAD 요청으로 크기 확인) ──
    const images = $content.find('img');
    const imageUrls: string[] = [];
    images.each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-lazy-src') || $(el).attr('data-src') || '';
      if (!src) return;
      // 실제 콘텐츠 이미지만 (아이콘, UI 요소 제외)
      const isContentImage = src.includes('postfiles') || src.includes('blogfiles') ||
        src.includes('pstatic.net/upload') || src.includes('mblogthumb') ||
        (src.includes('naver') && /\.(jpg|jpeg|png|webp|gif)/i.test(src));
      if (isContentImage && !imageUrls.includes(src)) {
        imageUrls.push(src);
      }
    });
    // SE3 이미지 리소스도 추가
    $content.find('.se-image-resource').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-lazy-src') || '';
      if (src && !imageUrls.includes(src)) imageUrls.push(src);
    });

    result.imageCount = imageUrls.length;

    // HEAD 요청으로 이미지 파일 크기 확인 (최대 5개만 — 속도 제한)
    const imageAnalyses: ImageAnalysis[] = [];
    const imagesToCheck = imageUrls.slice(0, 5);
    for (const imgUrl of imagesToCheck) {
      try {
        const fullUrl = imgUrl.startsWith('//') ? `https:${imgUrl}` : imgUrl;

        // SSRF 방지: 허용된 Naver CDN 도메인만 HEAD 요청
        const urlObj = new URL(fullUrl);
        const isAllowedHost = ALLOWED_IMAGE_HOSTS.some(h => urlObj.hostname === h || urlObj.hostname.endsWith(`.${h}`));

        if (!isAllowedHost) {
          imageAnalyses.push({
            url: imgUrl, size: 0,
            isOriginal: false,
            isNaverUpload: false,
          });
          continue;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const headRes = await fetch(fullUrl, {
          method: 'HEAD',
          headers: { 'User-Agent': USER_AGENT },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);
        const isNaverUpload = imgUrl.includes('postfiles') || imgUrl.includes('blogfiles');
        // 100KB 이상 = 직접 촬영한 원본 사진 가능성 높음
        const isOriginal = contentLength >= 100 * 1024;
        imageAnalyses.push({ url: imgUrl, size: contentLength, isOriginal, isNaverUpload });
      } catch {
        // HEAD 요청 실패 시 Naver CDN 여부만으로 판단
        imageAnalyses.push({
          url: imgUrl, size: 0,
          isOriginal: imgUrl.includes('postfiles'), // postfiles = 직접 업로드
          isNaverUpload: imgUrl.includes('postfiles') || imgUrl.includes('blogfiles'),
        });
      }
    }
    result.images = imageAnalyses;
    result.originalImageCount = imageAnalyses.filter(i => i.isOriginal).length;
    const totalImgSize = imageAnalyses.reduce((s, i) => s + i.size, 0);
    result.avgImageSizeKB = imageAnalyses.length > 0
      ? Math.round(totalImgSize / imageAnalyses.length / 1024) : 0;

    // ── 동영상 분석 ──
    const videoSelectors = [
      'iframe[src*="tv.naver"]',
      'iframe[src*="youtube"]',
      'iframe[src*="youtu.be"]',
      '.se-video',
      '.se-oglink-video',
      '[id*="NAVER_OBJECT_EMBED"]',
      'video',
    ];
    result.videoCount = videoSelectors.reduce((count, sel) => count + $content!.find(sel).length, 0);

    // ── 문단 분석 ──
    // SE3: .se-text-paragraph
    const se3Paragraphs = $content.find('.se-text-paragraph').length;
    if (se3Paragraphs > 0) {
      result.paragraphCount = se3Paragraphs;
    } else {
      // 구형: p 태그 또는 br 기준
      const pTags = $content.find('p').filter((_, el) => $(el).text().trim().length > 5).length;
      const brCount = ($content.html()?.match(/<br\s*\/?>/gi) || []).length;
      result.paragraphCount = Math.max(pTags, Math.ceil(brCount / 2));
    }

    // ── 소제목/강조 분석 ──
    const headingSelectors = [
      '.se-section-title',         // SE3 소제목
      'h2', 'h3', 'h4',
      'strong:not(.se-text-paragraph strong)', // 단독 strong (문단 내 bold 제외)
    ];
    let headingCount = 0;
    for (const sel of headingSelectors) {
      $content.find(sel).each((_, el) => {
        const text = $(el).text().trim();
        if (text.length >= 2 && text.length <= 50) headingCount++;
      });
    }
    // SE3 헤더 컴포넌트도 카운트
    headingCount += $content.find('.se-component-header, .se-section-title').length;
    result.headingCount = Math.max(headingCount, $content.find('.se-section-title, .se-quotation').length);

    // ── 링크 분석 (외부/내부 구분) ──
    const links = $content.find('a[href]');
    let externalLinkCount = 0;
    let internalLinkCount = 0;
    const externalLinkUrls: string[] = [];
    links.each((_, el) => {
      const href = $(el).attr('href') || '';
      if (!href.startsWith('http')) return;
      if (href.includes('blog.naver.com')) {
        internalLinkCount++;
      } else {
        externalLinkCount++;
        if (!externalLinkUrls.includes(href)) externalLinkUrls.push(href);
      }
    });
    result.linkCount = externalLinkCount;
    result.internalLinkCount = internalLinkCount;
    result.externalLinkUrls = externalLinkUrls;

    // ── 지도/장소 분석 ──
    const mapSelectors = [
      '.se-map',
      '.se-placemap',
      'iframe[src*="map.naver"]',
      'iframe[src*="maps.google"]',
      '.se-section-oglink', // OG 링크 카드
    ];
    result.mapCount = mapSelectors.reduce((count, sel) => count + $content!.find(sel).length, 0);

    // ── 1인칭 대명사 분석 (경험 지표) ──
    // 직접 경험을 서술할 때 자주 사용하는 표현 감지
    const personalPronouns = /나는|내가|나의|저는|제가|저의|우리는|우리가|우리의|제 |내 |나도|저도|직접|다녀|방문|먹어|사용해|써봤|체험|경험했|가봤|해봤|느꼈/g;
    const pronounMatches = textContent.match(personalPronouns);
    result.personalPronounCount = pronounMatches ? pronounMatches.length : 0;

    // ── 고유 단어 비율 (독창성 지표) ──
    // 복사/짜깁기한 글은 고유 단어 비율이 낮고, 직접 작성한 글은 높음
    const allWords = textContent.split(/\s+/).filter(w => w.length > 1);
    const uniqueWords = new Set(allWords);
    result.uniqueWordRatio = allWords.length > 10
      ? Math.round(uniqueWords.size / allWords.length * 100) / 100 : 0;

    // ── 리스트 항목 분석 (구조화/심층성) ──
    result.listItemCount = $content.find('li, .se-list-item, .se-list, ol > *, ul > *').length;

    // ── 인용문 분석 (신뢰성) ──
    result.quotationCount = $content.find('blockquote, .se-quotation, .se-cite, .se-section-quotation').length;

    // ── 테이블/표 분석 (심층성) ──
    result.tableCount = $content.find('table, .se-table, .se-section-table').length;

    // ── FAQ 구조 감지 (AEO 점수용) ──
    // 소제목/문단에 "자주 묻는 질문", "FAQ", "Q&A", "Q1." 등의 질답 패턴이 있는지 확인
    const faqPattern = /자주\s*묻는\s*질문|FAQ|Q\s*&\s*A|Q\d*\s*[.:]/i;
    result.faqDetected = faqPattern.test(textContent);

    result.success = true;

  } catch {
    // 분석 실패 — 결과 그대로 반환
  }

  return result;
}
