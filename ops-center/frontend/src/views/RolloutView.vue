<template>
  <div class="page">
    <h1 style="margin-bottom: 16px">配置生效看板</h1>

    <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 12px">
      <el-select
        v-if="versionOptions_.length > 1"
        :model-value="summary?.version ?? undefined"
        style="width: 180px"
        @update:model-value="switchVersion"
      >
        <el-option v-for="v in versionOptions_" :key="v" :label="'v' + v" :value="v" />
      </el-select>
      <el-button :loading="loading" @click="load">刷新</el-button>
      <span style="color: var(--color-text-secondary); font-size: var(--font-size-xs)">
        数据来自客户端 ACK 回执（随运行时同步 + 24h 心跳），非实时推送
      </span>
    </div>

    <div v-if="loading" style="padding: 40px; text-align: center; color: var(--color-text-secondary)">加载中...</div>

    <el-alert
      v-else-if="error"
      type="error"
      :title="error"
      show-icon
      style="margin-bottom: 16px"
      :closable="false"
    >
      <el-button size="small" style="margin-top: 8px" @click="load">重试</el-button>
    </el-alert>

    <el-empty v-else-if="isEmptySummary(summary)" description="还没有客户端回执。客户端同步一次运行时策略后这里会出现数据。" />

    <template v-else>
      <!-- 汇总卡片 -->
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">v{{ summary.version }}</div><div class="stat-label">当前配置版本</div></div>
        <div class="stat-card"><div class="stat-value">{{ formatPercent(summary.ack_rate) }}</div><div class="stat-label">已确认率</div></div>
        <div class="stat-card">
          <div class="stat-value">{{ fmtNum(summary.acked) }}<span class="stat-sub">/ {{ fmtNum(summary.total) }}</span></div>
          <div class="stat-label">已确认（其中降级中 {{ fmtNum(summary.degraded) }}）</div>
        </div>
        <div class="stat-card"><div class="stat-value">{{ fmtNum(summary.stale) }}</div><div class="stat-label">仍在旧版</div></div>
      </div>

      <!-- 分块确认率 -->
      <el-card shadow="never" style="margin-top: 16px">
        <template #header>分块确认率（该块配置在多少比例的已确认客户端生效）</template>
        <el-empty v-if="!blockRates_.length" description="暂无分块数据" />
        <div v-else class="block-rows">
          <div v-for="b in blockRates_" :key="b.name" class="block-row">
            <span class="block-name">{{ b.name }}</span>
            <el-progress class="block-bar" :percentage="Math.round(b.ratio * 1000) / 10" :stroke-width="12" />
            <span class="block-pct">{{ b.percent }}</span>
          </div>
        </div>
      </el-card>

      <!-- 未确认客户端明细 -->
      <el-card shadow="never" style="margin-top: 16px">
        <template #header>未确认客户端（最多 50 条；🔴 = 断连降级中）</template>
        <el-table :data="summary.clients" border stripe size="small">
          <el-table-column label="客户端" prop="client_id" min-width="140" show-overflow-tooltip />
          <el-table-column label="应用版本" prop="client_version" width="100" />
          <el-table-column label="所在配置版本" width="110">
            <template #default="{ row }">v{{ row.config_version }}</template>
          </el-table-column>
          <el-table-column label="状态" width="140">
            <template #default="{ row }">
              <el-tag v-if="row.degraded" type="danger" size="small">🔴 {{ degradationBadge(row) }}</el-tag>
              <span v-else style="color: var(--color-text-secondary)">正常</span>
            </template>
          </el-table-column>
          <el-table-column label="最近回执" width="160">
            <template #default="{ row }">{{ formatAckTime(row.last_ack_at) }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchRollout } from '../api/rollout'
import { apiErrorMessage } from '../api/http'
import {
  formatPercent,
  formatAckTime,
  sortedBlockRates,
  versionOptions,
  isEmptySummary,
  degradationBadge,
} from './rollout-board-utils'

const summary = ref(null)
const loading = ref(false)
const error = ref('')

const blockRates_ = computed(() => sortedBlockRates(summary.value?.block_rates))
/**
 * 版本候选 = 当前版本 + 明细里出现的版本（versionOptions 内部去重降序）。
 * 评审修复（2026-10-08，opencode MEDIUM×2）：旧实现把每轮 clients 整段 push 进
 * historyClients 累积——数组无上限增长（内存泄漏），且旧 clients 混进候选集造成
 * 切换器与后端数据漂移。候选集一律以「本轮响应」为准，不跨轮累积任何明细对象。
 */
const versionOptions_ = computed(() =>
  versionOptions(summary.value?.version, summary.value?.clients || []),
)

/**
 * 版本候选去重集合（评审修复 2026-10-08，opencode MEDIUM×2）：
 * 旧实现把每轮 clients 数组整段 push 进 historyClients 累积——数组无上限增长，
 * 且旧 clients 会持续混进版本候选集造成漂移。
 * 改为只记录**版本号**（Set 天然去重、体量 ≤ 配置变更次数），候选集 = 当前版本
 * + 已见版本号，不再引用任何 client 明细对象。
 */
async function load(version) {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchRollout(version ? { version } : {})
    summary.value = data
  } catch (e) {
    error.value = apiErrorMessage(e, '生效数据加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

function switchVersion(v) {
  if (v && v !== summary.value?.version) load(v)
}

function fmtNum(n) {
  const x = Number(n)
  return Number.isFinite(x) ? String(x) : '0'
}

onMounted(() => load())
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.stat-card {
  background: var(--color-bg-container, #fff);
  border: 1px solid var(--color-border, #e4e7ed);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}
.stat-value {
  font-size: var(--font-size-xl);
  font-weight: 600;
}
.stat-sub {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
.stat-label {
  margin-top: 6px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs, 12px);
}
.block-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.block-row {
  display: grid;
  grid-template-columns: 200px 1fr 72px;
  align-items: center;
  gap: 12px;
}
.block-name {
  font-family: monospace;
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.block-pct {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
