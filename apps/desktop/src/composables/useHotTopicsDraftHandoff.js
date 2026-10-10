// @ts-check
/**
 * useHotTopicsDraftHandoff —— 热门选题「改写产物 → 发布页批量条目」的交接（2026-10-09）
 *
 * ## 为什么单独成模块
 * 交接是一块自洽的状态机（解析 → 装载 → 幂等记账 → 预置发布目标），Publish.vue 已进入
 * 「点名还账」清单（零增长容差），把这块留在视图里既拖长文件也让视图承担非视图逻辑。
 * 视图只保留三处触发点（onMounted / onActivated / watch query）。
 *
 * ## 语义要点（每条都对应一次实测踩坑）
 * 1. 幂等键 = **本批已装载的 id 串**，不是布尔：发布页被 keep-alive 缓存，`onActivated`
 *    每次激活都跑；布尔会二选一踩坑——新一轮交接不装载，或切回来把用户编辑回滚。
 * 2. 全部未命中时**不记账**：草稿被删/换 profile 后，用户回选题页重新生成再交接仍要能用。
 * 3. 预置平台的真源是**账号目录**而不是平台目录：平台目录在冷重载时可能尚未就绪，
 *    只读目录会预置出空目标（批量区变成「0 个任务」的不可用态）。
 * 4. 账号必须与平台一起写入：`validatePublishTargets` 对「选了平台没选账号」直接判无效。
 */
import { computed, ref, watch } from 'vue'
import { selectHandoffPresetPlatforms } from './useBatchPublish'

/** 交接上限：防异常超长 query 拖垮渲染（超出部分丢弃） */
export const HANDOFF_DRAFT_LIMIT = 50

/**
 * 解析 `?drafts=` 交接参数：支持字符串/数组，去空白、去重、限量。
 * 非法入参（undefined/null/数字/空串）一律解析为空集合。
 * @param {unknown} value
 * @returns {string[]}
 */
export function parseHandoffDraftIds (value) {
  const raw = Array.isArray(value) ? value.join(',') : (typeof value === 'string' ? value : '')
  return [...new Set(raw.split(',').map(id => id.trim()).filter(Boolean))].slice(0, HANDOFF_DRAFT_LIMIT)
}

/**
 * @param {object} options
 * @param {object} options.route vue-router 当前路由（读 query.drafts）
 * @param {import('vue').Ref<Array>} options.drafts 草稿列表
 * @param {Function} options.loadDrafts 拉取草稿列表
 * @param {Function} options.seedArticlesFromDrafts 装载条目（useBatchPublish）
 * @param {Function} options.applyTargetsToAll 批量写发布目标（useBatchPublish）
 * @param {import('vue').Ref<boolean>} options.batchMode 批量模式开关
 * @param {object} options.accountStore 账号 store（byPlatform）
 * @param {import('vue').Ref<Array>} options.platforms 平台目录
 * @param {Function} options.getAccounts 平台 → 账号列表
 * @param {Function} options.getDefaultAccount 平台 → 默认账号
 * @param {Function} options.loadAccounts 确保账号目录就绪（ensureLoaded，幂等）
 * @param {Function} options.notifySuccess 成功提示（key, { params }）
 * @param {Function} options.notifyWarning 警告提示（key, { params }）
 */
export function useHotTopicsDraftHandoff (options) {
  const {
    route, drafts, loadDrafts, seedArticlesFromDrafts, applyTargetsToAll,
    batchMode, accountStore, platforms, getAccounts, getDefaultAccount, loadAccounts,
    notifySuccess, notifyWarning,
  } = options

  /** 本批已装载的 id 串（幂等键；空串 = 尚未装载） */
  const handoffAppliedKey = ref('')
  /** 批量工具条已勾选的平台（交接时预置为全部可发布平台，用户可增减） */
  const batchTargetPlatforms = ref([])

  /** 可发布平台 = 平台目录里有账号的平台（无账号平台勾上了也过不了提交校验） */
  const handoffPlatformOptions = computed(() => platforms.value.filter(p => getAccounts(p.id).length > 0))

  /** 平台 + **各平台默认账号**：账号必须一起给，否则提交时判「请为<平台>选择至少一个账号」 */
  function buildDefaultTargets (platformIds) {
    const accounts = {}
    for (const platformId of platformIds) {
      const def = getDefaultAccount(platformId)
      if (def) accounts[platformId] = [def.id]
    }
    return { platforms: platformIds, accounts }
  }

  function applyBatchTargetsToAll () {
    const applied = applyTargetsToAll(buildDefaultTargets(batchTargetPlatforms.value))
    if (applied === 0) return 0
    notifySuccess('publishPage.batchTargets.applied', { params: { count: applied } })
    return applied
  }

  /**
   * 把一批草稿装载为批量条目。
   * @param {unknown} draftIds
   * @returns {Promise<number>} 实际装载条数（0 = 未装载，调用方据此留在原地）
   */
  async function applyDraftHandoff (draftIds) {
    const ids = Array.isArray(draftIds) ? draftIds : []
    if (ids.length === 0) return 0
    const key = ids.join(',')
    if (key === handoffAppliedKey.value) return 0
    await loadDrafts()
    const byId = new Map(drafts.value.map(draft => [String(draft && draft.id), draft]))
    const found = ids.map(id => byId.get(id)).filter(Boolean)
    if (found.length === 0) {
      // 全失效：如实提示且**不记账**（用户回选题页重新生成后仍能交接）
      notifyWarning('publishPage.handoff.none')
      return 0
    }
    handoffAppliedKey.value = key
    batchMode.value = true
    seedArticlesFromDrafts(found)
    // 账号目录必须在本函数内确保就绪：hash 路由首次写入 query 会先触发 watch，
    // 那时 onMounted 的 await loadAccounts() 还没跑完 ⇒ 按账号推导会得到空集。
    await loadAccounts()
    const targetPlatformIds = buildPresetPlatformIds()
    batchTargetPlatforms.value = targetPlatformIds
    if (targetPlatformIds.length > 0) applyTargetsToAll(buildDefaultTargets(targetPlatformIds))
    if (found.length < ids.length) {
      notifyWarning('publishPage.handoff.partial', { params: { loaded: found.length, total: ids.length } })
    } else {
      notifySuccess('publishPage.handoff.loaded', { params: { count: found.length } })
    }
    return found.length
  }

  /**
   * 预置平台 id：真源是账号目录（账号 = 能不能发），平台目录就绪时再求交，
   * 排除账号数据里残留的已下线平台。判定实现与 useBatchPublish 共用同一份纯函数。
   */
  function buildPresetPlatformIds () {
    return selectHandoffPresetPlatforms(
      accountStore.byPlatform?.value || accountStore.byPlatform,
      handoffPlatformOptions.value.map(p => p.id),
    )
  }

  /** 当前 URL 上的交接 id（无则空集合） */
  function handoffIdsFromQuery () {
    return parseHandoffDraftIds(route.query && route.query.drafts)
  }

  // query 变化即交接（覆盖「同页换一批 id」与 hash 路由首次写入 query 的时序）
  watch(() => route.query.drafts, async (value) => {
    const ids = parseHandoffDraftIds(value)
    if (ids.length === 0) return
    await applyDraftHandoff(ids)
  })

  return {
    handoffAppliedKey,
    batchTargetPlatforms,
    handoffPlatformOptions,
    buildDefaultTargets,
    applyBatchTargetsToAll,
    applyDraftHandoff,
    handoffIdsFromQuery,
    parseHandoffDraftIds,
  }
}
