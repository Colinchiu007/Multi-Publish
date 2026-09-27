/**
 * useFeatureFlag.js — 运营中心 feature flag 的极薄读取 composable
 *
 * 复用既有 runtime 链路（不新建 IPC、不改主进程）：
 *   `opsCenterSyncRuntime()` → `{ code, data: { featureFlags } }`
 *   消费先例：`src/views/CreateView.vue:2703`（videoCreation.maxOutputResolution）
 *
 * 口径（docs/adr/0006-entry-gated-by-ops-feature-flag.md）：
 *   flag 缺失 / 从未同步过运营配置 / 网络不可达 / 调用抛错 → **一律按关闭**（fail-closed）。
 *   运营入口的存在性本身就是权限边界，不能"读不到就当开"。
 *
 * 真值判定只接受显式布尔真与字符串/数字 1（运营后台下发的布尔开关），
 * 其余形态（对象/数组/任意字符串）按关闭处理。
 */
import { readonly, ref } from 'vue'
import { opsCenterSyncRuntime } from '@/api/ops-center-sync'

/** 账号管理页【同步云端】入口开关键（PRD §3 前置条件表） */
export const FEATURE_FLAG_ACCOUNT_CLOUD_SYNC = 'account_cloud_sync'

/** flag 值 → 布尔（fail-closed：未知形态一律 false） */
export function isFlagEnabled (value) {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1'
  }
  return false
}

/** 开发态覆盖用的查询键（`mpFlag=<flagKey>=<1|0|true|false>`） */
export const DEV_FLAG_QUERY_KEY = 'mpFlag'

/**
 * 允许被开发态覆盖的 flag 白名单。
 *
 * 为什么收窄到白名单而不是"任何 key 都能覆盖"：`isFlagEnabled` 是全仓共用导出，未来任何
 * **能力/额度/付费**类判据都可能接进这条链路（先例：`videoCreation.maxOutputResolution`）。
 * 那条链路的入口存在性按 ADR-0006 就是权限边界，不该由一个 URL 参数决定。
 * 本通道只为**视觉门禁需要拍到开启态**的这一类界面开关服务，新增须显式登记。
 */
export const DEV_OVERRIDABLE_FLAGS = Object.freeze([FEATURE_FLAG_ACCOUNT_CLOUD_SYNC])

/** 可被覆盖的查询串位置：`search` 与 hash 内的 query 段。 */
const DEV_FLAG_PROTOCOLS = Object.freeze(['http:', 'https:'])

/**
 * 解析开发态 flag 覆盖表。
 *
 * 为什么需要它：CI 的 `QG Visual` 里没有运营中心，`account_cloud_sync` 恒按关闭 ⇒ 账号管理页
 * 命令栏的新按钮**根本不渲染**。那样的绿只证明"未开启态无回归"，不构成新按钮的视觉还原证据
 * （AGENTS.md QM-4 第 7 条：基线必须与比对环境同源，所以既不能拿本机截图当基线，也不能只在
 * 本地点开开关看一眼就算验过）。给渲染层一条 CI 可显式声明的通道，开启态才进得了同一条门禁。
 *
 * 四条边界，放宽任何一条都等于把 fail-closed 换成 fail-open：
 *  1. 只在**开发态 + http(s) 页面**生效（见 `readDevFlagSource`）。
 *  2. 只认 `1|true|0|false`，且 flagKey 必须在 `DEV_OVERRIDABLE_FLAGS` 内。写成 `=yes`、
 *     或指向白名单外的键，都**不产生覆盖**，落回运营真值 —— 不能因为"用户写了个东西"就默认放行。
 *  3. 显式 `0/false` 可以**强制关闭**（排障用），因此它能盖过运营下发的 1，这是刻意的。
 *  4. 命中覆盖时**完全不查运营中心**：视觉门禁与排障都要"声明什么就是什么"，不能取决于网络。
 *
 * @param {string} [queryText] 形如 `a=1&mpFlag=k=1` 的查询串（不含前导 `?`）
 * @returns {Map<string, boolean>} 只含被识别且被允许的项
 */
