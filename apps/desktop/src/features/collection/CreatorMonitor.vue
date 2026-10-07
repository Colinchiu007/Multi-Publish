<script setup>
/**
 * CreatorMonitor.vue —「博主监控」tab
 *
 * 两个列表：
 *   · 博主列表：关注状态、能力徽章、待采集角标、暂停/恢复、立即检查
 *   · 发现列表：新作品、内容质量徽章、单条采集、送入 AI 写作
 *
 * 交互上的三条硬规则（与主进程一致，此处只做呈现）：
 *   1. 超限时**弹提示**，不静默截断；采集成功后若有剩余 MUST 告知剩余数
 *   2. 已采集项按钮置灰并显示时间 —— 状态持久，刷新不丢
 *   3. 单条采集零填参；批量走默认数量（一键 5 / 手动 50）
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()

const creators = ref([])
const totalPending = ref(0)
const loading = ref(false)
const collecting = ref(false)
const activeCreatorId = ref(null)
const discoveries = ref([])
const discovering = ref(false)
const degraded = ref('')

/** 取 IPC 桥。preload 可能尚未就绪或方法缺失——此时 MUST 给出明确降级态，
 *  而不是让 onMounted 抛出未捕获异常（那会变成「静默白屏 + 控制台报错」）。 */
function api () {
  const bridge = globalThis.electronAPI
  if (!bridge || typeof bridge.creatorList !== 'function') return null
  return bridge
}

/** 统一吞掉调用期异常并转成降级提示；调用方不需要各自 try/catch */
async function call (fnName, payload) {
  const bridge = api()
  if (!bridge || typeof bridge[fnName] !== 'function') {
    degraded.value = t('collection.creatorErrDependencyMissing', { command: '' })
    return null
  }
  try {
    return await bridge[fnName](payload)
  } catch (e) {
    degraded.value = (e && e.message) || t('collection.creatorErrCollectFailed', { message: '' })
    return null
  }
}

/** IPC 统一返回 { code, reason, message }；非 0 一律走错误分支，
 *  绝不在前端凭「没抛异常」当作成功——降级返回也长这样。 */
function failFast (r) {
  if (r === null) return true          // 调用层已置降级态
  if (!r || r.code !== 0) {
    const reason = r && r.reason
    if (reason === 'service-unavailable') {
      degraded.value = t('collection.creatorErrDependencyMissing', { command: '' })
      return true
    }
    ElMessage.error((r && r.message) || t('collection.creatorErrCollectFailed', { message: '' }))
    return true
  }
  return false
}

async function loadCreators () {
  loading.value = true
  try {
    const r = await call('creatorList')
    if (failFast(r)) return
    creators.value = r.items || []
    totalPending.value = r.totalPending || 0
    degraded.value = ''
    if (!activeCreatorId.value && creators.value.length) {
      activeCreatorId.value = creators.value[0].id
      await loadDiscoveries()
    }
  } finally {
    loading.value = false
  }
}

async function loadDiscoveries () {
  if (!activeCreatorId.value) { discoveries.value = []; return }
  discovering.value = true
  try {
    const r = await call('creatorDiscoveries', { creatorId: activeCreatorId.value, state: 'pending' })
    if (failFast(r)) return
    discoveries.value = r.items || []
  } finally {
    discovering.value = false
  }
}

async function addCreator () {
  const input = window.prompt(t('collection.creatorAddPlaceholder'))
  if (!input || !input.trim()) return
  const r = await call('creatorFollow', { input: input.trim() })
  if (failFast(r)) return
  ElMessage.success(t('collection.creatorAddSubmit'))
  activeCreatorId.value = r.creator && r.creator.id
  await loadCreators()
}

async function unfollow (c) {
  await ElMessageBox.confirm(t('collection.creatorUnfollow'), '', { type: 'warning' })
  const r = await call('creatorUnfollow', { followId: c.follow_id || c.id })
  if (failFast(r)) return
  await loadCreators()
}

