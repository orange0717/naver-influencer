/**
 * ai-consultant-catalog.ts — "N인플 AI" 추천 카탈로그
 *
 * AI 오케스트레이터(첫 화면 챗 입력)가 사용자 질문을 보고 추천할 수 있는
 * 기존 N인플 기능 목록. 여기 있는 기능만 Claude가 추천할 수 있다 —
 * 새 기능을 추가하려면 이 배열에 항목을 추가하면 된다(코드 변경만으로 확장 가능).
 *
 * ⚠️ 실제 실행(analysis)은 하지 않는다. AI는 "어떤 기존 페이지가 도움이 될지"만
 * 판단해서 추천하고, 사용자가 클릭하면 해당 페이지로 이동해 거기서 직접 실행한다.
 * (풀 오케스트레이션 — AI가 결과까지 대신 실행/해석 — 은 다음 단계 확장 후보.
 *  [[naver_influencer_multiplatform_content_analysis_vision]] 참고)
 */

import { MARKETING_SCHOOL_URL } from '@/lib/external-links';

export interface AiConsultantFeature {
  id: string;
  /** Claude에게 보여줄 설명 — 이 기능이 언제 유용한지 */
  toolDescription: string;
  label: string;
  reasonHint: string;
  href: string;
  /** 로그인 필요 여부 — 추천 카드에 "로그인 필요" 뱃지 표시용 */
  authOnly: boolean;
  /** N인플 내부 페이지가 아니라 외부 공식 사이트로 연결되는 항목인지 — 새 탭으로 열어야 한다 */
  external?: boolean;
}

