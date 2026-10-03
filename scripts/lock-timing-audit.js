#!/usr/bin/env node
/**
 * scripts/lock-timing-audit.js — Windows 锁握手相位耗时的 CI 复测入口
 *
 * 为什么要有这个文件：`test-helpers/windows-file-lock.js` 里三段等待预算（启动 / 持锁 / 释放）
 * 的数值原先只有注释里一句"某宿主启动是秒级"——**没量过**。AGENTS.md QM-3 明确要求预算值
 * 必须有实测分布支撑，否则下一次有人觉得"45s 太松，收到 20s"就会把 CI 改成一红一片，
 * 而且症状与真正的锁问题无法区分（这正是"等待没有边界"家族第 8 颗的原始形状）。
 * 本脚本是那条"可复测的路径"：`node scripts/lock-timing-audit.js --json` 直接打印可以粘进
 * `LOCK_BUDGET_PROVENANCE` 的对象，并对照**当前生效的**预算判余量。
 *
 * 用法：
 *   node scripts/lock-timing-audit.js [--runs=26] [--json] [--multiplier=2]
 *                                     [--max-ready=<ms>]   手工覆盖实测值（默认自动采集）
 *
 * 退出码：0 = 采到样本且预算余量成立
 *        3 = 一条样本都没采到 ⇒ **探针瞎了**，绝不判"没问题"（观察者必须报告自己的失明）
 *        4 = 观测最大值吃掉 safetyMultiplier 倍余量 ⇒ 该抬预算，而不是去放宽断言
 *
 * 五条采集坐标坑（前四条都曾让探针"跑得通却零样本"，第五条让它在坐标坏掉时抛裸栈）：
 *   1. Actions 作业对象**没有** `completed` 字段 ⇒ 判完成态一律用 `status === 'completed'`；
 *   2. 日志请求必须**绕开本机代理**（走 7897 时 Actions 日志/产物会失败）；
 *   3. `gh api` 对含 ANSI 转义序列的响应会**拒答**，而 Actions 日志必然含 ANSI
 *      ⇒ 必须带 `--allow-escape-sequences`；
 *   4. 列 run 那一步失败（repo 写错 / 未登录 / 网络）以前抛栈、rc=1，读起来像"脚本坏了"
 *      而不是"没采到" ⇒ 现在并进同一条零样本出口，并把失败坐标一起打出来；
 *   5. **run 列表的服务端 `event`+`status` 参数组合在本仓返回一个被静默截断的窗口**
 *      （2026-10-01 实测：加任一参数，最新一条都停在 2026-09-15，total_count 从 2000+ 掉到
 *      1372），而那个窗口里还没有本夹具 ⇒ 表现为"采不到样本"。所以过滤一律放在客户端做，
 *      并且要**翻页**（最近 100 条 run 里只有约 9 条是 main push，单页会把 --runs 静默缩水）。
 * 另：作业日志只在 run 结束后可取 ⇒ 本工具是**事后复测**（对着已跑完的 main run），不是 PR 内自证。
 *     每次 push 都跑的活体检查在 `windows-file-lock.test.js`（读真实握手的台账）。
 */
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const REPO_REMOTE = process.env.MP_AUDIT_REPO || 'Colinchiu007/mulpub';
const WORKFLOW = 'quality-gate.yml';
const JOB_RE = /QG Desktop Shards/;
const SAMPLE_RE = /\[windows-file-lock\] ready=(\d+)ms locked=(\d+)ms/;

function argOf (name, fallback) {
  const hit = process.argv.slice(2).find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : fallback;
}

const RUNS = Number(argOf('runs', 26));
const MULTIPLIER = Number(argOf('multiplier', 2));
const AS_JSON = process.argv.includes('--json');
// 代理一律清空：带着它取 Actions 日志/产物会失败（本机实测）
const NO_PROXY = Object.assign({}, process.env, {
  HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '',
});

