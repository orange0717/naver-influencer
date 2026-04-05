import crypto from 'crypto';
import { createServiceClient } from './supabase-server';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** SSRF 방지: 허용된 외부 도메인 목록 */
const ALLOWED_EXTERNAL_DOMAINS = [
  'in.naver.com',
  'blog.naver.com',
  'm.blog.naver.com',
  'section.blog.naver.com',
  'search.naver.com',
  'openapi.naver.com',
  'api.naver.com',
  'influencer.naver.com',
  'api.searchad.naver.com',
  'pstatic.net',
];

/** URL이 허용된 외부 도메인인지 검증 */
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_EXTERNAL_DOMAINS.some(
      domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

/** 1초 대기 */
export function sleep(ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 요청 타임아웃 (기본 15초) */
const REQUEST_TIMEOUT_MS = 15_000;

/** User-Agent 포함 fetch + 재시도 + AbortController 타임아웃 + SSRF 방지 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 2,
): Promise<Response> {
  if (!isAllowedUrl(url)) {
    throw new Error(`SSRF blocked: ${new URL(url).hostname} is not in the allowed domain list`);
  }

  const headers = {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://in.naver.com/',
    ...options.headers,
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, headers, signal: controller.signal });
      if (res.ok) return res;
      if (res.status === 429) {
        // 429는 더 긴 대기 (exponential backoff)
        if (attempt < retries) {
          await sleep(4000 * Math.pow(2, attempt));
          continue;
        }
      }
      if (res.status >= 500) {
        if (attempt < retries) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
      }
      throw new Error(`HTTP ${res.status}: ${url}`);
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Failed after ${retries + 1} attempts: ${url}`);
}

/** CRON_SECRET 검증 (timing-safe 비교, 길이 노출 방지) */
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[crawler] CRON_SECRET 환경변수가 설정되지 않았습니다.');
    return false;
  }
  const auth = request.headers.get('authorization') || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!provided) return false;

  // 길이가 달라도 timing-safe하게 비교 (SHA-256 해시 비교)
  const hashProvided = crypto.createHash('sha256').update(provided).digest();
  const hashSecret = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(hashProvided, hashSecret);
}

/** crawl_jobs 생성 */
export async function createCrawlJob(jobType: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('crawl_jobs')
    .insert({ job_type: jobType, status: 'running', started_at: new Date().toISOString() })
    .select('id')
    .single();
  if (error) {
    console.error(`[crawler] createCrawlJob failed for ${jobType}:`, error.message);
    return undefined;
  }
  return data?.id;
}

/** crawl_jobs 업데이트 */
export async function updateCrawlJob(
  jobId: string | undefined,
  update: {
    status: 'success' | 'failed';
    total_items?: number;
    processed_items?: number;
    failed_items?: number;
    error_message?: string;
  },
) {
  if (!jobId) return;
  const supabase = createServiceClient();
  await supabase
    .from('crawl_jobs')
    .update({ ...update, completed_at: new Date().toISOString() })
    .eq('id', jobId);
}
