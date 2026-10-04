<template>
  <section class="cohere-card dash-panel perf-flow" data-testid="perf-flow-panel">
    <div class="dash-panel-title perf-flow-header">
      <el-icon><DataLine /></el-icon>
      <span>{{ t('dashboard.metrics.title') }}</span>
      <span class="panel-subtitle">{{ t('dashboard.metrics.subtitle') }}</span>
      <span v-if="weekLabel" class="perf-flow-week" data-testid="perf-flow-week" :class="weekTone">{{ weekLabel }}</span>
    </div>

    <!-- 未登录：如实说「登录后才看得到」，不得渲染成 0（0 会被读成「没有互动」而不是「没认身份」） -->
    <p v-if="status === 'auth'" class="perf-flow-empty" data-testid="perf-flow-auth">
      {{ t('dashboard.metrics.loginRequired') }}
    </p>

    <!-- 首次取数失败：必须有出口。此前 error 态没有对应分支，界面只剩一张带标题的空卡，
         用户无从区分「没数据」和「没拿到数据」 -->
    <p v-else-if="status === 'error' && !overview" class="perf-flow-empty" data-testid="perf-flow-error">
      {{ t('dashboard.metrics.loadFailed') }}
    </p>

    <template v-else-if="overview">
      <p v-if="isEmpty" class="perf-flow-empty" data-testid="perf-flow-empty">
        <strong>{{ t('dashboard.metrics.emptyTitle') }}</strong>
        {{ t(health.trackedTotal > 0 ? 'dashboard.metrics.emptyNoSnapshot' : 'dashboard.metrics.emptyNoContent',
             { total: health.trackedTotal }) }}
      </p>

      <template v-if="!isEmpty">
        <div class="perf-flow-metrics" data-testid="perf-flow-metrics">
          <div v-for="item in metricItems" :key="item.key" class="perf-flow-metric">
            <div class="perf-flow-metric-value" :data-testid="'perf-metric-' + item.key">{{ item.value }}</div>
            <div class="perf-flow-metric-label">{{ item.label }}</div>
          </div>
        </div>

        <div class="perf-flow-sub" data-testid="perf-flow-trend">
          <div class="perf-flow-sub-title">
            {{ t('dashboard.metrics.trendTitle') }}
            <span class="perf-flow-sub-hint">{{ t('dashboard.metrics.trendHint') }}</span>
          </div>
          <div class="perf-flow-bars">
            <div
              v-for="point in trend"
              :key="point.date"
              class="perf-flow-bar-col"
              :title="point.date + ' · ' + point.interactions"
            >
              <div
                class="perf-flow-bar"
                :style="{ height: barHeight(point.interactions) }"
                :data-testid="'perf-bar-' + point.date"
              ></div>
            </div>
          </div>
        </div>

        <div class="perf-flow-sub" data-testid="perf-flow-platforms">
          <div class="perf-flow-sub-title">{{ t('dashboard.metrics.platformTitle') }}</div>
          <div v-for="row in platformRows" :key="row.platform" class="perf-flow-platform">
            <span class="perf-flow-platform-name">{{ row.name }}</span>
            <div class="perf-flow-platform-track">
              <div class="perf-flow-platform-fill" :style="{ width: row.width }"></div>
            </div>
            <span class="perf-flow-platform-value" :data-testid="'perf-platform-' + row.platform">
              {{ row.views }} · {{ row.interactions }}
            </span>
          </div>
        </div>

      </template>

      <div class="perf-flow-sub" data-testid="perf-flow-health">
          <!-- 健康度在空态下也要渲染：全平台不支持/全失败时，用户必须看得到"为什么没有数字"
               （QM-6 后端轴 FB8：此前健康度藏在指标分支里，空态只剩一句"尚未回采"没有归因） -->
          <div class="perf-flow-sub-title">{{ t('dashboard.metrics.healthTitle') }}</div>
          <ul class="perf-flow-health">
            <li :data-testid="'perf-health-coverage-' + health.covered + '-' + health.trackedTotal">
              {{ t('dashboard.metrics.healthCoverage', { covered: health.covered, total: health.trackedTotal, percent: health.coverage }) }}
            </li>
            <li v-if="health.byStatus.unsupported > 0" data-testid="perf-health-unsupported">
              {{ t('dashboard.metrics.healthUnsupported', { count: health.byStatus.unsupported }) }}
            </li>
            <li v-if="health.byStatus.failed > 0" data-testid="perf-health-failed">
              {{ t('dashboard.metrics.healthFailed', { count: health.byStatus.failed }) }}
            </li>
            <li data-testid="perf-health-last">
              {{ health.lastCapturedAt
                ? t('dashboard.metrics.healthLastAt', { time: formatTime(health.lastCapturedAt) })
                : t('dashboard.metrics.healthLastNever') }}
            </li>
          </ul>
          <p v-if="diagText" class="perf-flow-diag" data-testid="perf-flow-diag">{{ diagText }}</p>
          <p v-if="truncatedText" class="perf-flow-diag" data-testid="perf-flow-truncated">{{ truncatedText }}</p>
        </div>
    </template>
  </section>
