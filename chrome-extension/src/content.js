/**
 * N인플 키워드 분석 — Content Script
 * 네이버 검색 페이지에서 검색 키워드의 검색량을 자동으로 표시
 */

const API_BASE = 'https://naver-influencer.vercel.app';
const BADGE_ID = 'ninfl-search-badge';

// 이미 삽입된 배지가 있으면 제거
function removeBadge() {
  const existing = document.getElementById(BADGE_ID);
  if (existing) existing.remove();
}

// 현재 검색 키워드 추출
function getSearchKeyword() {
  const params = new URLSearchParams(window.location.search);
  return params.get('query') || params.get('q') || '';
}

// 검색량 API 호출
async function fetchVolume(keyword) {
  try {
    const res = await fetch(`${API_BASE}/api/search-volume?keyword=${encodeURIComponent(keyword)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.keywords || data.keywords.length === 0) return null;

    // 입력한 키워드와 정확히 매칭되는 결과 찾기
    const exact = data.keywords.find(
      k => (k.keyword || k.relKeyword || '').toLowerCase() === keyword.toLowerCase()
    );
    const result = exact || data.keywords[0];

    const pc = parseVol(result.monthlyPcQcCnt || result.monthlyPc);
    const mobile = parseVol(result.monthlyMobileQcCnt || result.monthlyMobile);
    const total = pc + mobile;
    const competition = result.competition || getCompLevel(result.compIdx);

    return { keyword: result.keyword || result.relKeyword, pc, mobile, total, competition };
  } catch {
    return null;
  }
}

function parseVol(v) {
  if (v === '< 10' || v == null) return 5;
  return typeof v === 'number' ? v : parseInt(v, 10) || 0;
}

function getCompLevel(idx) {
  if (!idx) return '낮음';
  const v = String(idx).toLowerCase();
  if (v === 'high') return '높음';
  if (v === 'medium') return '중간';
  return '낮음';
}

function formatNum(n) {
  if (n >= 10000) return Math.round(n / 10000) + '만';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// 검색결과 페이지에 배지 삽입
function insertBadge(data) {
  removeBadge();

  const compColors = {
    '낮음': { bg: '#ECFDF5', color: '#059669' },
    '중간': { bg: '#FFF7ED', color: '#D97706' },
    '높음': { bg: '#FEF2F2', color: '#DC2626' },
  };

  const comp = compColors[data.competition] || compColors['낮음'];
  const pcRatio = data.total > 0 ? Math.round((data.pc / data.total) * 100) : 50;

  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: #fff;
      border: 1px solid #F0DED8;
      border-radius: 16px;
      padding: 14px 18px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif;
      width: 280px;
      transition: all 0.3s ease;
      cursor: pointer;
    " id="ninfl-badge-inner">
      <!-- 헤더 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="background:#FF6B35;color:#fff;font-size:10px;font-weight:900;padding:3px 7px;border-radius:6px;">N인플</span>
          <span style="font-size:12px;font-weight:800;color:#1F2937;">${escapeHtml(data.keyword)}</span>
        </div>
        <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;background:${comp.bg};color:${comp.color};">${data.competition}</span>
      </div>
      <!-- 숫자 -->
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <div style="flex:1;text-align:center;padding:8px;background:#FFF8F5;border-radius:10px;">
          <div style="font-size:18px;font-weight:900;color:#FF6B35;">${formatNum(data.total)}</div>
          <div style="font-size:9px;color:#9B8A82;margin-top:2px;">총 검색량</div>
        </div>
        <div style="flex:1;text-align:center;padding:8px;background:#EFF6FF;border-radius:10px;">
          <div style="font-size:14px;font-weight:800;color:#3B82F6;">${formatNum(data.pc)}</div>
          <div style="font-size:9px;color:#9B8A82;margin-top:2px;">PC</div>
        </div>
        <div style="flex:1;text-align:center;padding:8px;background:#F5F3FF;border-radius:10px;">
          <div style="font-size:14px;font-weight:800;color:#8B5CF6;">${formatNum(data.mobile)}</div>
          <div style="font-size:9px;color:#9B8A82;margin-top:2px;">모바일</div>
        </div>
      </div>
      <!-- 비율 바 -->
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:9px;color:#3B82F6;width:30px;">PC ${pcRatio}%</span>
        <div style="flex:1;height:4px;background:#F0DED8;border-radius:2px;overflow:hidden;display:flex;">
          <div style="width:${pcRatio}%;height:100%;background:#3B82F6;"></div>
          <div style="width:${100 - pcRatio}%;height:100%;background:#8B5CF6;"></div>
        </div>
        <span style="font-size:9px;color:#8B5CF6;width:40px;text-align:right;">M ${100 - pcRatio}%</span>
      </div>
      <!-- 닫기 -->
      <div style="text-align:center;margin-top:8px;">
        <span id="ninfl-close" style="font-size:10px;color:#C4B0A8;cursor:pointer;">닫기 ✕</span>
      </div>
    </div>
  `;

  document.body.appendChild(badge);

  // 닫기 버튼
  document.getElementById('ninfl-close').addEventListener('click', (e) => {
    e.stopPropagation();
    removeBadge();
  });

  // 클릭하면 상세 페이지로
  document.getElementById('ninfl-badge-inner').addEventListener('click', () => {
    window.open(`${API_BASE}/search-volume?q=${encodeURIComponent(data.keyword)}`, '_blank');
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 메인 실행
async function main() {
  const keyword = getSearchKeyword();
  if (!keyword) return;

  const data = await fetchVolume(keyword);
  if (data) {
    insertBadge(data);
  }
}

// 페이지 로드 시 실행
main();

// SPA 네비게이션 감지 (네이버 검색은 SPA가 아니지만 만약을 위해)
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(main, 500);
  }
});
observer.observe(document.body, { childList: true, subtree: true });
