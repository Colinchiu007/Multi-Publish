// @ts-check
/**
 * 展示层口径的结构锁：主进程产出的每个 outcome / 错误码，都必须在这里有一处归属。
 *
 * 为什么要锁到"从源码反向收集"这一层：`OUTCOME_LABEL_KEYS` 与 `ERROR_CODE_GROUPS` 都是
 * 手写字典，新增一个终态或语义码时**没人会被编译器提醒去补**。而未登记的后果不是报错，是
 * 一行空白标签 / 一句把本机问题说成云端问题的文案 —— 用户会照着错的方向去排障
 * （本仓已有「区分度不够用户就拿重启当排障」的同族先例）。
 * 外部评审（QM-6 前端模型）就是在 `conflict-unresolved` 上抓到这条：主进程已经会产出它，
 * 展示层还没有它。
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { createCloudSyncResultModel } from './useCloudSyncResultModel.js'

/**
 * 逐级上溯找锚点文件，**禁止数 `..` 层级**（AGENTS.md：多包工作区里层级估算会指到
 * 不存在的 apps/desktop/node_modules 一类位置；本仓已有门禁因"找不到就跳过"而永久静默）。
 * 找不到即抛错，不允许 return null 让锁空跑。
 */
function upFind (relPath) {
  let dir = __dirname
  for (let i = 0; i < 10; i += 1) {
    const candidate = path.join(dir, relPath)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`未找到 ${relPath}（自 ${__dirname} 上溯 10 级）—— 本锁的前置已失效`)
}

function readAt (relPath) {
  return fs.readFileSync(upFind(relPath), 'utf8')
}

const coreSource = readAt(path.join('electron', 'services', 'cloud-account-core.js'))
const codeSources = ['cloud-account-sync.js', 'cloud-account-restore.js', 'cloud-account-core.js']
  .map((n) => ({ n, text: readAt(path.join('electron', 'services', n)) }))

/** 从 `KEY: 'value'` 形状的对象字面量里取 OUTCOME 全集（不 require 主进程模块，避免路径耦合） */
function outcomeValuesOf (source) {
  const block = /const OUTCOME = \{([\s\S]*?)\n\}/.exec(source)
  expect(block, '未能在 cloud-account-core.js 里定位 OUTCOME 枚举，锁本身已失效').toBeTruthy()
  return [...block[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1])
}

const zhLocale = readAt(path.join('locales', 'accounts-cloud-sync', 'zh.js'))
const enLocale = readAt(path.join('locales', 'accounts-cloud-sync', 'en.js'))

describe('云同步展示层口径锁', () => {
  const t = (key) => key
  const te = (key) => zhLocale.includes(`${key.split('.').pop()}:`)
  const model = createCloudSyncResultModel({ t, te })

  it('主进程 OUTCOME 的每个终态都有显式标签与显式样式（隐式回落即锁失效）', () => {
    const values = outcomeValuesOf(coreSource)
    // 反向：枚举本身不许被掏空，否则下面的循环空跑成真
    expect(values.length).toBeGreaterThanOrEqual(8)
    for (const outcome of values) {
      expect(model.outcomeLabel(outcome), `outcome=${outcome} 没有标签键`).not.toBe('')
      // 样式只要求**显式登记**：unchanged / uid-unavailable 这类中性终态本就该是 is-muted，
      // 未登记才会"看起来正常"但哪天默认样式一改就整片漂移。
      expect(Object.keys(model.OUTCOME_CLASS), `outcome=${outcome} 未登记样式`)
        .toContain(outcome)
    }
  })

  it('每个 OUTCOME 标签键在 zh/en 两侧都真实存在（缺一侧即渲染期回落空串）', () => {
    for (const key of Object.values(model.OUTCOME_LABEL_KEYS)) {
      const leaf = key.split('.').pop()
      expect(zhLocale, `zh 缺 ${leaf}`).toContain(`${leaf}:`)
      expect(enLocale, `en 缺 ${leaf}`).toContain(`${leaf}:`)
    }
    expect(Object.keys(model.OUTCOME_LABEL_KEYS).length).toBeGreaterThanOrEqual(8)
  })

  it('主进程源码里出现的每个语义码都在展示层登记（未登记即被误归为云端问题）', () => {
    const codes = new Set()
    for (const { text } of codeSources) {
      for (const m of text.matchAll(/'([A-Z][A-Z0-9]*_[A-Z0-9_]+)'/g)) codes.add(m[1])
    }
    expect(codes.size).toBeGreaterThanOrEqual(8)
    const unregistered = [...codes].filter((c) => model.batchErrorKeyFor(c) === '')
    expect(unregistered, `未登记码：${unregistered.join(', ')}`).toEqual([])
  })

  it('本机侧码不得解析到「云端未接受该账号」兜底句', () => {
    const localCodes = ['CREDENTIAL_LOAD_FAILED', 'CHECK_LOGIN_NO_CREDENTIAL',
      'CREDENTIAL_PERSIST_FAILED', 'ACCOUNT_CREATE_FAILED',
      'CREDENTIAL_STORE_UNAVAILABLE', 'ACCOUNT_MANAGER_UNAVAILABLE',
      // 下行恢复/冲突取云端那一份时，凭证已拿到、是本机这一侧没写成 —— 同样不得算到云端头上
      'CREDENTIAL_APPLY_FAILED', 'RESTORE_STATUS_PERSIST_FAILED']
    for (const code of localCodes) {
      expect(model.errorKeyFor(code), `code=${code}`).not.toBe('accountsPage.cloudSyncErr.cloudFailed')
    }
  })

  it('反证：登记被摘掉时锁必须变红（而不是静默放行）', () => {
    // 本锁若对"未登记"不敏感就毫无价值，这里用一个人造码确认它真的会拒。
    expect(model.batchErrorKeyFor('TOTALLY_UNREGISTERED_CODE')).toBe('')
    expect(model.errorKeyFor('TOTALLY_UNREGISTERED_CODE')).toBe('accountsPage.cloudSyncErr.cloudFailed')
  })
})