async function togglePause (c) {
  const r = await call('creatorToggle', { followId: c.follow_id || c.id, enabled: !c.enabled })
  if (failFast(r)) return
  await loadCreators()
}

async function checkNow (c) {
  const r = await call('creatorCheckNow', { followId: c.follow_id || c.id })
  if (failFast(r)) return
  ElMessage.success(t('collection.creatorBatchSuccess', { collected: r.inserted || 0 }))
  await loadCreators()
  await loadDiscoveries()
}

/** 一键采集：默认数量由主进程决定（oneClick=5），超限时主进程拒绝并回 max */
async function collectAll () {
  if (!activeCreatorId.value) return
  const c = creators.value.find(x => x.id === activeCreatorId.value)
  collecting.value = true
  try {
    const r = await call('creatorCollect', { followId: (c && (c.follow_id || c.id)) })
    if (r && r.code === -10) {
      ElMessage.warning(t('collection.creatorErrCountExceedsLimit', { max: r.max }))
      return
    }
    if (failFast(r)) return
    ElMessage.success(t('collection.creatorBatchSuccess', { collected: r.collected || 0 }))
    // MUST 告知剩余，不静默截断
    if (r.truncated && r.remain > 0) {
      ElMessage.info(t('collection.creatorTruncated', {
        found: r.available, collected: r.collected, remain: r.remain,
      }))
    }
    await loadCreators()
    await loadDiscoveries()
  } finally {
    collecting.value = false
  }
}

/** 单条采集：零填参，不受数量上限约束 */
async function collectOne (d) {
  const r = await call('creatorCollectOne', { discoveryId: d.id })
  if (failFast(r)) return
  ElMessage.success(t('collection.creatorBatchSuccess', { collected: 1 }))
  await loadCreators()
  await loadDiscoveries()
}

const hasDiscoveries = computed(() => discoveries.value.length > 0)

onMounted(loadCreators)
defineExpose({ loadCreators, loadDiscoveries })
</script>

