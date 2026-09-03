/**
 * 등급 × 기능 접근 매트릭스를 텍스트로 덤프한다.
 *
 * 등급 명칭을 바꾸는 작업에서 "권한 범위는 그대로"를 증명하기 위한 도구다.
 * 리네임 전후로 실행해 diff 가 비어야 통과다. 등급 이름 자체는 rank 순서로만
 * 출력하므로(코드·라벨을 찍지 않는다) 이름이 바뀌어도 출력은 동일해야 한다.
 *
 * 사용: node scripts/dump-plan-matrix.mjs > /tmp/matrix-before.txt
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const src = readFileSync(new URL('../src/lib/plans.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const module_ = { exports: {} };
new Function('exports', 'require', 'module', js)(module_.exports, require, module_);
const plans = module_.exports;

const order = plans.PLAN_ORDER;
const features = plans.FEATURES;

// 등급을 이름이 아니라 서열(0,1,2)로 부른다 — 이름이 바뀌어도 diff 가 나지 않게.
const lines = [];
lines.push(`plan count: ${order.length}`);
lines.push(`feature count: ${Object.keys(features).length}`);
lines.push('');
lines.push('feature\tminPlanRank\tanon\tquota\t' + order.map((_, i) => `rank${i}`).join('\t'));

for (const key of Object.keys(features).sort()) {
  const def = features[key];
  const minRank = order.indexOf(def.minPlan);
  const cells = order.map((p) => (plans.canUse(p, key) ? 'Y' : 'N'));
  const quotas = order.map((p) => plans.quotaFor(p, key) ?? '-');
  lines.push(
    [key, minRank, def.allowAnonymous ? 'Y' : 'N', quotas.join('|'), ...cells].join('\t')
  );
}

lines.push('');
lines.push('-- planAtLeast 진리표 (rank 기준) --');
for (let a = 0; a < order.length; a++) {
  for (let b = 0; b < order.length; b++) {
    lines.push(`${a} >= ${b}: ${plans.planAtLeast(order[a], order[b])}`);
  }
}

lines.push('');
lines.push('-- toPlanKey: DB 저장값 -> 등급 서열 --');
for (const raw of ['FREE', 'BLOGGER', 'INFLUENCER', 'PRO', 'BASIC', '', null, undefined, 'garbage']) {
  lines.push(`${JSON.stringify(raw)} -> rank ${order.indexOf(plans.toPlanKey(raw))}`);
}

console.log(lines.join('\n'));