function gh (args, maxBuffer) {
  return execFileSync('gh', args, {
    encoding: 'utf8', maxBuffer: maxBuffer || (1 << 26), env: NO_PROXY,
  });
}
function api (pathname) { return JSON.parse(gh(['api', pathname])); }

/** 从**当前源码**读预算：常量漂移时这里跟着变，不会出现"脚本判的是旧预算"这种第二份真相 */
function loadBudget () {
  const helper = path.resolve(__dirname, '..', 'test-helpers', 'windows-file-lock.js');
  const mod = require(helper);
  if (!mod.LOCK_BUDGET_PROVENANCE) {
    throw new Error('PROVENANCE_MISSING: 夹具没导出 LOCK_BUDGET_PROVENANCE ⇒ 预算出处这条链已断，复测结果无处对照；这比"采不到样本"更严重，绝不能退回脚本里另写一份 source 文案');
  }
  return {
    readyTimeoutMs: mod.DEFAULT_READY_TIMEOUT_MS,
    provenance: mod.LOCK_BUDGET_PROVENANCE,
  };
}

/**
 * 列出 wanted 个「main 分支、push 触发、已结束」的 run。
 * 一律**不带**服务端 event/status 过滤（见文件头第 5 条），改为客户端筛 + 翻页。
 */
function listRuns (wanted, errors) {
  const MAX_PAGES = 12;
  const picked = [];
  let pages = 0;
  let scanned = 0;
  for (let page = 1; page <= MAX_PAGES && picked.length < wanted; page++) {
    let list;
    try {
      list = api('repos/' + REPO_REMOTE + '/actions/workflows/' + WORKFLOW
        + '/runs?per_page=100&page=' + page);
    } catch (e) {
      errors.push('run-list p' + page + ' ' + String(e.message).replace(/\r?\n/g, ' ').slice(0, 60));
      break;
    }
    pages += 1;
    const rs = list.workflow_runs || [];
    scanned += rs.length;
    for (const r of rs) {
      if (r.event === 'push' && r.head_branch === 'main' && r.status === 'completed') picked.push(r);
    }
    if (rs.length < 100) break; // 已到末页
  }
  return { runs: picked.slice(0, wanted), pages, scanned };
}

function collect () {
  const errors = [];
  const listed = listRuns(RUNS, errors);
  const runs = listed.runs;
  if (runs.length < RUNS) {
    errors.push('only-' + runs.length + '-of-' + RUNS + '-runs in ' + listed.pages + ' pages');
    // 采到了东西但覆盖不足也必须出声：偏小的样本喂进 provenance，读起来像完整分布
    console.warn('PARTIAL: 只覆盖 ' + runs.length + '/' + RUNS + ' 个 main push run（pages=' + listed.pages + '）⇒ 用这份数字回填 provenance 前先加大 --runs 或缩小结论适用范围');
  }

  const ready = [];
  let jobs = 0;
  for (const run of runs) {
    let jobsResp;
    try { jobsResp = api('repos/' + REPO_REMOTE + '/actions/runs/' + run.id + '/jobs'); }
    catch (e) { errors.push('jobs ' + run.id); continue; }
    const shards = (jobsResp.jobs || [])
      .filter((j) => JOB_RE.test(j.name) && j.status === 'completed');
    if (!shards.length) errors.push('no-shard-job ' + run.id);
    for (const job of shards) {
      let body = '';
      try {
        body = gh(['api', '--allow-escape-sequences',
          'repos/' + REPO_REMOTE + '/actions/jobs/' + job.id + '/logs'], 1 << 28);
      } catch (e) {
        errors.push('log ' + job.id + ' ' + String(e.message).replace(/\r?\n/g, ' ').slice(0, 40));
        continue;
      }
      let n = 0;
      for (const line of body.split('\n')) {
        const m = SAMPLE_RE.exec(line);
        if (m) { ready.push(Number(m[1])); n += 1; }
      }
      if (n === 0) { errors.push('no-sample job=' + job.id); continue; }
      jobs += 1;
      // 逐 run 留痕：这个工具要跑几分钟，没有中间现场就分不清"还在采"与"被杀了"
      //（2026-10-01 实测：--runs=26 一次以 rc=1 退出且 stdout/stderr 全空，无法归因）
      console.error('[lock-timing-audit] run=' + run.id + ' job=' + job.id
        + ' samples+=' + n + ' total=' + ready.length);
    }
  }
  ready.sort((a, b) => a - b);
  return { ready, runCount: runs.length, jobs, pages: listed.pages, errors };
}

