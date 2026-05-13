#!/usr/bin/env node
/**
 * Vercel 배포가 계속 Queued 일 때 원인 확인용 (읽기 전용).
 *
 *   export VERCEL_TOKEN='...'   # https://vercel.com/account/tokens
 *   npm run vercel:diagnose-queue
 *
 * 출력:
 *   - 팀 최근 배포 중 BUILDING / INITIALIZING (슬롯 점유)
 *   - 팀별 QUEUED 건수 요약
 *   - 이 프로젝트(naver-influencer)의 QUEUED 목록
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const projectJson = JSON.parse(readFileSync(join(root, '.vercel', 'project.json'), 'utf8'));
const TEAM_ID = projectJson.orgId;
const PROJECT_ID = projectJson.projectId;
const PROJECT_NAME = projectJson.projectName || 'naver-influencer';

const token = process.env.VERCEL_TOKEN?.trim();
if (!token) {
  console.error('[vercel-diagnose-queue] VERCEL_TOKEN 이 필요합니다.');
  console.error('  → https://vercel.com/account/tokens');
  process.exit(1);
}

async function listDeployments(params) {
  const q = new URLSearchParams({ teamId: TEAM_ID, limit: '50', ...params });
  const res = await fetch(`https://api.vercel.com/v6/deployments?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`목록 조회 실패 ${res.status}: ${JSON.stringify(body)}`);
  }
  return body.deployments || [];
}

function shortMsg(d) {
  return (d.meta?.githubCommitMessage || d.name || '').slice(0, 64);
}

function iso(ms) {
  if (!ms) return '-';
  return new Date(ms).toISOString().slice(0, 19) + 'Z';
}

const teamRecent = await listDeployments({});

const byState = {};
for (const d of teamRecent) {
  const s = d.readyState || '?';
  byState[s] = (byState[s] || 0) + 1;
}

console.log('\n=== 팀 배포 상태 요약 (최근 50건) ===');
console.log('  teamId:', TEAM_ID);
console.log('  상태별 건수:', JSON.stringify(byState, null, 0));

const building = teamRecent.filter((d) => ['BUILDING', 'INITIALIZING'].includes(d.readyState));
console.log('\n=== 슬롯 점유 중 (BUILDING / INITIALIZING) ===');
if (building.length === 0) {
  console.log('  없음.');
  console.log('  → 팀 전체에서 돌아가는 빌드가 없는데도 Queued 면:');
  console.log('     · Vercel 대시보드에서 해당 배포 상세(로그/이벤트) 확인');
  console.log('     · 결제·플랜·팀 일시중지 여부 확인');
  console.log('     · https://www.vercel-status.com/ 재확인 후 지원팀 문의');
} else {
  for (const d of building) {
    const tag = d.projectId === PROJECT_ID ? '← 이 프로젝트' : '← 다른 프로젝트';
    console.log(
      `  ${d.readyState}  ${tag}  uid=${d.uid}  projectId=${d.projectId}  ${iso(d.createdAt)}  ${shortMsg(d)}`,
    );
  }
  const other = building.filter((d) => d.projectId !== PROJECT_ID);
  if (other.length > 0) {
    console.log('\n  ⚠ Hobby 플랜은 팀당 동시 빌드 1슬롯인 경우가 많습니다.');
    console.log('    다른 프로젝트가 Building 이면 이 프로젝트는 Queued 에서 대기합니다.');
  }
}

const ours = await listDeployments({ projectId: PROJECT_ID });
const queued = ours.filter((d) => d.readyState === 'QUEUED');
queued.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

console.log(`\n=== [${PROJECT_NAME}] QUEUED (${queued.length}건) ===`);
if (queued.length === 0) {
  console.log('  없음.');
} else {
  for (const d of queued) {
    console.log(`  uid=${d.uid}  ${iso(d.createdAt)}  ${shortMsg(d)}`);
  }
  console.log('\n  정리: npm run vercel:cancel-queued  (최신 1건만 남김)');
  console.log('       VERCEL_CANCEL_ALL_PROJECT_QUEUED=1 npm run vercel:cancel-queued-all');
}

console.log('\n=== 참고 ===');
console.log('  projectId:', PROJECT_ID);
console.log('  On-Demand Concurrent Builds: https://vercel.com/docs/deployments/build-queues\n');
