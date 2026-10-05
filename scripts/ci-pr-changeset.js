#!/usr/bin/env node
// ci-pr-changeset — 决定「本 PR 的变更集该用哪一对 base/head」的唯一实现
//
// 为什么要有这个文件（#2914 事故 + QM-6 后端评审实测逼出）：
// 原先这段判断直接写在 .github/workflows/quality-gate.yml 的 bash 里。文本结构锁只能证明
// 「那行字还在」，证明不了「那条支路还会被走」——实测把 `if git rev-parse -q --verify HEAD^2`
// 改成 `if false` 后，三条 workflow 结构锁 29/25/31 全绿，而取源已经整条退回错误的形态。
// 所以判据搬家到这里，由 fixtures 逐形态跑真 git 验证。
//
// 两种失效形态（都实测复现过）：
//   A) 用 event base.sha + 默认 HEAD（=refs/pull/N/merge 的合并提交）：
//      PR 打开后 main 前进的那些提交整段落进 merge-base(base, 合并提交)..合并提交。
//   B) 用 event base.sha + event head.sha：分支只要做过 re-sync（把新 main 合进自己，
//      本仓推 PR 前的常规动作），那些 main 提交就在 head 的历史里、却不在冻结的 base 一侧，
//      照样落进 merge-base(base, head)..head。
// 正解：优先取**检出的合并提交自己的双亲** —— HEAD^1 = 当前 base tip，HEAD^2 = PR head。
// 这对取值天然是"相对当前 base 的本 PR 变更集"，且随检出物一起过期，不会凭记忆。
//
// 用法：node scripts/ci-pr-changeset.js [--repo=<dir>] [--evt-name=<push|pull_request>]
//                                       [--evt-base=<sha>] [--evt-head=<sha>]
// 输出（stdout，KEY=VAL，供 shell 直接读）：source= base= head=
// GITHUB_OUTPUT 存在时同时追加 pr-base / pr-head 两个 step 产出。
// 取值不全一律 rc=1（宁可乐红，不得让调用方静默退回 HEAD=合并提交）。

const fs = require('fs')
const { execFileSync } = require('child_process')

const NON_PR = 'non-pr'
const PARENTS = 'merge-ref-parents'
const PAYLOAD = 'event-payload'

function parseArgs (argv) {
  const out = {}
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const m = /^--([^=]+)=(.*)$/.exec(arg)
    if (m) out[m[1]] = m[2]
    else out[arg.slice(2)] = true
  }
  return out
}

// 只认"检出的这个提交确实有两个亲"，不去猜 refs/pull/*：checkout 换 ref 时本判据会自动落到
// payload 支路并打印出来，而不是拿着一个不存在的双亲报红。
function mergeRefParents (repo, git) {
  try {
    if (!git(repo, ['rev-parse', '-q', '--verify', 'HEAD^2'])) return null
    const base = git(repo, ['rev-parse', 'HEAD^1']).trim()
    const head = git(repo, ['rev-parse', 'HEAD^2']).trim()
    if (!base || !head) return null
    return { base, head }
  } catch {
    return null
  }
}

function decide ({ repo = process.cwd(), evtName, evtBase = '', evtHead = '', git } = {}) {
  const runGit = git || ((r, args) => execFileSync('git', ['-C', r, ...args], { encoding: 'utf8' }))
  const parents = mergeRefParents(repo, runGit)
  if (parents) return { source: PARENTS, base: parents.base, head: parents.head }
  if (evtName && evtName !== 'pull_request') return { source: NON_PR, base: '', head: '' }
  const base = String(evtBase).trim()
  const head = String(evtHead).trim()
  if (!base || !head) {
    throw new Error(`取不到本 PR 的 base/head（evt-name=${evtName || '(空)'} evt-base=[${base}] evt-head=[${head}]）；`
      + '宁可乐红也不得静默退回 HEAD=合并提交')
  }
  return { source: PAYLOAD, base, head }
}

function main (argv) {
  const args = parseArgs(argv)
  const repo = args.repo || process.cwd()
  let r
  try {
    r = decide({ repo, evtName: args['evt-name'], evtBase: args['evt-base'], evtHead: args['evt-head'] })
  } catch (e) {
    process.stderr.write(`[ci-pr-changeset] ${e.message}\n`)
    process.exit(1)
  }
  const lines = [`source=${r.source}`, `base=${r.base}`, `head=${r.head}`]
  process.stdout.write(lines.join('\n') + '\n')
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `pr-base=${r.base}\npr-head=${r.head}\n`, 'utf8')
  }
  process.exit(0)
}

if (require.main === module) main(process.argv.slice(2))

module.exports = { decide, mergeRefParents, NON_PR, PARENTS, PAYLOAD }
