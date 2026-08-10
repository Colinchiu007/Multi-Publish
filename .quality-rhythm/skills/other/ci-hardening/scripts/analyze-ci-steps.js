#!/usr/bin/env node
/**
 * analyze-ci-steps — CI 瓶颈分析（M2 第一步）
 * 用 gh API 取一次通过 run 的 job step 耗时，输出排序表，定位占 80% 的串行步骤。
 * 用法：
 *   gh run list --workflow=quality-gate.yml --limit 3   # 找 run id
 *   node analyze-ci-steps.js <run-id> [job-name]
 * 依赖：gh CLI 已登录。
 */
'use strict';
const { execFileSync } = require('child_process');

function gh(args) {
  const raw = execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(raw);
}

function ghRaw(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}

const runId = process.argv[2];
if (!runId) {
  console.error('用法: node analyze-ci-steps.js <run-id> [job-name]（在仓库目录内运行，自动探测 repo）');
  process.exit(1);
}
const filter = process.argv[3];
// 自动探测仓库 owner/name（cwd 为 git 仓库时用 gh repo view）
const repo = process.env.GITHUB_REPO || ghRaw(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);

const run = gh(['api', `repos/${repo}/actions/runs/${runId}`]);
let jobs;
try {
  jobs = gh(['api', `repos/${repo}/actions/runs/${runId}/jobs`]).jobs;
} catch {
  const runFull = gh(['api', `repos/${repo}/actions/runs/${runId}`]);
  jobs = runFull.jobs || [];
}
if (!jobs.length) {
  console.error('未取到 jobs（确认 gh 已登录且 run id 正确）');
  process.exit(1);
}
const jobStart = new Date(run.started_at || jobs[0].started_at).getTime();
console.log('run', runId, 'conclusion', run.conclusion, 'total_s', Math.round((new Date(run.updated_at).getTime() - jobStart) / 1000));

let total = 0;
const rows = [];
for (const job of jobs) {
  if (filter && !job.name.includes(filter)) continue;
  const jstart = new Date(job.started_at).getTime();
  for (const st of job.steps || []) {
    if (!st.completed_at) continue;
    const dur = (new Date(st.completed_at).getTime() - new Date(st.started_at).getTime()) / 1000;
    total += dur;
    rows.push({ dur, name: `[${job.name}] ${st.name}`, status: st.conclusion });
  }
}
rows.sort((a, b) => b.dur - a.dur);
let cum = 0;
for (const r of rows) {
  cum += r.dur;
  console.log(
    String(Math.round(r.dur)) + 's'.padEnd(7),
    r.status.padEnd(8),
    r.name,
    '(' + Math.round((cum / total) * 100) + '% cum)',
  );
}
console.log('\n总 step 时长 ~' + Math.round(total) + 's；关键路径建议取最长的串行链。瓶颈判断：找累计达 80% 的前几个步骤 → 并行拆分。');
