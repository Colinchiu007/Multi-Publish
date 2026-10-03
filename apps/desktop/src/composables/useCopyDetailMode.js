// @ts-check
/**
 * useCopyDetailMode — 发布页「文案详情态」逻辑（copy-library-detail-entry，2026-10-09）
 *
 * 从 CopyLibraryView 点击卡片经一次性 sessionStorage 载荷（copy-detail-handoff）进入发布页：
 * 预填标题/正文、记录来源元数据；collect/rewrite 来源在保存草稿或一键发布成功后
 * 回写文案库（upsertRewrite 按 fromKey 覆盖）；video/draft 来源不回写（真源分治）。
 *
 * keep-alive 语义（对抗评审 CRITICAL）：发布页被 <keep-alive> 缓存，实例跨页面存活。
 * 无载荷且 route.query.from !== 'copy-library' 时必须重置 meta/banner——
 * 否则缓存实例的旧 meta 会把用户后续无关内容的保存静默 upsert 进错误记录。
 * onMounted/onActivated 双触发时首次已消费载荷、第二次 take 为 null，
 * 故重置判定不能只看 take 结果，必须结合导航来源。
 */
import { ref } from 'vue'
import { takeCopyDetailHandoff } from '@/utils/copy-detail-handoff'
import { useCopyLibrary } from '@/composables/useCopyLibrary'

/**
 * @param {{
 *   article: Record<string, unknown>,
 *   activeMode: { value: string },
 *   route: { query?: Record<string, unknown> },
 *   t: (key: string, params?: object) => string,
 *   notifyInfo: (key: string, opts?: object) => void,
 *   saveDraft: () => Promise<{ ok: boolean, draftId: string | null }>,
 *   router: { push: (loc: object) => Promise<unknown> },
 * }} ctx
 */
export function useCopyDetailMode (ctx) {
  const { article, activeMode, route, t, notifyInfo, saveDraft, router } = ctx
  /** 来源元数据（null = 非详情模式） */
  const copyDetailMeta = ref(null)
  const showCopyDetailBanner = ref(false)
  const { upsertRewrite } = useCopyLibrary()

  /** 挂载/激活时消费载荷（读后即焚；无载荷时按导航来源决定是否重置详情态） */
  function applyCopyDetailHandoff () {
    const payload = takeCopyDetailHandoff()
    if (!payload) {
      if (route.query && route.query.from !== 'copy-library') {
        copyDetailMeta.value = null
        showCopyDetailBanner.value = false
      }
      return
    }
    copyDetailMeta.value = {
      origin: payload.origin,
      sourceId: payload.sourceId || '',
      platform: payload.platform || '',
      sourceUrl: payload.sourceUrl || '',
    }
    if (payload.title) article.title = payload.title
    if (payload.content) article.content = payload.content
    if (payload.origin === 'video') activeMode.value = 'video'
    showCopyDetailBanner.value = true
    notifyInfo('copyLibrary.detailLoadedToast', { params: { title: payload.title || t('copyLibrary.untitled') } })
  }

  /**
   * collect/rewrite 来源内容变更后回写文案库（旁路：失败静默，不阻塞保存/发布主流程）
   */
  async function syncCopyDetailToLibrary () {
    const meta = copyDetailMeta.value
    if (!meta || (meta.origin !== 'collect' && meta.origin !== 'rewrite')) return
    const content = String(article.content || '').trim()
    if (!content) return
    try {
      await upsertRewrite({
        fromKey: meta.origin + ':' + meta.sourceId,
        fromTitle: '',
        title: article.title || '',
        content,
        platform: meta.platform || '',
        sourceUrl: meta.sourceUrl || '',
      })
    } catch {
      // 文案库回写失败不阻塞发布主流程（与 RewriteView.syncHandoffToLibrary 同判据）
    }
  }

  let creatingVideo = false

  /** 【创作视频】：防重入 → 空内容告警 → 存草稿拿 draftId → 跳 /create?draft=<id> */
  async function handleCreateVideo () {
    if (creatingVideo) return
    if (!String(article.title || '').trim() && !String(article.content || '').trim()) {
      notifyInfo('publishPage.createVideoEmpty')
      return
    }
    creatingVideo = true
    try {
      const saved = await saveDraft()
      if (!saved || !saved.ok || !saved.draftId) return // 保存失败已由 saveDraft 内部提示
      await syncCopyDetailToLibrary()
      await router.push({ path: '/create', query: { draft: saved.draftId } })
    } finally {
      creatingVideo = false
    }
  }

  /** 保存草稿入口（包装）：collect/rewrite 来源保存成功后回写文案库 */
  async function onSaveDraft () {
    const saved = await saveDraft()
    if (saved && saved.ok) await syncCopyDetailToLibrary()
  }

  return {
    copyDetailMeta,
    showCopyDetailBanner,
    applyCopyDetailHandoff,
    syncCopyDetailToLibrary,
    handleCreateVideo,
    onSaveDraft,
  }
}