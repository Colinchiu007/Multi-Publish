<template>
  <div class="first-run">
    <el-card style="max-width: 560px; margin: 80px auto">
      <template #header>
        <div style="text-align: center">
          <h2 style="margin: 0">🚀 首次运行引导</h2>
          <p style="color: #999; margin: 8px 0 0">正在安装必要的依赖，请稍候...</p>
        </div>
      </template>

      <div class="step-list">
        <div
          v-for="(step, idx) in steps"
          :key="idx"
          class="step-item"
          :class="step.status"
        >
          <span class="step-icon">
            <span v-if="step.status === 'done'">✅</span>
            <span v-else-if="step.status === 'active'">⏳</span>
            <span v-else-if="step.status === 'error'">❌</span>
            <span v-else>⬜</span>
          </span>
          <div class="step-content">
            <div class="step-label">{{ step.label }}</div>
            <div v-if="step.status === 'active'" class="step-message">{{ step.message }}</div>
            <div v-if="step.status === 'error'" class="step-message" style="color: #f56c6c">{{ step.message }}</div>
          </div>
        </div>
      </div>

      <div v-if="allDone" style="text-align: center; margin-top: 24px">
        <p style="color: #67c23a; font-size: 16px">🎉 安装完成！</p>
        <el-button type="primary" size="large" @click="$router.push('/publish')">
          开始使用 →
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { onFirstRunStatus, firstRunCheck } from '@/api/publisher'

const steps = ref([
  { label: 'Python 依赖', status: 'pending', message: '' },
  { label: 'Playwright 浏览器', status: 'pending', message: '' }
])
const allDone = ref(false)
let cancelListen = null

const stepIndex = { python: 0, playwright: 1 }

function updateStep (type, data) {
  if (type === 'step' && stepIndex[data.step] !== undefined) {
    steps.value[stepIndex[data.step]].status = 'active'
    steps.value[stepIndex[data.step]].message = data.message || ''
  } else if (type === 'done') {
    steps.value.forEach(s => { s.status = 'done' })
    allDone.value = true
  } else if (type === 'error') {
    const idx = steps.value.findIndex(s => s.status === 'active')
    if (idx >= 0) {
      steps.value[idx].status = 'error'
      steps.value[idx].message = data.data || '未知错误'
    }
  }
}

onMounted(async () => {
  const checkResult = await firstRunCheck()
  if (checkResult?.setupDone) {
    allDone.value = true
    steps.value.forEach(s => { s.status = 'done' })
  }

  cancelListen = onFirstRunStatus((payload) => {
    if (!payload) return
    updateStep(payload.type, payload.data || {})
  })
})

onBeforeUnmount(() => {
  if (cancelListen) cancelListen()
})
</script>

<style scoped>
.step-list { display: flex; flex-direction: column; gap: 16px; }
.step-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-radius: 8px; background: #f5f7fa; }
.step-item.active { background: #ecf5ff; border: 1px solid #409eff; }
.step-item.done { background: #f0f9eb; border: 1px solid #67c23a; }
.step-item.error { background: #fef0f0; border: 1px solid #f56c6c; }
.step-icon { font-size: 20px; line-height: 24px; }
.step-label { font-weight: 500; }
.step-message { font-size: 13px; color: #909399; margin-top: 4px; }
</style>