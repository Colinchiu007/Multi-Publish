/**
 * useOpsCenterSync.js — 运营后台同步 composable
 *
 * 职责：
 *   - 加载/保存运营后台同步配置（URL、API Key、自动同步开关）
 *   - 手动触发「立即同步」（先持久化当前表单再拉取下发）并回显结果
 *   - 暴露 lastSyncedAt，供模型设置页把限流/模型字段转为只读
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { opsCenterSyncGet, opsCenterSyncSave, opsCenterSyncNow } from '@/api/ops-center-sync'
import { formatUserError } from '@/utils/user-facing-error'

export function useOpsCenterSync () {
  // ─── 状态 ─────────────────────────────────────
  const syncUrl = ref('')
  const syncApiKey = ref('')
  const syncApiKeyConfigured = ref(false)
  const syncAutoSync = ref(true)
  const lastSyncedAt = ref('')
  const syncing = ref(false)
  const syncStatus = ref('')      // 成功/提示文案
  const syncError = ref('')       // 错误文案（与成功互斥）

  /** 是否已配置同步（有 URL 且有 Key），驱动限流/模型只读 */
  const syncConfigured = ref(false)

  function applyConfig (cfg) {
    if (!cfg) return
    syncUrl.value = cfg.url || ''
    syncApiKeyConfigured.value = !!cfg.apiKeyConfigured
    syncAutoSync.value = cfg.autoSync !== false
    lastSyncedAt.value = cfg.lastSyncedAt || ''
    syncConfigured.value = !!(cfg.url && cfg.apiKeyConfigured)
  }

  function formatLastSync (iso) {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('zh-CN', { hour12: false })
  }

  /** 从主进程加载配置 */
  async function loadSyncConfig () {
    const res = await opsCenterSyncGet()
    if (res.code === 0 && res.config) {
      syncApiKey.value = ''
      applyConfig(res.config)
    }
    return res
  }

  /** 保存配置（apiKey 留空 = 保留现有 Key） */
  async function saveSyncConfig () {
    const res = await opsCenterSyncSave({
      url: syncUrl.value,
      apiKey: syncApiKey.value,
      autoSync: syncAutoSync.value,
    })
    if (res.code === 0) {
      ElMessage.success('运营后台同步配置已保存')
      syncApiKey.value = ''
      applyConfig(res.config)
    } else {
      ElMessage.error(formatUserError(res, { fallback: '保存同步配置失败' }).message)
    }
    return res
  }

  /** 立即同步：先持久化当前表单 → 拉取目录 → 下发到本地模型配置 */
  async function runSyncNow () {
    if (syncing.value) return null
    syncing.value = true
    syncStatus.value = ''
    syncError.value = ''
    try {
      // 用户可能未点「保存配置」直接点「立即同步」：先用当前表单保存
      const saved = await opsCenterSyncSave({
        url: syncUrl.value,
        apiKey: syncApiKey.value,
        autoSync: syncAutoSync.value,
      })
      if (saved.code !== 0) {
        syncError.value = formatUserError(saved, { fallback: '保存同步配置失败，无法同步' }).message
        ElMessage.error(syncError.value)
        return saved
      }
      syncApiKey.value = ''
      applyConfig(saved.config)

      const res = await opsCenterSyncNow()
      if (res.code === 0) {
        syncStatus.value = `同步成功：更新 ${res.updated || 0} 个服务商（${formatLastSync(res.syncedAt)}）`
        lastSyncedAt.value = res.syncedAt || ''
        ElMessage.success(syncStatus.value)
      } else {
        syncError.value = formatUserError(res, { fallback: '同步失败' }).message
        ElMessage.error(syncError.value)
      }
      return res
    } catch (e) {
      syncError.value = formatUserError(e, { fallback: '同步异常' }).message
      ElMessage.error(syncError.value)
      return { code: -1, message: syncError.value }
    } finally {
      syncing.value = false
    }
  }

  return {
    syncUrl,
    syncApiKey,
    syncApiKeyConfigured,
    syncAutoSync,
    lastSyncedAt,
    syncing,
    syncStatus,
    syncError,
    syncConfigured,
    formatLastSync,
    loadSyncConfig,
    saveSyncConfig,
    runSyncNow,
  }
}