<template>
  <div class="creator-monitor" data-testid="creator-monitor">
    <div v-if="degraded" class="creator-degraded" data-testid="creator-degraded">
      {{ degraded }}
    </div>

    <!-- 博主列表 -->
    <section class="creator-panel">
      <header class="creator-panel-head">
        <h3>{{ $t('collection.creatorListTitle') }}</h3>
        <button class="cohere-btn-secondary" data-testid="creator-add" @click="addCreator">
          {{ $t('collection.creatorAddSubmit') }}
        </button>
      </header>

      <p v-if="!loading && creators.length === 0" class="creator-empty" data-testid="creator-empty">
        <strong>{{ $t('collection.creatorEmptyTitle') }}</strong>
        <span>{{ $t('collection.creatorEmptyDesc') }}</span>
      </p>

      <ul v-else class="creator-list" data-testid="creator-list">
        <li
          v-for="c in creators"
          :key="c.id"
          class="creator-item"
          :class="{ active: c.id === activeCreatorId, disabled: c.enabled === 0 }"
          :data-testid="'creator-item-' + c.id"
          @click="activeCreatorId = c.id; loadDiscoveries()"
        >
          <img v-if="c.avatar_url" class="creator-avatar" :src="c.avatar_url" alt="" />
          <div class="creator-meta">
            <span class="creator-name">{{ c.display_name || c.external_id }}</span>
            <span class="creator-badge" :data-tier="c.capability_tier">
              {{ $t('collection.creatorCap' + (c.capability_tier === 'official' ? 'Official'
                : c.capability_tier === 'unsupported' ? 'Unsupported' : 'BestEffort')) }}
            </span>
            <span v-if="c.status === 'fatal_paused' || c.status === 'auto_paused'" class="creator-paused">
              {{ $t(c.status === 'fatal_paused' ? 'collection.creatorFatalPaused' : 'collection.creatorAutoPaused',
                     { times: c.consecutive_failures || 0, reason: c.paused_reason || '' }) }}
            </span>
          </div>
          <span v-if="c.pendingCount > 0" class="creator-badge-num" data-testid="creator-pending">
            {{ $t('collection.creatorPendingBadge', { count: c.pendingCount }) }}
          </span>
          <div class="creator-actions" @click.stop>
            <button data-testid="creator-check-now" @click="checkNow(c)">
              {{ $t('collection.creatorCheckNow') }}
            </button>
            <button data-testid="creator-toggle" @click="togglePause(c)">
              {{ $t(c.enabled === 0 ? 'collection.creatorResume' : 'collection.creatorPause') }}
            </button>
            <button data-testid="creator-unfollow" @click="unfollow(c)">
              {{ $t('collection.creatorUnfollow') }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- 发现列表 -->
    <section class="creator-panel">
      <header class="creator-panel-head">
        <h3>{{ $t('collection.creatorTab') }}</h3>
        <button
          class="cohere-btn-primary"
          data-testid="creator-collect-all"
          :disabled="collecting || !hasDiscoveries"
          @click="collectAll"
        >
          {{ collecting ? '…' : $t('collection.creatorCollectNew') }}
        </button>
      </header>

      <p v-if="!discovering && discoveries.length === 0" class="creator-empty" data-testid="creator-no-new">
        {{ $t('collection.creatorNoNewWorks', { interval: '60' }) }}
      </p>

      <ul v-else class="creator-discoveries" data-testid="creator-discoveries">
        <li v-for="d in discoveries" :key="d.id" class="creator-discovery" :data-testid="'discovery-' + d.id">
          <img v-if="d.thumbnail_url" class="creator-thumb" :src="d.thumbnail_url" alt="" />
          <div class="creator-meta">
            <span class="creator-title">{{ d.title }}</span>
            <span class="creator-quality" :data-quality="d.content_quality">
              {{ $t(d.content_quality === 'full' ? 'collection.creatorQualityFull'
                 : d.content_quality === 'partial' ? 'collection.creatorQualityPartial'
                 : 'collection.creatorQualityStub') }}
            </span>
          </div>
          <div class="creator-actions">
            <button
              v-if="d.collect_state === 'pending'"
              data-testid="creator-collect-one"
              @click="collectOne(d)"
            >
              {{ $t('collection.creatorCollectOne') }}
            </button>
            <span v-else class="creator-collected" data-testid="creator-collected">
              {{ $t('collection.creatorCollectedAt', { time: d.collected_at || '' }) }}
            </span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.creator-monitor { display: flex; flex-direction: column; gap: 16px; }
.creator-panel { border: 1px solid var(--border, #e5e7eb); border-radius: 8px; padding: 12px; }
.creator-panel-head { display: flex; justify-content: space-between; align-items: center; }
.creator-list, .creator-discoveries { list-style: none; margin: 8px 0 0; padding: 0; }
.creator-item, .creator-discovery { display: flex; gap: 12px; align-items: center; padding: 8px; border-bottom: 1px solid var(--border, #f3f4f6); cursor: pointer; }
.creator-item.active { background: var(--el-fill-color-light, #f5f7fa); }
.creator-item.disabled { opacity: 0.6; }
.creator-avatar, .creator-thumb { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
.creator-meta { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.creator-name, .creator-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.creator-badge, .creator-quality, .creator-badge-num, .creator-collected { font-size: 12px; }
.creator-paused { color: var(--el-color-danger, #f56c6c); font-size: 12px; }
.creator-degraded { padding: 8px; border: 1px solid var(--el-color-warning, #e6a23c); border-radius: 4px; }
.creator-empty { display: flex; flex-direction: column; gap: 4px; color: var(--el-text-color-secondary, #909399); }
.creator-actions { display: flex; gap: 8px; }
</style>