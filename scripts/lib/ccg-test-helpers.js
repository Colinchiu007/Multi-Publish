"use strict"

// CCG / 质量节拍测试的共享探测工具。
//
// 为什么存在（PR #3148 QM-6 评审 i6 两次点名、#3161 继承登记）：
//   resolveGitBash 的「MP_GIT_BASH 覆盖 → git --exec-path 派生 → 硬编码候选 →
//   dirname.exe 身份校验 → 落回裸 bash」探测链，曾在 4 个测试文件里逐字复制
//   （branch-naming-contract / ccg-bash-entry / deep-review-deps / plan-review-deps）。
//   复制的代价是**改名即漂移**：任何一处修 bug（例如候选目录增删、校验收紧），
//   其余三份静默保持旧行为，测试之间对「哪个 bash 才可信」的认知悄然分叉。
//
// 使用约定：
//   const { resolveGitBash, toPosixPath } = require("./lib/ccg-test-helpers")
//   —— 消费方只剩这 4 个：branch-naming-contract / ccg-bash-entry /
//      deep-review-deps / plan-review-deps，2026-10-08 全仓递归搜索确认无第 5 处
//      复制；start-mp-task.test.js 的是
//      **结构锁**——它断言的是入口脚本文本里必须出现探测链，不执行探测，
//      故不在此列）。
//
// 注意：本文件不是 .test.js，不会被 check-unwired-tests 要求 CI 接线；
// 它随消费方测试一起被 node --test 的 require 链加载验证。
// .gitignore 的 scripts/*.js 规则下需显式白名单（见 !scripts/lib/ccg-test-helpers.js）。

const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

/**
 * 定位 Git for Windows Bash。
 *
 * 探测链（与 start-mp-task.ps1 / run-bash-gate.ps1 的语义一致）：
 *   1. MP_GIT_BASH 环境变量覆盖（CI 与本机均可显式指定）；
 *   2. git --exec-path 派生（git 装哪，bash 就在哪）；
 *   3. 硬编码候选（C/D 盘常见安装位）；
 *   4. 身份校验：候选必须是 <GitRoot>\usr\bin\bash.exe 或 <GitRoot>\bin\bash.exe，
 *      且同根 usr\bin\dirname.exe 存在——WSL shim（system32\bash.exe）路径形态
 *      不符被直接拒绝（裸 bash 解析到 WSL 时无 dirname/cygpath/awk，
 *      session-init.sh 会以 `dirname: command not found` 失败）；
 *   5. 全部落空 → 返回裸 "bash"（CI 的 ubuntu runner 上系统 bash 可用）。
 *
 * @returns {string} bash 可执行文件路径（或裸名兜底）
 */
function resolveGitBash() {
  if (process.env.MP_GIT_BASH) return process.env.MP_GIT_BASH
  const candidates = []
  try {
    const git = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim()
    if (git) candidates.push(path.join(git, "..", "..", "usr", "bin", "bash.exe"))
  } catch {
    // git 不在 PATH 时走硬编码候选
  }
  candidates.push(
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
    "D:\\Program Files\\Git\\usr\\bin\\bash.exe",
  )
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const gitRoot = c.replace(/[\\/]usr[\\/]bin[\\/]bash\.exe$|[\\/]bin[\\/]bash\.exe$/, "")
      if (gitRoot && fs.existsSync(path.join(gitRoot, "usr", "bin", "dirname.exe"))) return c
    }
  }
  return "bash" // CI / 真 Unix：系统 bash
}

/**
 * Windows 风格路径（C:\a\b）→ Git Bash 风格（/c/a/b）。
 * 非 Windows 形态输入原样返回（CI ubuntu 上 execPath 本就是 POSIX 形态）。
 *
 * @param {string} p 任意路径
 * @returns {string} POSIX 化路径
 */
function toPosixPath(p) {
  const q = p.replace(/\\/g, "/")
  const m = q.match(/^([A-Za-z]):(.*)$/)
  return m ? `/${m[1].toLowerCase()}${m[2]}` : q
}

module.exports = { resolveGitBash, toPosixPath }