</template>

<script setup>
// P2-6c 作品互动回流看板。数字一律来自主进程聚合（services/performance-overview.js），
// 渲染端禁止自己求和或自己造变化量——本页曾经把 +8.5% 这类写死的百分比当数据展示。
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { DataLine } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { performanceOverview } from '@/api/knowledge-library'
import { formatDateTime } from '@/utils/datetime'
import { isAuthGateResult, isAuthGateError } from '@/utils/auth-gate'
import { usePlatformStore } from '@/stores/platforms'

const props = defineProps({
  // 由页面「刷新数据」按钮递增，触发重新取数（两个入口各自拉数据会拿到不同时刻的数字）
  reloadToken: { type: Number, default: 0 },
  windowDays: { type: Number, default: 30 },
})

const { t, locale } = useI18n()
const platformStore = usePlatformStore()
const overview = ref(null)
const status = ref('loading')

const health = computed(() => (overview.value && overview.value.health) || {
  trackedTotal: 0, covered: 0, coverage: 0, lastCapturedAt: null,
  byStatus: { pending: 0, ok: 0, failed: 0, unsupported: 0, untrackable: 0, manual: 0, other: 0 },
})
const trend = computed(() => (overview.value && overview.value.trend) || [])

const isEmpty = computed(() => health.value.trackedTotal === 0 || health.value.covered === 0)

