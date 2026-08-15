# 분석 화면 공용 컴포넌트

키워드 순위(`/my/keyword-ranking`) · AI 브리핑(`/my/naver-mate`) · 노출 현황이 **같은 골격, 같은 토큰**을 쓰도록 모아둔 레이어입니다.

## 골격

```
DashboardLayout                 ← 토큰 스코프(.analytics-scope) + 세로 리듬 + 폭
├── PageHeader                  ← 제목 · 설명 · 우측 Primary CTA · ⋯ 메뉴 · 안내문
├── MetricCardGrid              ← 5열 지표 카드(상태 아이콘 · 값 · 추이)
├── FilterControlBar            ← 기간 / 상태 탭 / 검색 / 정렬 통합 제어 바
└── DataTable                   ← Sticky Header · Loading · Empty 를 갖춘 표
    └── Pagination (footer)
```

## 최소 사용 예

```tsx
'use client';

import {
  DashboardLayout,
  FilterControlBar,
  DataTable,
  StatusBadge,
  Pagination,
  type MetricCardItem,
  type DataTableColumn,
} from '@/components/analytics';

const metrics: MetricCardItem[] = [
  { key: 'total', label: '전체 포스팅', value: 128, tone: 'accent' },
  { key: 'cited', label: 'AI 인용', value: 42, tone: 'success', trend: { direction: 'up', value: 5 } },
  { key: 'partial', label: '일부 인용', value: 11, tone: 'warning' },
  { key: 'not_cited', label: '미인용', value: 63, tone: 'danger' },
  { key: 'unchecked', label: '미확인', value: 12, tone: 'neutral' },
];

const columns: DataTableColumn<Post>[] = [
  { key: 'title', header: '포스팅 제목', cell: p => <a href={p.url}>{p.title}</a> },
  { key: 'date', header: '작성일', align: 'right', width: 'w-24', divider: true, cell: p => p.date },
  { key: 'status', header: '상태', align: 'center', width: 'w-24', cell: p => <StatusBadge tone="success" label="인용" /> },
];

export default function Page() {
  return (
    <DashboardLayout
      title="AI 브리핑 · AI 탭"
      description="대표키워드로 네이버 AI 브리핑·AI 탭 인용 여부를 확인합니다."
      primaryAction={{ label: '전체 업데이트', onClick: startBulk, disabled: posts.length === 0 }}
      metrics={metrics}
      cardsLoading={loading}
      width="wide"
      filters={
        <FilterControlBar
          period={{ period, onPeriod: setPeriod, customFrom, customTo, onCustomFrom: setCustomFrom,
                    onCustomTo: setCustomTo, usingCustomRange, onResetCustom: resetCustom }}
          status={{ options: STATUS_OPTIONS, value: statusFilter, onChange: setStatusFilter }}
          search={{ value: query, onChange: setQuery }}
          sort={{ value: sortBy, onChange: setSortBy, options: SORT_OPTIONS }}
          meta={`최근 업데이트: ${timeAgo(lastUpdated)}`}
        />
      }
      tableCount={`${rows.length.toLocaleString()}개`}
      tableLoading={loading}
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={p => p.id}
        loading={loading}
        maxHeight="70vh"
        minWidth="1200px"
        empty={{ title: '표시할 포스팅이 없습니다.', description: '기간·상태 필터를 바꿔보세요.' }}
        footer={<Pagination page={page} totalPages={totalPages} onChange={setPage} numbers />}
      />
    </DashboardLayout>
  );
}
```

> `DashboardLayout` 이 이미 표 껍데기(`AnalyticsTableShell`: 제목 + 건수 헤더)를 그리므로,
> 그 안에 넣는 `DataTable` 에는 `title` 을 주지 않습니다. 껍데기 없이 표만 필요한 곳에서는
> `DataTable` 에 `title` 을 주면 스스로 껍데기를 그립니다.

## 디자인 토큰

`analytics-tokens.css` 의 `.analytics-scope` 안에서만 유효한 `--a-*` 변수 레이어입니다.
`DashboardLayout` 이 스코프를 열어주므로 화면 쪽에서 따로 할 일은 없습니다.

| 역할 | 변수 | 값 |
| --- | --- | --- |
| Primary/Accent | `--a-accent` / `--a-accent-hover` | `#D86B56` / `#C25C48` |
| Canvas | `--a-canvas` | `#F9F7F5` |
| Card/Table | `--a-surface` | `#FFFFFF` |
| Border | `--a-border` | `#EBEBEB` |
| Success | `--a-success-bg` / `--a-success-fg` | `#E6F4EA` / `#137333` |
| Warning | `--a-warning-bg` / `--a-warning-fg` | `#FEF7E0` / `#B06000` |
| Danger | `--a-danger-bg` / `--a-danger-fg` | `#FCE8E6` / `#C5221F` |
| Neutral | `--a-neutral-bg` / `--a-neutral-fg` | `#F1F3F4` / `#5F6368` |

- 컴포넌트는 hex 를 직접 쓰지 않고 항상 `var(--a-*)` 를 참조합니다. 팔레트를 바꿀 곳은 css 파일 한 곳입니다.
- **앱 전역 팔레트(`--color-accent: #B0796B` 계열)와는 다른 값**입니다. 전역과 맞추려면
  `analytics-tokens.css` 의 `--a-accent` 등을 `var(--color-accent)` 로 바꾸면 다른 파일은 손대지 않아도 됩니다.
- 배경은 기본적으로 앱 캔버스를 그대로 둡니다. 스펙 캔버스까지 칠하려면 `paintCanvas` 를 켭니다.

## 상태 톤

`success · warning · danger · neutral · accent · info` 6개만 씁니다.
`StatusBadge tone=` / `MetricCardItem.tone` / `TONE_TEXT_CLASS` 가 모두 같은 토큰을 참조하므로,
같은 상태는 어느 화면에서든 같은 색으로 보입니다.

```tsx
<StatusBadge tone="danger" label="미노출" icon />
```

## 기존 컴포넌트와의 관계

| 기존 | 지금 |
| --- | --- |
| `SummaryCards` | `MetricCardGrid` 로 대체 가능(상태 아이콘·추이 지원). 기존 호출부는 그대로 동작 |
| `PostSearchBar` + `selectClass` | `FilterControlBar` 의 `search` / `sort` 슬롯 |
| `AnalyticsTableShell` + 직접 `<table>` | `DataTable`(Sticky/Loading/Empty 포함) |
| `StatusBadge cls="..."` | `StatusBadge tone="..."` (`cls` 도 계속 동작) |

한 포스팅이 여러 행으로 펼쳐지는 화면(키워드 순위: 대표 + 보조 키워드 n행)은
`DataTable` 의 `renderRows` 로 본문만 직접 그리고 헤더·상태·껍데기는 공유합니다.