export function parseDevFlagOverrides (queryText = '') {
  const out = new Map()
  let params
  try {
    params = new URLSearchParams(String(queryText || ''))
  } catch (_) {
    return out
  }
  for (const raw of params.getAll(DEV_FLAG_QUERY_KEY)) {
    const text = String(raw || '')
    const at = text.indexOf('=')
    if (at <= 0) continue
    const flagKey = text.slice(0, at).trim()
    const value = text.slice(at + 1).trim().toLowerCase()
    if (!flagKey || !DEV_OVERRIDABLE_FLAGS.includes(flagKey)) continue
    if (value === '1' || value === 'true') out.set(flagKey, true)
    else if (value === '0' || value === 'false') out.set(flagKey, false)
    else warnIgnoredDevFlag(flagKey, text.slice(at + 1))
    // 其余形态一律忽略：没有覆盖 = 交给运营真值
  }
  return out
}

/**
 * 非法值必须出声。
 * 静默回落的后果是"我明明写了参数，截图里按钮还是没有"现场无迹可寻，而这条通道的唯一用户
 * 就是排障的人和 CI —— 他们能看到的只有控制台。只 echo 键名与字面量，不含其它上下文。
 */
function warnIgnoredDevFlag (flagKey, rawValue) {
  if (!import.meta.env.DEV) return
  const shown = /^.{0,24}$/.test(rawValue) ? rawValue : rawValue.slice(0, 24) + '…'
  console.warn(`[useFeatureFlag] ignored invalid dev flag override ${DEV_FLAG_QUERY_KEY}=${flagKey}=${shown}; accepted: 1|0|true|false`)
}

/**
 * 覆盖参数的取值来源：**每次 refresh() 现读一次**，不缓存。
 *
 * 本仓是 hash 路由（`createWebHashHistory`）⇒ 视觉用例写出的 URL 是 `<base>/#/accounts?mpFlag=…`，
 * 查询段落进 fragment，`window.location.search` 恒为空。只读 search 的那版实现在真实路由形态下
 * 永不自检通过（外部评审实测指出，已按 `location.hash` 补齐并加回归）。
 */
function readDevFlagQueryText () {
  if (typeof window === 'undefined' || !window.location) return ''
  // file: 一律拒绝：开发构建产物若被 electron-builder 以 `--dir` 形态打包并由 file:// 直开，
  // `import.meta.env.DEV` 仍是 true；线上包走 dist 恒为 false，所以**默认关闭是安全的**。
  const protocol = String(window.location.protocol || '')
  if (!DEV_FLAG_PROTOCOLS.includes(protocol)) return ''
  const search = String(window.location.search || '').replace(/^\?/, '')
  const hash = String(window.location.hash || '')
  const at = hash.indexOf('?')
  const hashQuery = at >= 0 ? hash.slice(at + 1) : ''
  return [search, hashQuery].filter(Boolean).join('&')
}

/**
 * 读取单个运营 feature flag。
 * @param {string} key flag 键
 */
export function useFeatureFlag (key) {
  const enabled = ref(false)
  const loading = ref(false)
  const resolved = ref(false)

  /** 开发态覆盖值；undefined = 本通道不表态，交给运营真值 */
  function devOverride () {
    if (!import.meta.env.DEV || !key) return undefined
    return parseDevFlagOverrides(readDevFlagQueryText()).get(key)
  }

  async function refresh () {
    if (!key) {
      enabled.value = false
      resolved.value = true
      return false
    }
    const override = devOverride()
    if (override !== undefined) {
      enabled.value = override
      resolved.value = true
      return override
    }
    loading.value = true
    try {
      const runtime = await opsCenterSyncRuntime()
      const flags = runtime && runtime.code === 0 ? runtime.data?.featureFlags : null
      enabled.value = flags ? isFlagEnabled(flags[key]) : false
    } catch (_) {
      // 运营配置不可达：按关闭处理，不提示（入口隐藏即可，无用户可感知失败路径）
      enabled.value = false
    } finally {
      loading.value = false
      resolved.value = true
    }
    return enabled.value
  }

  return {
    enabled: readonly(enabled),
    loading: readonly(loading),
    resolved: readonly(resolved),
    refresh,
  }
}

export default useFeatureFlag
