import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CrawlJob,
  CrawlerInfo,
  fetchCrawlerInfo,
  fetchInfluencers,
  fetchLastCrawl,
  InfluencerRow,
  SortField,
  triggerCrawl,
} from "./api";

const SORT_TABS: { key: SortField; label: string }[] = [
  { key: "api_list_order", label: "N인플 순위" },
  { key: "fans", label: "통합 팔로워" },
  { key: "challenges", label: "키워드 챌린지" },
  { key: "top3_count", label: "키워드 TOP3" },
  { key: "ratio_percent", label: "비율" },
  { key: "rank_1st", label: "키워드 1위" },
  { key: "last_challenge_date", label: "최근 챌린지" },
  { key: "display_name", label: "이름" },
];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ko-KR");
}

function formatNumber(n: number) {
  return n.toLocaleString("ko-KR");
}

const STORAGE_KEY = "naver_influencer_crawl_api_key";

export default function App() {
  const [sort, setSort] = useState<SortField>("api_list_order");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [rows, setRows] = useState<InfluencerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastJob, setLastJob] = useState<CrawlJob | null>(null);
  const [crawlerInfo, setCrawlerInfo] = useState<CrawlerInfo | null>(null);
  const [crawlBusy, setCrawlBusy] = useState(false);
  const [crawlApiKey, setCrawlApiKey] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, job, info] = await Promise.all([
        fetchInfluencers(sort, order),
        fetchLastCrawl(),
        fetchCrawlerInfo(),
      ]);
      setRows(data);
      setLastJob(job);
      setCrawlerInfo(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sort, order]);

  useEffect(() => {
    void load();
  }, [load]);

  const crawlerLine = useMemo(() => {
    if (!crawlerInfo) return null;
    const h = String(crawlerInfo.crawl_daily_hour).padStart(2, "0");
    const m = String(crawlerInfo.crawl_daily_minute).padStart(2, "0");
    return `API 크롤 설정: 매일 ${h}:${m} (${crawlerInfo.crawl_schedule_timezone}) · 요청 간격 ${crawlerInfo.crawl_api_pause_seconds}s · 429 재시도 ${crawlerInfo.crawl_api_429_max_retries}회 · embed=${String(crawlerInfo.embed_scheduler_in_api)} · ${crawlerInfo.build_marker ?? "—"}`;
  }, [crawlerInfo]);

  const statusLine = useMemo(() => {
    if (!lastJob) return "아직 크롤 기록이 없습니다.";
    const end = lastJob.completed_at
      ? new Date(lastJob.completed_at).toLocaleString("ko-KR")
      : "진행 중";
    return `마지막 작업: ${lastJob.status} · ${end} · ${lastJob.rows_upserted}행`;
  }, [lastJob]);

  async function onManualCrawl() {
    setCrawlBusy(true);
    setError(null);
    try {
      await triggerCrawl(crawlApiKey.trim() || undefined);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCrawlBusy(false);
    }
  }

  return (
    <div className="layout">
      <header className="header">
        <div className="brand">N-Influencer 랭킹</div>
        <div className="header-actions">
          <label className="key-field">
            <span className="key-label">크롤 키</span>
            <input
              className="key-input"
              type="password"
              autoComplete="off"
              placeholder="API_TRIGGER_TOKEN (선택)"
              value={crawlApiKey}
              onChange={(e) => {
                const v = e.target.value;
                setCrawlApiKey(v);
                try {
                  sessionStorage.setItem(STORAGE_KEY, v);
                } catch {
                  /* ignore */
                }
              }}
            />
          </label>
          <button type="button" className="btn ghost" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
          <button type="button" className="btn" onClick={() => void onManualCrawl()} disabled={crawlBusy}>
            {crawlBusy ? "크롤 중…" : "지금 크롤"}
          </button>
        </div>
      </header>

      <section className="toolbar">
        <div className="tabs">
          {SORT_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tab ${sort === t.key ? "active" : ""}`}
              onClick={() => {
                setSort(t.key);
                setOrder(t.key === "api_list_order" ? "asc" : "desc");
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
        >
          정렬: {order === "desc" ? "내림차순" : "오름차순"}
        </button>
      </section>

      <p className="meta">{statusLine}</p>
      {crawlerLine ? <p className="meta secondary">{crawlerLine}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>#</th>
              <th>인플루언서</th>
              <th>카테고리</th>
              <th>통합 팔로워</th>
              <th>네이버 이웃</th>
              <th>키워드 챌린지</th>
              <th>키워드 TOP3</th>
              <th>비율</th>
              <th>키워드 1위</th>
              <th>키워드 2위</th>
              <th>키워드 3위</th>
              <th>선정일</th>
              <th>최근 챌린지</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={14} className="muted">
                  불러오는 중…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="muted">
                  데이터가 없습니다. 백엔드를 띄운 뒤 &quot;지금 크롤&quot;을 실행하세요.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.rank}</td>
                  <td className="influencer">
                    {r.profile_image_url ? (
                      <img src={r.profile_image_url} alt="" className="avatar" loading="lazy" />
                    ) : (
                      <div className="avatar placeholder" />
                    )}
                    <div>
                      <div className="name">{r.display_name}</div>
                      <div className="handle">{r.source_id}</div>
                    </div>
                  </td>
                  <td>{r.category ?? "—"}</td>
                  <td>{formatNumber(r.fans)}</td>
                  <td>{formatNumber(r.subscriber_count)}</td>
                  <td>{formatNumber(r.challenges)}</td>
                  <td>{formatNumber(r.top3_count)}</td>
                  <td>{r.ratio_percent != null ? `${r.ratio_percent}%` : "—"}</td>
                  <td>{formatNumber(r.rank_1st)}</td>
                  <td>{formatNumber(r.rank_2nd)}</td>
                  <td>{formatNumber(r.rank_3rd)}</td>
                  <td>{formatDate(r.selection_date)}</td>
                  <td>{formatDate(r.last_challenge_date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
