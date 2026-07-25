export type IndexedUrlStatus = 'pending' | 'submitted' | 'checking' | 'indexed' | 'not_indexed' | 'error';
export type IndexedUrlProgressStage = 'registering' | 'requesting' | 'checking' | 'done';
export type IndexedUrlSource = 'manual' | 'bulk_recent' | 'bulk_all' | 'rss' | 'auto_crawl';

export interface IndexedUrl {
  id: string;
  user_id: string;
  blog_id: string;
  post_no: string;
  url: string;
  title: string | null;
  source: IndexedUrlSource;
  status: IndexedUrlStatus;
  progress_stage: IndexedUrlProgressStage;
  registered_at: string;
  last_checked_at: string | null;
  next_check_at: string | null;
  check_count: number;
  indexed_at: string | null;
  google_verdict: string | null;
  google_coverage_state: string | null;
  failure_reason_code: string | null;
  ai_diagnosis: string | null;
  seo_score: number | null;
  seo_sub_scores: Record<string, number> | null;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface IndexingSummary {
  userId: string;
  todayCount: number;
  weekCount: number;
  successRate: number;
  notIndexedCount: number;
  avgProcessingHours: number | null;
  recent: Pick<IndexedUrl, 'id' | 'url' | 'title' | 'status' | 'registered_at'>[];
}

export const STATUS_LABEL: Record<IndexedUrlStatus, string> = {
  pending: '등록중',
  submitted: '등록요청됨',
  checking: '확인중',
  indexed: '색인완료',
  not_indexed: '미색인',
  error: '오류',
};

export const STATUS_ICON: Record<IndexedUrlStatus, string> = {
  pending: '⚪',
  submitted: '🟡',
  checking: '⚪',
  indexed: '🟢',
  not_indexed: '🔴',
  error: '🔴',
};

export const FAILURE_REASON_LABEL: Record<string, string> = {
  robots_blocked: 'robots.txt에서 크롤링이 차단되어 있어요',
  canonical_issue: '대표 URL(canonical) 지정이 다르게 인식되고 있어요',
  duplicate_content: '비슷한 내용의 다른 글과 중복으로 인식되고 있어요',
  not_found: '페이지를 찾을 수 없어요 (404)',
  noindex: 'noindex 설정으로 색인이 차단되어 있어요',
  meta_issue: '메타 정보에 문제가 있어요',
  thin_internal_links: '내부링크가 부족해요',
  thin_content: '본문 내용이 부족해요',
  crawl_pending: '아직 구글이 크롤링을 기다리고 있어요',
  not_discovered: '구글이 아직 이 페이지를 발견하지 못했어요',
};
