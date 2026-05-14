export type SortField =
  | "api_list_order"
  | "fans"
  | "challenges"
  | "top3_count"
  | "ratio_percent"
  | "rank_1st"
  | "last_challenge_date"
  | "display_name";

export interface InfluencerRow {
  id: number;
  source_id: string;
  display_name: string;
  profile_image_url: string | null;
  category: string | null;
  fans: number;
  subscriber_count: number;
  challenges: number;
  top3_count: number;
  ratio_percent: number | null;
  rank_1st: number;
  rank_2nd: number;
  rank_3rd: number;
  selection_date: string | null;
  last_challenge_date: string | null;
  updated_at: string;
  api_list_order: number | null;
  rank: number;
}

export interface CrawlJob {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  rows_upserted: number;
  message: string | null;
}

export interface CrawlerInfo {
  crawl_use_ninfle_public_api: boolean;
  crawl_api_page_size: number;
  crawl_api_max_pages: number;
  crawl_api_pause_seconds: number;
  crawl_api_429_max_retries: number;
  crawl_api_429_base_sleep_seconds: number;
  crawler_base_url: string;
  crawl_daily_hour: number;
  crawl_daily_minute: number;
  crawl_schedule_timezone: string;
  embed_scheduler_in_api: boolean;
  build_marker?: string;
}

const base = "";

export async function fetchCrawlerInfo(): Promise<CrawlerInfo> {
  const res = await fetch(`${base}/api/meta/crawler-info`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CrawlerInfo>;
}

export async function fetchInfluencers(
  sort: SortField,
  order: "asc" | "desc"
): Promise<InfluencerRow[]> {
  const q = new URLSearchParams({ sort, order, limit: "200", offset: "0" });
  const res = await fetch(`${base}/api/influencers?${q.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchLastCrawl(): Promise<CrawlJob | null> {
  const res = await fetch(`${base}/api/meta/last-crawl`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CrawlJob | null>;
}

export async function triggerCrawl(apiKey?: string | null): Promise<CrawlJob> {
  const headers: Record<string, string> = {};
  const key = (apiKey ?? "").trim();
  if (key) {
    headers["X-API-Key"] = key;
  }
  const res = await fetch(`${base}/api/crawl`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
