<template>
  <div v-if="showNotification" :style="{position:'fixed',top:'20px',right:'20px',zIndex:9999,padding:'12px 24px',borderRadius:'8px',color:'#fff',fontSize:'14px',boxShadow:'0 4px 12px rgba(0,0,0,0.15)',background:notificationType==='success'?'#34d399':'#f87171'}">{{ notificationMsg }}</div>
<div class="cohere-content" style="display:flex;align-items:center;justify-content:center">
    <div style="max-width:600px;width:100%;margin:40px auto">
      <div class="cohere-card" style="cursor:default;padding:var(--space-xxl)">

        <!-- Step 0: Welcome -->
        <div v-if="currentStep === 0" style="text-align:center">
          <div style="font-size:64px;margin-bottom:var(--space-lg)">🚀</div>
          <h2 style="font-size:24px;font-weight:600;color:var(--primary);margin-bottom:8px">欢迎使用社媒管家</h2>
          <p style="font-size:14px;color:var(--muted);margin-bottom:var(--space-xl)">
            三步完成配置，即可开始多平台一键发布
          </p>
          <div style="display:flex;flex-direction:column;gap:12px;text-align:left;max-width:400px;margin:0 auto var(--space-xl)">
            <div style="display:flex;gap:12px;padding:12px;background:var(--soft-stone);border-radius:8px">
              <span style="font-size:18px">①</span>
              <div><strong>环境检测</strong><br><span style="font-size:13px;color:var(--muted)">自动安装 Python 依赖和 Playwright</span></div>
            </div>
            <div style="display:flex;gap:12px;padding:12px;background:var(--soft-stone);border-radius:8px">
              <span style="font-size:18px">②</span>
              <div><strong>添加账号</strong><br><span style="font-size:13px;color:var(--muted)">登录你的社交媒体平台账号</span></div>
            </div>
            <div style="display:flex;gap:12px;padding:12px;background:var(--soft-stone);border-radius:8px">
              <span style="font-size:18px">③</span>
              <div><strong>首次发布</strong><br><span style="font-size:13px;color:var(--muted)">写一篇文章发布到各平台</span></div>
            </div>
          </div>
          <button class="cohere-btn-primary" @click="currentStep = 1">开始配置 →</button>
        </div>

        <!-- Step 1: Dependencies -->
        <div v-else-if="currentStep === 1" style="text-align:center">
          <div style="font-size:48px;margin-bottom:var(--space-lg)">⚙️</div>
          <h2 style="font-size:22px;font-weight:500;color:var(--primary);margin-bottom:8px">环境检测</h2>
          <p style="font-size:14px;color:var(--muted);margin-bottom:var(--space-xl)">自动安装依赖，可能需要几分钟</p>

          <div style="display:flex;flex-direction:column;gap:var(--space-md)">
            <div v-for="(step, idx) in depSteps" :key="idx"
              :style="{
                display:'flex',alignItems:'flex-start',gap:'12px',
                padding:'12px',borderRadius:'8px',
                background: step.status === 'done' ? 'var(--teal-soft,#e8f5e9)' :
                            step.status === 'active' ? 'var(--pale-blue,#e3f2fd)' :
                            step.status === 'error' ? 'var(--coral-soft,#ffebee)' : 'var(--soft-stone,var(--bg))',
                textAlign:'left'
              }">
              <span style="font-size:20px;line-height:24px">
                <span v-if="step.status === 'done'">✅</span>
                <span v-else-if="step.status === 'active'">⏳</span>
                <span v-else-if="step.status === 'error'">❌</span>
                <span v-else>⬜</span>
              </span>
              <div style="flex:1">
                <div style="font-weight:500;font-size:14px">{{ step.label }}</div>
                <div v-if="step.message" style="font-size:13px;color:var(--muted);margin-top:4px">{{ step.message }}</div>
              </div>
            </div>
          </div>

          <div v-if="allDepsDone" style="margin-top:var(--space-xl)">
            <p style="color:var(--teal);margin-bottom:var(--space-lg)">✅ 环境就绪</p>
            <button class="cohere-btn-primary" @click="currentStep = 2">下一步：添加账号 →</button>
          </div>
          <div v-if="depError" style="margin-top:var(--space-xl)">
            <p style="color:var(--coral);margin-bottom:var(--space-md)">❌ 安装出错：{{ depErrorMessage }}</p>
            <button class="cohere-btn-secondary" @click="retryDeps">重试</button>
            <button class="cohere-btn-primary" style="margin-left:12px" @click="currentStep = 2">跳过</button>
          </div>
        </div>

        <!-- Step 2: Add Account -->
        <div v-else-if="currentStep === 2" style="text-align:center">
          <div style="font-size:48px;margin-bottom:var(--space-lg)">🔑</div>
          <h2 style="font-size:22px;font-weight:500;color:var(--primary);margin-bottom:8px">添加你的第一个账号</h2>
          <p style="font-size:14px;color:var(--muted);margin-bottom:var(--space-xl)">
            选择平台后，在弹出的页面中完成登录
          </p>

          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:450px;margin:0 auto var(--space-xl)">
            <button v-for="p in quickPlatforms" :key="p.id"
              :style="{
                padding:'14px 12px',border:'1px solid var(--hairline)',
                borderRadius:'8px',background:'var(--canvas,var(--surface))',cursor:'pointer',
                fontSize:'14px',display:'flex',alignItems:'center',gap:'8px',
                ...(addingPlatform === p.id ? {opacity:0.6} : {})
              }"
              :disabled="addingPlatform === p.id"
              @click="addAccount(p.id)">
              <span>{{ p.icon }}</span> {{ p.label }}
            </button>
          </div>

          <div style="margin-top:var(--space-md)">
            <button class="cohere-btn-secondary" @click="currentStep = 3">已添加账号，下一步 →</button>
          </div>
        </div>

        <!-- Step 3: Quick Publish Tutorial -->
        <div v-else-if="currentStep === 3" style="text-align:center">
          <div style="font-size:48px;margin-bottom:var(--space-lg)">✍️</div>
          <h2 style="font-size:22px;font-weight:500;color:var(--primary);margin-bottom:8px">准备完毕！</h2>
          <p style="font-size:14px;color:var(--muted);margin-bottom:var(--space-xl)">
            现在你可以开始多平台发布
          </p>

          <div style="display:flex;flex-direction:column;gap:12px;text-align:left;max-width:400px;margin:0 auto var(--space-xl)">
            <div style="display:flex;gap:12px;padding:12px;background:var(--soft-stone,var(--bg));border-radius:8px">
              <span>📝</span>
              <div><strong>写文章</strong><br><span style="font-size:13px;color:var(--muted)">在发布页面编辑标题和正文</span></div>
            </div>
            <div style="display:flex;gap:12px;padding:12px;background:var(--soft-stone,var(--bg));border-radius:8px">
              <span>🎯</span>
              <div><strong>选平台</strong><br><span style="font-size:13px;color:var(--muted)">勾选要发布的平台</span></div>
            </div>
            <div style="display:flex;gap:12px;padding:12px;background:var(--soft-stone,var(--bg));border-radius:8px">
              <span>🚀</span>
              <div><strong>一键发布</strong><br><span style="font-size:13px;color:var(--muted)">后台自动分发到所有选中的平台</span></div>
            </div>
          </div>

          <div style="display:flex;gap:12px;justify-content:center">
            <button class="cohere-btn-secondary" @click="$router.push('/accounts')">管理账号</button>
            <button class="cohere-btn-primary" @click="$router.push('/publish')">开始发布 →</button>
          </div>
        </div>

        <!-- Step progress dots -->
        <div style="display:flex;justify-content:center;gap:8px;margin-top:var(--space-xl)">
          <div v-for="i in 4" :key="i"
            :style="{
              width:'8px',height:'8px',borderRadius:'50%',
              background: currentStep >= i-1 ? 'var(--action-blue)' : 'var(--hairline)',
              transition:'background 0.3s'
            }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import UiButton from "../components/UiButton.vue";
