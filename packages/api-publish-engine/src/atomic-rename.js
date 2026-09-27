'use strict'
/**
 * atomic-rename.js — Windows 上「临时文件 + rename」的唯一替换语义。
 *
 * 为什么单独成文件：本包的 `api-key-manager`（API Key 存储）与 `cloud-accounts/keyring-kms`
 * （主密钥环）都在做同一件事——把系统保护的敏感状态全文重写落盘。AGENTS.md「Windows 原子文件
 * 替换重试」要求**所有 rename 点保持相同的原子替换语义**，且只允许对 `EPERM` / `EACCES` / `EBUSY`
 * 做短而有界的退避重试；超过预算或其他错误原样抛出。抄第二份实现 = 两份必然漂移，
 * 漂移的表现是其中一处悄悄不再重试，换来一次断电就报废密钥环。
 *
 * 重试预算沿用 api-key-manager 的既有取值（6 次，20ms 起指数退避，总上限约 1.3s）：
 * 不得无限重试，也不得退化为直接覆盖写。
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const WINDOWS_RENAME_RETRY_DELAYS_MS = Object.freeze([20, 40, 80, 160, 320, 640])
const WINDOWS_TRANSIENT_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY'])
/** 敏感状态（主密钥环、Key 存储）的落盘权限：只有属主可读写。 */
const PRIVATE_FILE_MODE = 0o600

function sleepSync (delayMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)
}

/**
 * 原子替换：只允许从同一目录内的临时文件 rename 到目标。
 * 失败时原目标字节不变（rename 的原子性），调用方负责清理临时文件。
 * @param {string} sourcePath
 * @param {string} targetPath
 */
function atomicRenameSync (sourcePath, targetPath) {
  let attempt = 0
  while (true) {
    try {
      fs.renameSync(sourcePath, targetPath)
      return
    } catch (error) {
      const retryable = process.platform === 'win32'
        && error
        && WINDOWS_TRANSIENT_RENAME_ERRORS.has(error.code)
        && attempt < WINDOWS_RENAME_RETRY_DELAYS_MS.length
      if (!retryable) throw error
      sleepSync(WINDOWS_RENAME_RETRY_DELAYS_MS[attempt])
      attempt += 1
    }
  }
}

/**
 * rename 的持久性记在**目录项**上，只 fsync 文件数据不够：断电后可能出现"文件内容在、
 * rename 没了"，运维看到的就是一次静默回滚到旧 active 的轮转。
 * Windows 不允许打开目录句柄 ⇒ 只在 POSIX 做；失败不推翻已成功的替换，但也不假装它没发生
 * （调用方拿不到信号，所以这里刻意不留静默分支——只在平台差异上跳过）。
 */
function fsyncParentDir (targetPath) {
  if (process.platform === 'win32') return
  let dirFd
  try {
    dirFd = fs.openSync(path.dirname(targetPath), 'r')
    fs.fsyncSync(dirFd)
  } finally {
    if (typeof dirFd === 'number') {
      try { fs.closeSync(dirFd) } catch (_) { /* 关闭失败不影响已落盘的目录项 */ }
    }
  }
}

/**
 * 全文原子写，且**按敏感文件的权限落地**：
 *  - 临时名带 `crypto.randomBytes` 后缀——`<target>.<pid>.<rand>.tmp` 若可猜，同目录下的其他
 *    本地用户可以先占位建符号链接，把我们要写的内容吸到别处去（密钥环尤其致命）；
 *  - `'wx'` 已存在即失败（不覆盖、不追随符号链接）；
 *  - mode 必须在**创建时**给定：Linux 默认 umask 022 下「先建后 chmod」会留一个全局可读窗口，
 *    而 rename 把这份权限带到目标上 —— 密钥环于是成为同机任意用户可读的文件。
 * @param {string} targetPath
 * @param {string|Buffer} data
 * @param {number} [mode] 默认 0600（主密钥环 / Key 存储都属敏感）
 */
function writeFileAtomicSync (targetPath, data, mode = PRIVATE_FILE_MODE) {
  const tmpPath = `${targetPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  let fd
  try {
    fd = fs.openSync(tmpPath, 'wx', mode)
    fs.writeFileSync(fd, data)
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    atomicRenameSync(tmpPath, targetPath)
    fsyncParentDir(targetPath)
  } catch (error) {
    if (typeof fd === 'number') {
      try { fs.closeSync(fd) } catch (_) { /* 忽略：不掩盖原错误 */ }
    }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    } catch (_) { /* 清理失败不掩盖原错误 */ }
    throw error
  }
}

module.exports = {
  atomicRenameSync,
  writeFileAtomicSync,
  fsyncParentDir,
  WINDOWS_RENAME_RETRY_DELAYS_MS,
  PRIVATE_FILE_MODE,
}
