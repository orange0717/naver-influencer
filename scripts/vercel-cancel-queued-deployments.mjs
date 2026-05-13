#!/usr/bin/env node
/**
 * Vercel에서 같은 프로젝트의 QUEUED 배포가 여러 개 쌓였을 때,
 * 가장 최근(최신) 1건만 남기고 나머지 QUEUED 는 PATCH /cancel 로 정리합니다.
 *
 * 사용법:
 *   1) https://vercel.com/account/tokens 에서 토큰 생성
 *   2) 프로젝트 루트에서:
 *        export VERCEL_TOKEN='...'
 *        npm run vercel:cancel-queued
 *
 * 건너뛰기만 하려면:
 *        VERCEL_DRY_RUN=1 npm run vercel:cancel-queued
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const projectJson = JSON.parse(readFileSync(join(root, '.vercel', 'project.json'), 'utf8'));
const TEAM_ID = projectJson.orgId;
const PROJECT_ID = projectJson.projectId;

const token = process.env.VERCEL_TOKEN?.trim();
const dry = process.env.VERCEL_DRY_RUN === '1' || process.env.VERCEL_DRY_RUN === 'true';

if (!token) {
  console.error('[vercel-cancel-queued] VERCEL_TOKEN 이 필요합니다.');
  console.error('  → https://vercel.com/account/tokens 에서 생성 후 export VERCEL_TOKEN=...');
  process.exit(1);
}

async function listDeployments() {
  const q = new URLSearchParams({
    projectId: PROJECT_ID,
    teamId: TEAM_ID,
    limit: '40',
  });
  const res = await fetch(`https://api.vercel.com/v6/deployments?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`목록 조회 실패 ${res.status}: ${JSON.stringify(body)}`);
  }
  return body.deployments || [];
}

async function cancelDeployment(uid) {
  const q = new URLSearchParams({ teamId: TEAM_ID });
  const res = await fetch(`https://api.vercel.com/v12/deployments/${uid}/cancel?${q}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`취소 실패 ${uid} ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const all = await listDeployments();
const queued = all.filter((d) => d.readyState === 'QUEUED');
if (queued.length === 0) {
  console.log('[vercel-cancel-queued] QUEUED 배포가 없습니다.');
  process.exit(0);
}

queued.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const newest = queued[queued.length - 1];
const toCancel = queued.slice(0, -1);

console.log(
  `[vercel-cancel-queued] QUEUED ${queued.length}건 → 최신 1건 유지 (${newest.uid}), 이전 ${toCancel.length}건 취소`,
);

for (const d of toCancel) {
  const msg = (d.meta?.githubCommitMessage || d.name || '').slice(0, 72);
  if (dry) {
    console.log(`  [dry-run] cancel ${d.uid}  ${msg}`);
    continue;
  }
  await cancelDeployment(d.uid);
  console.log(`  취소됨 ${d.uid}  ${msg}`);
}

if (dry) {
  console.log('[vercel-cancel-queued] VERCEL_DRY_RUN 이라 API 호출은 하지 않았습니다.');
} else {
  console.log('[vercel-cancel-queued] 완료. Vercel Deployments 에서 최신 건이 Building 으로 진행되는지 확인하세요.');
}
