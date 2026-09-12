<template>
  <el-popover
    placement="top-start"
    :width="280"
    trigger="hover"
    :show-after="200"
    popper-class="yixiaoer-service-popover"
  >
    <template #reference>
      <span
        class="yixiaoer-service-status"
        :class="summaryClass"
        data-testid="yixiaoer-service-status"
        role="button"
        tabindex="0"
        aria-haspopup="dialog"
      >
        <i aria-hidden="true"></i>{{ summaryLabel }}
      </span>
    </template>
    <div class="yixiaoer-service-list" data-testid="yixiaoer-service-list">
      <div v-if="serviceStatusStore.unavailable" class="yixiaoer-service-unavailable">
        {{ t('sidebar.serviceStatus.unavailable') }}
      </div>
      <template v-else>
        <div
          v-for="svc in serviceStatusStore.services"
          :key="svc.key"
          class="yixiaoer-service-item"
          :data-testid="'yixiaoer-service-' + svc.key"
        >
          <i class="yixiaoer-service-dot" :class="'is-' + svc.status" aria-hidden="true"></i>
          <span class="yixiaoer-service-name">{{ serviceLabel(svc) }}</span>
          <span class="yixiaoer-service-state">{{ serviceStateLabel(svc.status) }}</span>
        </div>
      </template>
    </div>
  </el-popover>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useServiceStatusStore } from '@/stores/serviceStatus'

const { t } = useI18n()
const serviceStatusStore = useServiceStatusStore()

onMounted(() => { serviceStatusStore.startPolling() })
onUnmounted(() => { serviceStatusStore.stopPolling() })

const summaryLabel = computed(() => {
  if (serviceStatusStore.unavailable) return t('sidebar.serviceStatus.unavailable')
  if (serviceStatusStore.allRunning) return t('sidebar.serviceStatus.allRunning')
  return t('sidebar.serviceStatus.partialRunning', { count: serviceStatusStore.runningCount })
})

const summaryClass = computed(() => serviceStatusStore.allRunning && !serviceStatusStore.unavailable ? 'is-ok' : 'is-degraded')

function serviceLabel (svc) {
  const key = 'sidebar.serviceStatus.services.' + svc.key
  const label = t(key)
  return label === key ? svc.name : label
}

function serviceStateLabel (status) {
  return t('sidebar.serviceStatus.states.' + status)
}
</script>

<style scoped>
.yixiaoer-service-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #6f9c6f;
  cursor: default;
}

.yixiaoer-service-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6fbf73;
}

.yixiaoer-service-status.is-degraded {
  color: #b08a3e;
}

.yixiaoer-service-status.is-degraded i {
  background: #e6a23c;
}
</style>

<style>
/* el-popover 渲染在 body 下，scoped 样式无法命中，需全局样式（yixiaoer- 命名空间防冲突） */
.yixiaoer-service-popover .yixiaoer-service-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.yixiaoer-service-popover .yixiaoer-service-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #5a5c73;
}

.yixiaoer-service-popover .yixiaoer-service-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.yixiaoer-service-popover .yixiaoer-service-dot.is-running {
  background: #6fbf73;
}

.yixiaoer-service-popover .yixiaoer-service-dot.is-stopped {
  background: #f56c6c;
}

.yixiaoer-service-popover .yixiaoer-service-dot.is-standby {
  background: #c0c2cf;
}

.yixiaoer-service-popover .yixiaoer-service-state {
  margin-left: auto;
  color: #9294ab;
}

.yixiaoer-service-popover .yixiaoer-service-unavailable {
  font-size: 12px;
  color: #b08a3e;
}
</style>