// 万/k 这类数量级缩写属文案而非数据：交给 Intl 按当前 locale 出，避免在模板里写死中文字面量
function formatCount (value) {
  const n = Number(value) || 0
  return new Intl.NumberFormat(String(locale.value || 'zh-CN'), { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

const metricItems = computed(() => {
  const totals = (overview.value && overview.value.totals) || {}
  return [
    { key: 'views', value: formatCount(totals.views || 0), label: t('dashboard.metrics.views') },
    { key: 'likes', value: formatCount(totals.likes || 0), label: t('dashboard.metrics.likes') },
    { key: 'comments', value: formatCount(totals.comments || 0), label: t('dashboard.metrics.comments') },
    { key: 'favorites', value: formatCount(totals.favorites || 0), label: t('dashboard.metrics.favorites') },
    { key: 'shares', value: formatCount(totals.shares || 0), label: t('dashboard.metrics.shares') },
  ]
})

const platformRows = computed(() => {
  const rows = (overview.value && overview.value.byPlatform) || []
  const max = Math.max(1, ...rows.map(r => r.interactions || 0))
  return rows.map(r => ({
    platform: r.platform || 'unknown',
    // 平台名走页面同一份标签真源（stores/platforms），空归属如实显示「未知平台」而不是留白
    name: r.platform ? (platformStore.getLabel(r.platform) || r.platform) : t('dashboard.metrics.unknownPlatform'),
    views: formatCount(r.views || 0),
    interactions: formatCount(r.interactions || 0),
    width: Math.round(((r.interactions || 0) / max) * 100) + '%',
  }))
})

// V12：基线为 0 时不给百分比——把「第一周」渲染成 +100% 与把 +8.5% 写死在模板里是同一种错
const weekLabel = computed(() => {
  const o = overview.value
  if (!o) return ''
  const wc = o.weekChange
  if (!wc) return t('dashboard.metrics.weekInsufficient')
  if (wc.percent > 0) return t('dashboard.metrics.weekUp', { percent: wc.percent })
  if (wc.percent < 0) return t('dashboard.metrics.weekDown', { percent: Math.abs(wc.percent) })
  return t('dashboard.metrics.weekFlat')
})
const weekTone = computed(() => {
  const wc = overview.value && overview.value.weekChange
  if (!wc || wc.percent === 0) return 'neutral'
  return wc.percent > 0 ? 'positive' : 'negative'
})

const diagText = computed(() => {
  const d = overview.value && overview.value.diagnostics
  if (!d) return ''
  const orphan = (d.orphanSnapshots || 0) + (d.orphanSnapshotsDb || 0)
  if (!orphan && !d.retreats && !d.invalidMetrics) return ''
  return t('dashboard.metrics.diagLine', { orphan, retreat: d.retreats || 0, invalid: d.invalidMetrics || 0 })
})

const truncatedText = computed(() => {
  const o = overview.value
  if (!o || !o.truncated) return ''
  if (!o.truncated.tracked && !o.truncated.snapshot) return ''
  return t('dashboard.metrics.truncatedNote', { count: Math.max(o.limits.tracked || 0, o.limits.snapshot || 0) })
})

function barHeight (value) {
  const max = Math.max(1, ...trend.value.map(p => p.interactions || 0))
  return Math.max(2, Math.round(((value || 0) / max) * 72)) + 'px'
}

function formatTime (iso) {
  return formatDateTime(iso, { style: 'hour-minute' })
}

async function load () {
  try {
    const res = await performanceOverview({ windowDays: props.windowDays })
    if (res && res.code === 0 && res.data) {
      overview.value = res.data
      status.value = 'ready'
      return
    }
    if (isAuthGateResult(res)) {
      status.value = 'auth'
      return
    }
    // 取数失败不得把界面刷成 0——保留上一次数据，只出声
    status.value = overview.value ? 'ready' : 'error'
    ElMessage.error(t('dashboard.metrics.loadFailed'))
  } catch (e) {
    // 未登录在真实链路上是**抛错**而不是信封：preload 的权限包装在 invoke 之前就 throw
    // （LicensePermissionError）。只判信封会把「没登录」渲染成「加载失败」（QM-6 后端轴 FB6）。
    if (isAuthGateError(e)) {
      status.value = 'auth'
      return
    }
    status.value = overview.value ? 'ready' : 'error'
    console.warn('perf flow load failed:', e && e.message)
  }
}

onMounted(load)
// 页面「刷新数据」通过 reloadToken 递增驱动——不暴露 reload()：
// defineExpose 出去而无人调用，只会让下一个会话以为存在外部调用方（QM-6 前端轴 FF4）
watch(() => props.reloadToken, load)
</script>

<style scoped>
.perf-flow-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  flex-wrap: wrap;
}
.perf-flow-week {
  margin-left: auto;
  font-size: var(--font-size-sm, 12px);
}
.perf-flow-week.positive { color: var(--color-success, #16a34a); }
.perf-flow-week.negative { color: var(--color-danger, #dc2626); }
.perf-flow-week.neutral { color: var(--color-text-secondary, #6b7280); }
.perf-flow-empty {
  color: var(--color-text-secondary, #6b7280);
  margin: 0;
}
.perf-flow-metrics {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-sm, 8px);
}
.perf-flow-metric {
  background: var(--color-bg-secondary, #f8fafc);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-sm, 8px);
  text-align: center;
}
.perf-flow-metric-value {
  font-size: var(--font-size-lg, 20px);
  font-weight: 600;
}
.perf-flow-metric-label {
  font-size: var(--font-size-sm, 12px);
  color: var(--color-text-secondary, #6b7280);
}
.perf-flow-sub {
  margin-top: var(--space-md, 16px);
}
.perf-flow-sub-title {
  font-size: var(--font-size-sm, 12px);
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: var(--space-xs, 4px);
}
.perf-flow-sub-hint {
  margin-left: var(--space-xs, 4px);
}
.perf-flow-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 76px;
}
.perf-flow-bar-col {
  flex: 1 1 0;
  display: flex;
  align-items: flex-end;
}
.perf-flow-bar {
  width: 100%;
  background: var(--lavender-primary, #7c5cbf);
  border-radius: 2px 2px 0 0;
  opacity: 0.75;
}
.perf-flow-platform {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
}
.perf-flow-platform-name {
  width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.perf-flow-platform-track {
  flex: 1 1 auto;
  height: 8px;
  background: var(--color-border, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}
.perf-flow-platform-fill {
  height: 100%;
  background: var(--lavender-accent, #f472b6);
}
.perf-flow-platform-value {
  width: 110px;
  text-align: right;
  font-size: var(--font-size-sm, 12px);
}
.perf-flow-health {
  margin: 0;
  padding-left: 18px;
  font-size: var(--font-size-sm, 12px);
  color: var(--color-text-secondary, #6b7280);
}
.perf-flow-diag {
  margin: var(--space-xs, 4px) 0 0;
  font-size: var(--font-size-sm, 12px);
  color: var(--color-text-secondary, #6b7280);
}
</style>
