import { createServiceClient } from './supabase-server';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 1초 대기 */
export function sleep(ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** User-Agent 포함 fetch + 재시도 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 2,
): Promise<Response> {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'ko-KR,ko;q=0.9',
    ...options.headers,
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
      }
      throw new Error(`HTTP ${res.status}: ${url}`);
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error(`Failed after ${retries + 1} attempts: ${url}`);
}

/** CRON_SECRET 검증 */
export function verifyCronSecret(request: Request): boolean {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 개발환경에서는 검증 스킵
  return auth === `Bearer ${secret}`;
}

/** crawl_jobs 생성 */
export async function createCrawlJob(jobType: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('crawl_jobs')
    .insert({ job_type: jobType, status: 'running', started_at: new Date().toISOString() })
    .select('id')
    .single();
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