export const AI_CONSULTANT_CATALOG: AiConsultantFeature[] = [
  {
    id: 'missing-posts',
    label: '미노출 분석',
    toolDescription: '작성한 블로그 글이 네이버 검색 결과에 왜 노출되지 않는지 원인을 확인한다. "노출이 안 돼요", "검색에 안 걸려요" 같은 질문에 적합.',
    reasonHint: '검색 결과에서 글이 빠진 원인을 확인합니다',
    href: '/my/missing-posts',
    authOnly: true,
  },
  {
    id: 'keyword-recommend',
    label: '키워드 추천',
    toolDescription: '경쟁도는 낮고 검색량은 있는 블루오션 키워드를 찾는다. "어떤 키워드를 써야 할지 모르겠다", "키워드 찾아줘" 질문에 적합.',
    reasonHint: '경쟁도 낮은 유망 키워드를 찾아드립니다',
    href: '/keywords/recommend',
    authOnly: true,
  },
  {
    id: 'keyword-search',
    label: '키워드 검색',
    toolDescription: '특정 키워드의 검색량·경쟁도·순위를 바로 조회한다. 이미 어떤 키워드를 염두에 두고 있을 때 적합.',
    reasonHint: '키워드의 검색량과 경쟁도를 바로 조회합니다',
    href: '/keywords/blogger',
    authOnly: false,
  },
  {
    id: 'keyword-ranking',
    label: '키워드 순위',
    toolDescription: '저장해둔 내 키워드들의 검색 순위 추이를 추적한다. "내 키워드 순위가 궁금하다", "순위가 올랐는지 확인하고 싶다" 질문에 적합.',
    reasonHint: '저장한 키워드의 순위 변화를 추적합니다',
    href: '/my/keyword-ranking',
    authOnly: true,
  },
  {
    id: 'content-angles',
    label: '글감 찾기',
    toolDescription: '키워드 하나로 사람들이 궁금해하는 질문과 글감 아이디어를 찾는다. "무슨 글을 써야 할지 모르겠다" 질문에 적합.',
    reasonHint: '사람들이 궁금해하는 질문과 글감을 찾아드립니다',
    href: '/dashboard/writing/content-angles',
    authOnly: true,
  },
  {
    id: 'titles',
    label: '제목 생성',
    toolDescription: '글감/키워드로 검색에 유리한 블로그 제목 후보를 생성한다.',
    reasonHint: '검색에 유리한 제목 후보를 만들어드립니다',
    href: '/dashboard/writing/titles',
    authOnly: true,
  },
  // 본문 생성(/dashboard/writing/body)은 2026-08-13 카탈로그에서 비노출 처리.
  // AI가 글 전체를 대필하는 최고원가(ai_body) 기능이라 추천/바로가기에서 내림.
  // 페이지·라우트(9,900 게이트)는 유지 — 직접 링크로는 접근 가능(되돌리려면 이 항목 복원).
  {
    id: 'spellcheck',
    label: '맞춤법 검사',
    toolDescription: '이미 쓴 글의 맞춤법·띄어쓰기를 교정한다.',
    reasonHint: '맞춤법과 띄어쓰기를 교정합니다',
    href: '/dashboard/writing/spellcheck',
    authOnly: true,
  },
  {
    // 교정·교열·윤문(rewrite)·블로그 글 심층피드백(claude 채팅)·AI글 적합도를 하나로 합친
    // 통합 "글 심층피드백"(스펙 4·5). id는 저장된 추천 호환을 위해 'ai-quality' 유지.
    id: 'ai-quality',
    label: '글 심층피드백',
    toolDescription: '내 블로그 글 하나를 한 번에 정밀 분석한다 — 종합 완성도, AI 글 적합도, 인플루언서 글 적합도, 검색 친화성(SEO·GEO/AEO), 정보 구조·가독성·전문성, 장점·문제점·수정 우선순위·개선 방법까지. "내 글 진단해줘", "AI로 써도 되는지", "어떻게 고쳐야 할지", "글 좀 봐줘" 질문에 적합.',
    reasonHint: '글 하나를 종합·AI·인플루언서 적합도까지 한 번에 진단합니다',
    href: '/my/naver-mate/quality-evaluate',
    authOnly: true,
  },
  {
    id: 'ai-briefing',
    label: 'AI 브리핑 · AI 탭',
    toolDescription: '네이버 AI 브리핑/AI 탭 노출 현황을 확인한다.',
    reasonHint: 'AI 브리핑·AI 탭 노출 현황을 확인합니다',
    href: '/my/naver-mate',
    authOnly: true,
  },
  {
    id: 'google-indexing',
    label: 'Google 색인 관리',
    toolDescription: '블로그 글이 구글 검색에 색인됐는지 확인하고 등록을 요청한다. "구글에서 안 나와요" 질문에 적합.',
    reasonHint: '구글 색인 여부를 확인하고 등록을 요청합니다',
    href: '/dashboard/google-indexing',
    authOnly: true,
  },
  {
    id: 'influencer-list',
    label: '인플루언서 랭킹',
    toolDescription: '카테고리별 네이버 인플루언서 순위와 프로필을 탐색한다. 경쟁자·벤치마킹 분석에 적합.',
    reasonHint: '경쟁 인플루언서의 순위와 프로필을 보여줍니다',
    href: '/influencers',
    authOnly: false,
  },
  {
    id: 'topics',
    label: '토픽',
    toolDescription: '내 기존 포스팅을 분석해 어떤 글끼리 하나의 토픽으로 묶으면 좋을지 추천한다. "토픽을 어떻게 잡아야 하나요", "무슨 토픽으로 묶을까" 질문에 적합.',
    reasonHint: '내 포스팅을 묶을 토픽을 추천합니다',
    href: '/topics',
    authOnly: true,
  },
  {
    id: 'keyword-challenge',
    label: '키워드 챌린지',
    toolDescription: '네이버 인플루언서 키워드챌린지 순위를 추적한다.',
    reasonHint: '키워드챌린지 순위를 추적합니다',
    href: '/keywords',
    authOnly: true,
  },
  {
    id: 'youtube-stt',
    label: '유튜브 음원 추출',
    toolDescription: '유튜브 영상에서 음성을 텍스트로 추출한다. 유튜브 콘텐츠를 블로그 글로 옮기고 싶을 때 적합.',
    reasonHint: '유튜브 영상 음성을 텍스트로 옮겨드립니다',
    href: '/dashboard/youtube-stt',
    authOnly: true,
  },
  {
    id: 'color-palette',
    label: '컬러 팔레트',
    toolDescription: '이미지에서 대표 색상 HEX 코드를 추출하고 어울리는 팔레트를 제안한다. "색상 코드 알려줘", "이미지 색깔 뭐야" 질문에 적합.',
    reasonHint: '이미지의 대표 색상과 어울리는 팔레트를 추출합니다',
    href: '/dashboard/writing/color-palette',
    authOnly: false,
  },
  {
    id: 'marketing-school',
    label: '네이버 비즈니스 스쿨',
    toolDescription:
      'N인플에는 자체 강의 콘텐츠가 없다. 특정 분석 도구가 아니라 마케팅/광고/콘텐츠 전반을 기초부터 체계적으로 "배우고" 싶어 하는 경우, 네이버가 직접 운영하는 공식 무료 교육 플랫폼 네이버 비즈니스 스쿨을 안내한다. "마케팅을 어디서 배워야 할지 모르겠다", "기초 강의 추천해달라", "공부하고 싶다" 같은 학습 의도 질문에 적합. 특정 키워드/글 하나에 대한 실행형 질문에는 다른 기능을 우선 추천할 것.',
    reasonHint: '실무 중심 마케팅 교육은 네이버 비즈니스 스쿨에서 확인해보세요',
    href: MARKETING_SCHOOL_URL,
    authOnly: false,
    external: true,
  },
];

export function getFeatureById(id: string): AiConsultantFeature | undefined {
  return AI_CONSULTANT_CATALOG.find((f) => f.id === id);
}
