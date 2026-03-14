/**
 * N인플 키워드 분석 크롬 확장앱 — 팝업 스크립트
 */

const API_BASE = 'https://naver-influencer.vercel.app';
const MAX_KEYWORDS = 5;

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultArea = document.getElementById('resultArea');

// 엔터키 검색
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSearch();
  }
});

// 버튼 클릭 검색
searchBtn.addEventListener('click', handleSearch);

async function handleSearch() {
  const raw = searchInput.value.trim();
  if (!raw) return;

  // 쉼표로 분리하여 여러 키워드 지원
  const keywords = raw
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0)
    .slice(0, MAX_KEYWORDS);

  if (keywords.length === 0) return;

  // 로딩 표시
  searchBtn.disabled = true;
  resultArea.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div class="loading-text">${keywords.length}개 키워드 분석 중...</div>
    </div>
  `;

  try {
    // 각 키워드에 대해 검색량 조회
    const results = await Promise.all(
      keywords.map(kw => fetchSearchVolume(kw))
    );

    renderResults(keywords, results);
  } catch (err) {
    resultArea.innerHTML = `
      <div class="error">
        <p>검색 중 오류가 발생했습니다.</p>
        <p style="font-size:10px;margin-top:4px;color:#9B8A82">${err.message}</p>
      </div>
    `;
  } finally {
    searchBtn.disabled = false;
  }
}

async function fetchSearchVolume(keyword) {
  const url = `${API_BASE}/api/search-volume?keyword=${encodeURIComponent(keyword)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`API 오류 (${res.status})`);

  const data = await res.json();
  return data;
}

function renderResults(searchedKeywords, allResults) {
  // 검색한 키워드와 관련 키워드 모두 수집
  const allKeywords = [];

  allResults.forEach((data, idx) => {
    const mainKeyword = searchedKeywords[idx];

    if (data.keywords && data.keywords.length > 0) {
      // 검색한 키워드를 먼저, 나머지는 뒤에
      const mainResult = data.keywords.find(
        k => k.keyword === mainKeyword || k.relKeyword === mainKeyword
      );
      const others = data.keywords.filter(
        k => k.keyword !== mainKeyword && k.relKeyword !== mainKeyword
      );

      if (mainResult) {
        allKeywords.push({ ...normalizeKeyword(mainResult), isMain: true, searchedFor: mainKeyword });
      } else if (data.keywords.length > 0) {
        // 정확히 일치하지 않으면 첫 번째 결과 사용
        allKeywords.push({ ...normalizeKeyword(data.keywords[0]), isMain: true, searchedFor: mainKeyword });
      }

      // 연관 키워드 (상위 3개만)
      others.slice(0, 3).forEach(k => {
        allKeywords.push({ ...normalizeKeyword(k), isMain: false, searchedFor: mainKeyword });
      });
    }
  });

  if (allKeywords.length === 0) {
    resultArea.innerHTML = `
      <div class="empty">
        <div class="empty-icon">😢</div>
        <h3>검색 결과가 없습니다</h3>
        <p>다른 키워드로 검색해보세요</p>
      </div>
    `;
    return;
  }

  const mainCount = allKeywords.filter(k => k.isMain).length;
  const relCount = allKeywords.filter(k => !k.isMain).length;

  let html = `
    <div class="results-summary">
      검색 키워드 <strong>${mainCount}개</strong>
      ${relCount > 0 ? ` + 연관 키워드 <strong>${relCount}개</strong>` : ''}
    </div>
    <div class="results">
  `;

  allKeywords.forEach(kw => {
    html += renderKeywordCard(kw);
  });

  html += '</div>';
  resultArea.innerHTML = html;
}

function normalizeKeyword(raw) {
  const keyword = raw.keyword || raw.relKeyword || '';
  const pc = parseVolume(raw.monthlyPcQcCnt || raw.monthlyPc);
  const mobile = parseVolume(raw.monthlyMobileQcCnt || raw.monthlyMobile);
  const total = pc + mobile;
  const competition = raw.competition || getCompLevel(raw.compIdx);

  return { keyword, pc, mobile, total, competition };
}

function parseVolume(val) {
  if (val === '< 10' || val === '< 10' || val === undefined || val === null) return 5;
  return typeof val === 'number' ? val : parseInt(val, 10) || 0;
}

function getCompLevel(compIdx) {
  if (!compIdx) return '낮음';
  const val = typeof compIdx === 'string' ? compIdx.toLowerCase() : '';
  if (val === 'high') return '높음';
  if (val === 'medium') return '중간';
  return '낮음';
}

function renderKeywordCard(kw) {
  const { keyword, pc, mobile, total, competition, isMain } = kw;

  const compClass = competition === '높음' ? 'high' : competition === '중간' ? 'medium' : 'low';
  const compLabel = competition;
  const pcRatio = total > 0 ? Math.round((pc / total) * 100) : 50;
  const mobileRatio = 100 - pcRatio;

  const opacity = isMain ? '' : 'style="opacity:0.75"';
  const prefix = isMain ? '' : '<span style="font-size:10px;color:#9B8A82;font-weight:400">연관 </span>';

  return `
    <div class="keyword-card" ${opacity}>
      <div class="kw-header">
        <span class="kw-name">${prefix}${escapeHtml(keyword)}</span>
        <span class="kw-badge ${compClass}">${compLabel}</span>
      </div>
      <div class="kw-stats">
        <div class="kw-stat">
          <div class="kw-stat-value">${formatNumber(total)}</div>
          <div class="kw-stat-label">월간 총 검색량</div>
        </div>
        <div class="kw-stat">
          <div class="kw-stat-value pc">${formatNumber(pc)}</div>
          <div class="kw-stat-label">PC</div>
        </div>
        <div class="kw-stat">
          <div class="kw-stat-value mobile">${formatNumber(mobile)}</div>
          <div class="kw-stat-label">모바일</div>
        </div>
      </div>
      <div class="kw-ratio">
        <div class="ratio-bar">
          <div class="ratio-pc" style="width:${pcRatio}%"></div>
          <div class="ratio-mobile" style="width:${mobileRatio}%"></div>
        </div>
      </div>
      <div class="ratio-labels">
        <span style="color:#3B82F6">PC ${pcRatio}%</span>
        <span style="color:#8B5CF6">모바일 ${mobileRatio}%</span>
      </div>
    </div>
  `;
}

function formatNumber(n) {
  if (n >= 10000) return Math.round(n / 10000) + '만';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
