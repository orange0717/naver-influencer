#!/usr/bin/env node
/**
 * Vercel 배포가 계속 Queued 일 때 점검·정리용.
 *
 * - 팀(orangelibrary) 전체에서 **Building / Initializing** 이 다른 프로젝트에서 돌고 있으면
 *   Hobby 플랜은 **동시 빌드 1슬롯**이라, 이 프로젝트는 줄만 서고 Queued 에 머뭅니다.
 * - 이 스크립트는 먼저 팀 단위 상태를 출력한 뒤, 이 프로젝트(naver-influencer)의 Queued 만 정리합니다.
 *
 * 사용법:
 *   export VERCEL_TOKEN='...'   # https://vercel.com/account/tokens
 *   npm run vercel:cancel-queued
 *
 * 이 프로젝트의 Queued 를 **전부** 취소(그다음 git push 로 새 배포만 남기기):
 *   VERCEL_CANCEL_ALL_PROJECT_QUEUED=1 npm run vercel:cancel-queued
 *
 * 연습:
 *   VERCEL_DRY_RUN=1 npm run vercel:cancel-queued
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
const dry = process.env.VERCEL_DRY_RUN === '1' || process.env.VERCEL_DRY_RUN === 'true';
const cancelAllProjectQueued =
  process.env.VERCEL_CANCEL_ALL_PROJECT_QUEUED === '1' ||
  process.env.VERCEL_CANCEL_ALL_PROJECT_QUEUED === 'true';

if (!token) {
  console.error('[vercel-cancel-queued] VERCEL_TOKEN 이 필요합니다.');
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

function shortMsg(d) {
  return (d.meta?.githubCommitMessage || d.name || '').slice(0, 72);
}

// ── 1) 팀 전체: 슬롯을 잡고 있는 빌드가 있는지
const teamRecent = await listDeployments({});
const building = teamRecent.filter((d) => ['BUILDING', 'INITIALIZING'].includes(d.readyState));

console.log('\n=== 팀 빌드 슬롯 점검 (최근 50건 중) ===');
if (building.length === 0) {
  console.log('  → 지금 팀에서 BUILDING / INITIALIZING 인 배포가 **없습니다**.');
  console.log('    (그런데도 이 프로젝트만 계속 Queued 면 Vercel 쪽 지연이나 결제/계정 이슈를 의심하세요.)');
} else {
  for (const d of building) {
    const mine = d.projectId === PROJECT_ID ? '(이 프로젝트)' : '(다른 프로젝트)';
    const created = d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 16) + 'Z' : '-';
    console.log(
      `  · ${d.readyState} ${mine}  uid=${d.uid}  projectId=${d.projectId}  created≈${created}  ${shortMsg(d)}`,
    );
  }
  const other = building.filter((d) => d.projectId !== PROJECT_ID);
  if (other.length > 0) {
    console.log('\n  ⚠ Hobby 는 **팀 전체 동시 빌드 1개**인 경우가 많습니다.');
    console.log('    다른 프로젝트가 Building 중이면 naver-influencer 는 Queued 에서 기다립니다.');
    console.log('    → Vercel 팀 Deployments 전체 보기에서 다른 프로젝트 Building 을 끝내거나 Cancel 하세요.\n');
  }
}

// ── 2) 이 프로젝트의 Queued 정리
const ours = await listDeployments({ projectId: PROJECT_ID });
const queued = ours.filter((d) => d.readyState === 'QUEUED');

if (queued.length === 0) {
  console.log(`\n[${PROJECT_NAME}] QUEUED 배포 없음. 여기까지.\n`);
  process.exit(0);
}

queued.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

let toCancel;
if (cancelAllProjectQueued) {
  toCancel = [...queued];
  console.log(
    `\n[${PROJECT_NAME}] VERCEL_CANCEL_ALL_PROJECT_QUEUED=1 → QUEUED ${queued.length}건 전부 취소 시도`,
  );
} else {
  const newest = queued[queued.length - 1];
  toCancel = queued.slice(0, -1);
  console.log(
    `\n[${PROJECT_NAME}] QUEUED ${queued.length}건 → 최신 1건 유지 (${newest.uid}), 이전 ${toCancel.length}건 취소`,
  );
}

for (const d of toCancel) {
  if (dry) {
    console.log(`  [dry-run] cancel ${d.uid}  ${shortMsg(d)}`);
    continue;
  }
  try {
    await cancelDeployment(d.uid);
    console.log(`  취소됨 ${d.uid}  ${shortMsg(d)}`);
  } catch (e) {
    console.error(`  실패 ${d.uid}:`, e.message || e);
  }
}

if (dry) {
  console.log('\n[vercel-cancel-queued] VERCEL_DRY_RUN — API 취소 호출 안 함.\n');
} else {
  console.log('\n다음: Vercel 대시보드에서 Building 으로 넘어가는지 확인.');
  console.log('  · 여전히 Queued 만 쌓이면: https://www.vercel-status.com/ 및 결제(Plan) 확인.');
  console.log('  · Queued 를 비운 뒤에는 `git commit --allow-empty -m chore: redeploy` 후 push 로 새 배포를 맨 앞에 세울 수 있습니다.\n');
}
