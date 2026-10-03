// @ts-check
/**
 * useCollectionBatchPublish — 采集页批量动作 composable（2026-10-03）
 *
 * PRD-ZHIHU-FAV-BATCH-2026-10-03 §3.4/§3.5/§3.6：
 *  - 采集结果多选（全来源通用，Q17B）
 *  - 批量发布图文：校验 → 确认框（条数×平台×账号 + 原文回退计数，Q20A/Q26C）→
 *    batchCreate/batchExecute → publishProgress.registerSession（App 级面板，Q27B）
 *  - 批量生成视频：≤10（D7/Q30A）、视频型跳过、story2videoBatchCreate
 *  - 批量发布视频：仅「本批」已完成产物（D7/Q22A），video_path 载荷，30min 超时主进程契约
 *  - 平台预筛（D8）：按 platformStore.getContentCategory 过滤 VIDEO/MIXED
 *  - 本批视频池：trackBatch 记批次 → refreshBatchVideos 单次解析 status→run context→videoPath
 *
 * 依赖全部注入（notify/platformStore/accountStore），零单例 import 便于测试与复用。
 */
import { ref, computed } from 'vue'
import { getAppLocale } from '@/i18n'
import {
  batchCreate, batchExecute,
  story2videoBatchCreate, story2videoBatchStatus,
  pipelineGetRunContext,
} from '@/api/publisher'
import { usePublishProgressStore } from '@/stores/publishProgress'
import { useLoginGate } from '@/composables/useLoginGate'
import { resolveNotifyText } from '@/utils/notifyCore'
import { buildBatchArticles, countOriginalFallback, usablePlatformIds } from '@/features/collection/collection-batch'

/** 单批视频生成上限（对齐 story2video-batch-queue BATCH_MAX_TEXTS） */
const VIDEO_GEN_CAP = 10

function defaultNotify () {
  // 延迟 require：避免测试环境 element-plus 初始化时序问题
  // eslint-disable-next-line global-require
  const { useNotify } = require('@/composables/useNotify')
  return useNotify()
}

/** i18n 文案读取（键不存在时回退 key 本身，便于断言与兜底） */
function t (key, params) {
  return resolveNotifyText(key, params).text || key
}

/**
 * @param {object} [opts]
 * @param {object} [opts.platformStore] - stores/platforms 实例（platforms + getContentCategory）
 * @param {object} [opts.accountStore] - stores/accounts 实例（byPlatform）
 * @param {object} [opts.notify] - { confirm, success, warning, error }（测试注入）
 */
