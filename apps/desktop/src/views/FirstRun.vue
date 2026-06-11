<template>
  <div class="cohere-content" style="display:flex;align-items:center;justify-content:center">
    <div style="max-width:560px;width:100%;margin:40px auto">
      <div class="cohere-card" style="cursor:default;text-align:center;padding:var(--space-xxl)">
        <div style="font-size:48px;margin-bottom:var(--space-lg)">🚀</div>
        <h2 style="font-size:22px;font-weight:500;color:var(--primary);margin-bottom:8px">首次运行引导</h2>
        <p style="font-size:14px;color:var(--muted);margin-bottom:var(--space-xl)">正在安装必要的依赖，请稍候...</p>

        <div style="display:flex;flex-direction:column;gap:var(--space-md)">
          <div
            v-for="(step, idx) in steps"
            :key="idx"
            :style="{
              display:'flex',alignItems:'flex-start',gap:'12px',
              padding:'var(--space-md)',
              borderRadius:'var(--r-sm)',
              background: step.status === 'done' ? 'var(--pale-green)' :
                          step.status === 'active' ? 'var(--pale-blue)' :
                          step.status === 'error' ? '#fff0ed' : 'var(--soft-stone)',
              textAlign:'left'
            }"
          >
            <span style="font-size:20px;line-height:24px">
              <span v-if="step.status === 'done'">✅</span>
              <span v-else-if="step.status === 'active'">⏳</span>
              <span v-else-if="step.status === 'error'">❌</span>
              <span v-else>⬜</span>
            </span>
            <div style="flex:1">
              <div style="font-weight:500;font-size:14px;color:var(--ink)">{{ step.label }}</div>
              <div v-if="step.status === 'active' || step.status === 'error'" style="font-size:13px;color:var(--muted);margin-top:4px">
                <span v-if="step.status === 'error'" style="color:var(--coral)">{{ step.message }}</span>
                <span v-else>{{ step.message }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="allDone" style="margin-top:var(--space-xl)">
          <p style="font-size:16px;color:#1a7d36;margin-bottom:var(--space-lg)">🎉 安装完成！</p>
          <button class="cohere-btn-primary" @click="$router.push('/publish')">
            开始使用 →
          </button>
        </div>
      </div>
    </div>
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