function main () {
  let budget;
  try {
    budget = loadBudget();
  } catch (e) {
    console.error('PROVENANCE_MISSING：读不到预算出处 ⇒ ' + String(e.message).split(/\r?\n/)[0].slice(0, 140));
    process.exitCode = 5;
    return;
  }
  let ready;
  let runCount;
  let jobs;
  let pages = 1;
  let errors = [];

  const manual = argOf('max-ready', null);

  if (manual !== null) {
    ready = [Number(manual)];
    runCount = Number(argOf('runs', 1));
    jobs = Number(argOf('jobs', 1));
  } else {
    const got = collect();
    ready = got.ready; runCount = got.runCount; jobs = got.jobs; errors = got.errors;
    pages = got.pages;
  }

  if (!ready.length) {
    // 零样本必须出声并点名坐标：一次"采不到"被读成"没问题"，等于把门禁换成一盏恒绿的灯
    console.error('NO_SAMPLES：一条握手样本都没采到 ⇒ 探针坐标可能过期'
      + '（workflow 名 / job 名 / status 字段 / 代理 / ANSI 拒答 / gh 登录态 / 服务端过滤截断）');
    console.error('       MP_AUDIT_REPO=' + REPO_REMOTE + ' pages=' + pages
      + ' runs=' + runCount + ' errors=' + errors.slice(0, 8).join(' , '));
    process.exitCode = 3;
    return;
  }

  const maxObservedReadyMs = ready[ready.length - 1];
  const provenance = {
    maxObservedReadyMs,
    samples: ready.length,
    runs: runCount,
    jobs,
    safetyMultiplier: MULTIPLIER,
    collectedAt: new Date().toISOString().slice(0, 10),
    // 唯一真源：夹具导出的那一句。曾经这里还有"取不到就用脚本内硬编码文案"的分支，
    // 那是让同一份出处存在两个版本 —— 现在 loadBudget 会先以 PROVENANCE_MISSING 拦停。
    source: budget.provenance.source,
  };

  if (AS_JSON) {
    console.log(JSON.stringify(provenance, null, 2));
  } else {
    const p50 = ready[Math.floor(ready.length / 2)];
    console.log('[lock-timing-audit] pages=' + pages + ' runs=' + runCount + ' jobs=' + jobs
      + ' samples=' + ready.length + ' ready.p50=' + p50 + 'ms ready.max=' + maxObservedReadyMs
      + 'ms errors=' + errors.length);
    console.log('当前 DEFAULT_READY_TIMEOUT_MS=' + budget.readyTimeoutMs
      + '，要求 ≥ max×' + MULTIPLIER + '=' + maxObservedReadyMs * MULTIPLIER);
  }

  if (budget.readyTimeoutMs < maxObservedReadyMs * MULTIPLIER) {
    console.error('BUDGET_TOO_TIGHT: 启动预算 ' + budget.readyTimeoutMs + 'ms < 实测最大 '
      + maxObservedReadyMs + 'ms × ' + MULTIPLIER
      + ' ⇒ 该抬预算（并同步 LOCK_CASE_TIMEOUT_MS 的消费方），不得反过来放宽断言');
    process.exitCode = 4;
    return;
  }
  console.log('OK: 预算余量成立（headroom='
    + (budget.readyTimeoutMs / maxObservedReadyMs).toFixed(2) + '×）');
}

if (require.main === module) main();

module.exports = { collect, loadBudget, SAMPLE_RE, JOB_RE };