import UiInput from "../components/UiInput.vue";
import { ref, onMounted, onBeforeUnmount } from 'vue'
// 简单通知
const notificationMsg = ref('')
const notificationType = ref('success')
const showNotification = ref(false)

function notify(msg, type = 'success') {
  notificationMsg.value = msg
  notificationType.value = type
  showNotification.value = true
  setTimeout(() => { showNotification.value = false }, 3000)
}
import { onFirstRunStatus, firstRunCheck } from '@/api/publisher'

const currentStep = ref(0)
const addingPlatform = ref('')
const allDepsDone = ref(false)
const depError = ref(false)
const depErrorMessage = ref('')

const depSteps = ref([
  { label: 'Python 依赖', status: 'pending', message: '' },
  { label: 'Playwright 浏览器', status: 'pending', message: '' },
])

const quickPlatforms = [
  { id: 'wechat_mp', label: '微信公众号', icon: '💬' },
  { id: 'zhihu', label: '知乎', icon: '❓' },
  { id: 'weibo', label: '微博', icon: '✧' },
  { id: 'douyin', label: '抖音', icon: '🎵' },
  { id: 'xiaohongshu', label: '小红书', icon: '📕' },
  { id: 'youtube', label: 'YouTube', icon: '▶' },
]

let cancelListen = null

const stepIndex = { python: 0, playwright: 1 }

onMounted(async () => {
  const checkResult = await firstRunCheck()
  if (checkResult?.setupDone) {
    allDepsDone.value = true
    depSteps.value.forEach(s => { s.status = 'done' })
    currentStep.value = 1  // skip deps
  }
  cancelListen = onFirstRunStatus((payload) => {
    if (!payload) return
    if (payload.type === 'step' && stepIndex[payload.data?.step] !== undefined) {
      depSteps.value[stepIndex[payload.data.step]].status = 'active'
      depSteps.value[stepIndex[payload.data.step]].message = payload.data.message || ''
    } else if (payload.type === 'done') {
      depSteps.value.forEach(s => { s.status = 'done' })
      allDepsDone.value = true
    } else if (payload.type === 'error') {
      const idx = depSteps.value.findIndex(s => s.status === 'active')
      if (idx >= 0) {
        depSteps.value[idx].status = 'error'
        depSteps.value[idx].message = payload.data?.data || '未知错误'
      }
      depError.value = true
      depErrorMessage.value = payload.data?.data || '安装失败'
    }
  })
})

onBeforeUnmount(() => {
  if (cancelListen) cancelListen()
})

async function addAccount (platform) {
  addingPlatform.value = platform
  try {
    const api = window.electronAPI
    if (api?.authOpenLogin) {
      const res = await api.authOpenLogin(platform)
      if (res.code !== 0) window.alert(res.message || '添加失败')
      else window.alert('账号添加成功，继续添加或进入下一步')
    } else {
      const res = await api.accountAdd(platform)
      if (res.code !== 0) window.alert(res.message || '添加失败')
      else window.alert('请在弹出的浏览器窗口中完成登录')
    }
  } catch (e) { window.alert(e.message) }
  finally { addingPlatform.value = '' }
}

function retryDeps () {
  depError.value = false
  depSteps.value.forEach(s => { if (s.status === 'error') s.status = 'pending'; s.message = '' })
  // Re-trigger setup
  firstRunCheck()
}
</script>