export function useCollectionBatchPublish (opts = {}) {
  const platformStore = opts.platformStore || null
  const accountStore = opts.accountStore || null
  const notify = opts.notify || defaultNotify()
  const publishProgressStore = usePublishProgressStore()
  const { ensureLogin } = useLoginGate()

  // ── 多选状态（Q17B：全来源通用）──
  const selectedIds = ref(new Set())
  function isSelected (id) { return selectedIds.value.has(id) }
  function toggleSelect (item) {
    if (!item || !item.id) return
    const s = new Set(selectedIds.value)
    if (s.has(item.id)) s.delete(item.id)
    else s.add(item.id)
    selectedIds.value = s
  }
  function selectMany (items, on) {
    const s = new Set(selectedIds.value)
    for (const it of Array.isArray(items) ? items : []) {
      if (!it || !it.id) continue
      if (on) s.add(it.id)
      else s.delete(it.id)
    }
    selectedIds.value = s
  }
  function clearSelection () { selectedIds.value = new Set() }
  const selectedCount = computed(() => selectedIds.value.size)
  function selectedFrom (items) {
    return (Array.isArray(items) ? items : []).filter((it) => it && it.id && selectedIds.value.has(it.id))
  }

  // ── 平台预筛（D8）──
  function usablePlatforms (kind) {
    const ps = platformStore && Array.isArray(platformStore.platforms) ? platformStore.platforms : []
    const catalog = ps.map((p) => ({
      id: p.id,
      contentCategory: typeof platformStore.getContentCategory === 'function'
        ? platformStore.getContentCategory(p.id)
        : (p.contentCategory || 'IMAGE_TEXT'),
    }))
    const ids = usablePlatformIds(kind === 'video' ? 'video' : 'imageText', catalog)
    return ps.filter((p) => ids.includes(p.id))
  }

  // ── 批量发布的目标选择状态（按形态分离：图文/视频平台清单不同，D8）──
  const batchSelection = ref({
    imageText: { platforms: [], accounts: {} },
    video: { platforms: [], accounts: {} },
  })
  function toggleBatchAccount (kind, platformId, accountId) {
    const slot = batchSelection.value[kind]
    if (!slot) return
    const cur = slot.accounts[platformId] || []
    const next = cur.includes(accountId) ? cur.filter((a) => a !== accountId) : [...cur, accountId]
    slot.accounts = { ...slot.accounts, [platformId]: next }
    batchSelection.value = { ...batchSelection.value }
  }
  function isBatchAccountSelected (kind, platformId, accountId) {
    const slot = batchSelection.value[kind]
    return Boolean(slot && (slot.accounts[platformId] || []).includes(accountId))
  }
  /** 展开平台×账号（对齐 publish-contract.buildPublishTargets 语义） */
  function buildTargets (kind) {
    const slot = batchSelection.value[kind]
    if (!slot) return []
    const out = []
    for (const pid of slot.platforms) {
      const accs = slot.accounts[pid] || []
      if (accs.length) {
        for (const a of accs) out.push({ platform: pid, accountId: a })
      } else {
        out.push({ platform: pid, accountId: null })
      }
    }
    return out
  }
  function countAccounts (kind) {
    const slot = batchSelection.value[kind]
    if (!slot) return 0
    return Object.values(slot.accounts).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0)
  }

  // ── 本批视频池（D7：仅本批产物可发布）──
  const trackedBatchIds = ref([])
  const batchVideoPool = ref([])
  function trackBatch (batchId) {
    if (batchId && !trackedBatchIds.value.includes(batchId)) {
      trackedBatchIds.value = [...trackedBatchIds.value, batchId]
    }
  }
  /**
   * 解析本批已完成视频：story2videoBatchStatus → completed 项 → run context 提取 videoPath。
   * @returns {Promise<Array<{projectId?:string, runId:string, videoPath:string, title:string}>>}
   */
  async function refreshBatchVideos () {
    if (!trackedBatchIds.value.length) return []
    try {
      const res = await story2videoBatchStatus()
      const batches = (res && res.code === 0 && Array.isArray(res.data)) ? res.data : []
      const mine = batches.filter((b) => trackedBatchIds.value.includes(b && b.id))
      const pool = []
      for (const b of mine) {
        for (const it of (b && Array.isArray(b.items)) ? b.items : []) {
          if (!it || it.status !== 'completed' || !it.runId) continue
          let videoPath = null
          try {
            const snap = await pipelineGetRunContext(it.runId)
            const ctx = snap && snap.code === 0 ? snap.data && snap.data.context : null
            const compose = ctx && ctx.compose
            videoPath = (compose && (compose.videoPath || compose.path)) || null
          } catch { /* 单项解析失败跳过 */ }
          if (videoPath) pool.push({ runId: it.runId, videoPath, title: it.label || '', projectId: it.projectId })
        }
      }
      batchVideoPool.value = pool
      return pool
    } catch {
      return batchVideoPool.value
    }
  }

  /** 确认消息组装（条数×平台×账号 + 附加说明；无版权文案，Q5C/Q20A） */
  function buildConfirmMessage ({ count, platformCount, accountCount, notes }) {
    const lines = [t('collection.batch.confirmBody', { count: String(count), platforms: String(platformCount), accounts: String(accountCount) })]
    for (const n of notes || []) if (n) lines.push(n)
    return lines.join('\n')
  }

  // ── 批量发布图文（§3.4）──
  async function confirmAndPublishImages (items) {
    if (!Array.isArray(items) || !items.length) {
      notify.warning('collection.batch.noSelection')
      return false
    }
    const targets = buildTargets('imageText')
    if (!targets.length) {
      notify.warning('collection.batch.needAccount')
      return false
    }
    const ok = await notify.confirm('collection.batch.confirmTitle', {
      title: t('collection.batch.confirmTitle'),
      message: buildConfirmMessage({
        count: items.length,
        platformCount: batchSelection.value.imageText.platforms.length,
        accountCount: countAccounts('imageText'),
        notes: [countOriginalFallback(items) > 0 ? t('collection.batch.originalFallbackNote', { count: String(countOriginalFallback(items)) }) : ''],
      }),
    })
    if (!ok) return false
    await ensureLogin()
    const articles = buildBatchArticles(items)
    try {
      const createRes = await batchCreate({
        name: t('collection.batch.namePrefix') + new Date().toLocaleDateString('zh-CN'),
        articles,
      })
      if (!createRes || createRes.code !== 0 || !createRes.data || !createRes.data.id) {
        throw new Error((createRes && createRes.message) || t('collection.batch.createFailed'))
      }
      const batchId = createRes.data.id
      publishProgressStore.registerSession({ batchId, title: t('collection.batch.sessionTitle', { count: String(items.length) }) })
      const exRes = await batchExecute(batchId)
      if (!exRes || exRes.code !== 0) {
        throw new Error((exRes && exRes.message) || t('collection.batch.executeFailed'))
      }
      notify.success('collection.batch.publishStarted')
      clearSelection()
      return true
    } catch (e) {
      notify.error(String((e && e.message) || e))
      return false
    }
  }

  // ── 批量生成视频（§3.5）──
  function buildS2vTemplate () {
    // 受控默认：与 CreateView 批量创作模板同语义（全自动 + 纯图片轮播），不在采集页暴露全量表单
    return {
      version: 1,
      mode: 'text',
      creation: { mode: 'auto', materialMode: 'all-images' },
      video: { mode: 'off' },
    }
  }

  async function confirmAndGenerateVideos (items) {
    if (!Array.isArray(items) || !items.length) {
      notify.warning('collection.batch.noSelection')
      return false
    }
    const { imageText } = groupKinds(items)
    if (!imageText.length) {
      notify.warning('collection.batch.noImagePlatforms')
      return false
    }
    if (imageText.length > VIDEO_GEN_CAP) {
      notify.warning('collection.batch.videoGenCap')
      return false
    }
    const ok = await notify.confirm('collection.batch.confirmTitle', {
      title: t('collection.batch.confirmTitle'),
      message: buildConfirmMessage({
        count: imageText.length,
        platformCount: 0,
        accountCount: 0,
        notes: [
          items.length !== imageText.length ? t('collection.batch.videoSkipNote', { count: String(items.length - imageText.length) }) : '',
        ],
      }),
    })
    if (!ok) return false
    const texts = buildBatchArticles(imageText).map((a) => a.content).filter(Boolean)
    if (!texts.length) {
      notify.warning('collection.batch.noSelection')
      return false
    }
    try {
      const res = await story2videoBatchCreate({
        mode: 'text',
        texts,
        story2videoTextConfigTemplate: buildS2vTemplate(),
        uiLocale: getAppLocale(),
      })
      if (!res || res.code !== 0 || !res.data || !res.data.batchId) {
        throw new Error((res && res.message) || t('collection.batch.createFailed'))
      }
      trackBatch(res.data.batchId)
      notify.success('collection.batch.videoGenStarted')
      return true
    } catch (e) {
      notify.error(String((e && e.message) || e))
      return false
    }
  }

  // ── 批量发布视频（§3.6：仅本批产物）──
  async function confirmAndPublishVideos () {
    const pool = batchVideoPool.value
    if (!pool.length) {
      notify.warning('collection.batch.noVideosInBatch')
      return false
    }
    const targets = buildTargets('video')
    if (!targets.length) {
      notify.warning('collection.batch.needAccount')
      return false
    }
    const ok = await notify.confirm('collection.batch.confirmTitle', {
      title: t('collection.batch.confirmTitle'),
      message: buildConfirmMessage({
        count: pool.length,
        platformCount: batchSelection.value.video.platforms.length,
        accountCount: countAccounts('video'),
        notes: [],
      }),
    })
    if (!ok) return false
    await ensureLogin()
    const articles = pool.map((v) => ({
      title: v.title || t('collection.batch.publishVideos'),
      content: '',
      video_path: v.videoPath,
      cover_url: '',
      coverImage: '',
      images: [],
      sourceUrl: '',
    }))
    try {
      const createRes = await batchCreate({
        name: t('collection.batch.videoNamePrefix') + new Date().toLocaleDateString('zh-CN'),
        articles,
      })
      if (!createRes || createRes.code !== 0 || !createRes.data || !createRes.data.id) {
        throw new Error((createRes && createRes.message) || t('collection.batch.createFailed'))
      }
      const batchId = createRes.data.id
      publishProgressStore.registerSession({ batchId, title: t('collection.batch.videoSessionTitle', { count: String(pool.length) }) })
      const exRes = await batchExecute(batchId)
      if (!exRes || exRes.code !== 0) {
        throw new Error((exRes && exRes.message) || t('collection.batch.executeFailed'))
      }
      notify.success('collection.batch.publishStarted')
      return true
    } catch (e) {
      notify.error(String((e && e.message) || e))
      return false
    }
  }

  return {
    // 多选
    selectedIds, isSelected, toggleSelect, selectMany, clearSelection, selectedCount, selectedFrom,
    // 平台（按形态分离的选择状态 + 预筛清单）
    usablePlatforms, batchSelection, toggleBatchAccount, isBatchAccountSelected, buildTargets,
    // 本批视频池
    trackBatch, refreshBatchVideos, batchVideoPool,
    // 三个批量动作
    confirmAndPublishImages, confirmAndGenerateVideos, confirmAndPublishVideos,
  }
}

/** 内部：按 kind 分组（与 collection-batch.groupItemsByKind 同语义；避免循环 import 而本地实现） */
function groupKinds (items) {
  const imageText = []
  const videoOnly = []
  for (const it of Array.isArray(items) ? items : []) {
    if (it && it.kind === 'video') videoOnly.push(it)
    else imageText.push(it)
  }
  return { imageText, videoOnly }
}
