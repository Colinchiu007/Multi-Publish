<template>
  <div class="ai-writer-panel cohere-card" style="cursor:default;padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md);padding-bottom:var(--space-sm);border-bottom:1px solid var(--border)">
      <span style="font-weight:600;font-size:14px">🤖 AI 辅助写作</span>
      <button class="cohere-btn-ghost" @click="('close')" style="font-size:12px;padding:2px 6px">✕</button>
    </div>

    <!-- 未配置 API Key -->
    <div v-if="!configured" class="no-config">
      <div style="margin-bottom:8px">需要配置 LLM API Key 才能使用 AI 功能</div>
      <button class="cohere-btn-primary" @click="goToProviders">前往 Provider 设置</button>
    </div>

    <!-- API 已配置 -->
    <template v-else>
      <!-- 模式选择 -->
      <div class="mode-tabs">
        <button
          v-for="mode in modes" :key="mode.key"
          class="mode-tab"
          :class="{ active: activeMode === mode.key }"
          @click="activeMode = mode.key"
        >{{ mode.label }}</button>
      </div>

      <!-- 标题生成 -->
      <div v-if="activeMode === 'titles'" class="mode-content">
        <div class="cohere-form-item">
          <label class="cohere-form-label">主题 / 关键词</label>
          <input class="cohere-input" v-model="topic" placeholder="输入文章主题或关键词" @keyup.enter="generateTitles" />
        </div>
        <div class="cohere-form-item">
          <button class="cohere-btn-primary" @click="generateTitles" :disabled="generating || !topic.trim()">
            {{ generating ? '生成中...' : '🎯 生成标题' }}
          </button>
        </div>
        <div v-if="titles.length > 0" class="results">
          <div
            v-for="(t, i) in titles" :key="i"
            class="result-item"
            @click="selectTitle(t)"
          >
            <span class="result-num">{{ i + 1 }}</span>
            <span class="result-text">{{ t }}</span>
            <span class="result-action">选择</span>
          </div>
        </div>
      </div>

      <!-- 内容润色 -->
      <div v-if="activeMode === 'enhance'" class="mode-content">
        <div class="cohere-form-item">
          <label class="cohere-form-label">选择润色风格</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button
              v-for="s in styles" :key="s.key"
              class="style-chip"
              :class="{ active: selectedStyle === s.key }"
              @click="selectedStyle = s.key"
            >{{ s.label }}</button>
          </div>
        </div>
        <div class="cohere-form-item">
          <button class="cohere-btn-primary" @click="enhanceContent" :disabled="enhancing">
            {{ enhancing ? '润色中...' : '✨ 润色正文' }}
          </button>
        </div>
        <div v-if="enhancedResult" class="results">
          <div class="result-item" @click="selectEnhanced">
            <span class="result-text">{{ enhancedResult.slice(0, 100) }}{{ enhancedResult.length > 100 ? '...' : '' }}</span>
            <span class="result-action">应用</span>
          </div>
        </div>
      </div>

      <!-- 摘要生成 -->
      <div v-if="activeMode === 'summary'" class="mode-content">
        <div class="cohere-form-item">
          <button class="cohere-btn-primary" @click="generateSummary" :disabled="summarizing">
            {{ summarizing ? '生成中...' : '📝 生成摘要' }}
          </button>
        </div>
        <div v-if="summary" class="results">
          <div class="result-item" @click="selectSummary">
            <span class="result-text">{{ summary }}</span>
            <span class="result-action">应用</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue"
import { useRouter } from "vue-router"

const emit = defineEmits(["close", "apply-title", "apply-content"])
const router = useRouter()

const configured = ref(false)
const generating = ref(false)
const enhancing = ref(false)
const summarizing = ref(false)
const activeMode = ref("titles")
const topic = ref("")
const titles = ref([])
const selectedStyle = ref("polish")
const enhancedResult = ref("")
const summary = ref("")

const modes = [
  { key: "titles", label: "🎯 标题生成" },
  { key: "enhance", label: "✨ 内容润色" },
  { key: "summary", label: "📝 生成摘要" },
]

const styles = [
  { key: "polish", label: "优化表达" },
  { key: "concise", label: "精简内容" },
  { key: "engaging", label: "社交媒体风" },
]

const api = () => window.electronAPI

function goToProviders() {
  router.push("/providers")
  emit("close")
}

async function checkConfig() {
  const a = api()
  if (!a) return
  const res = await a.aiIsConfigured()
  if (res && res.code === 0) configured.value = res.data
}

async function generateTitles() {
  if (!topic.value.trim()) return
  generating.value = true
  const a = api()
  if (!a) return
  const res = await a.aiGenerateTitles(topic.value)
  if (res && res.code === 0) titles.value = res.data || []
  generating.value = false
}

function selectTitle(t) {
  emit("apply-title", t)
}

async function enhanceContent() {
  enhancing.value = true
  const a = api()
  if (!a) return
  // Read content from parent - passed via prop or get from editor
  const content = props.sourceContent || ""
  if (!content || content.length < 10) {
    enhancedResult.value = "请先在正文编辑器中输入内容"
    enhancing.value = false
    return
  }
  const res = await a.aiEnhanceContent(content, selectedStyle.value)
  if (res && res.code === 0) enhancedResult.value = res.data
  enhancing.value = false
}

function selectEnhanced() {
  emit("apply-content", enhancedResult.value)
}

async function generateSummary() {
  summarizing.value = true
  const a = api()
  if (!a) return
  const content = props.sourceContent || ""
  if (!content || content.length < 20) {
    summary.value = "内容太短，无法生成摘要"
    summarizing.value = false
    return
  }
  const res = await a.aiGenerateSummary(content)
  if (res && res.code === 0) summary.value = res.data || ""
  summarizing.value = false
}

function selectSummary() {
  emit("apply-content", summary.value)
}

const props = defineProps({
  sourceContent: { type: String, default: "" },
})

onMounted(() => {
  checkConfig()
})
</script>

<style scoped>
.ai-writer-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
}
.no-config {
  text-align: center;
  padding: 20px;
  font-size: 13px;
  color: var(--muted);
}
.cohere-btn-primary {
  padding: 8px 16px;
  background: var(--coral, #f56c6c);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.cohere-btn-primary:disabled { opacity: 0.5; cursor: default; }
.mode-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: var(--space-md);
  background: var(--soft-stone, #f5f5f5);
  border-radius: 8px;
  padding: 3px;
}
.mode-tab {
  flex: 1;
  padding: 6px 10px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--muted);
  transition: all 0.15s;
}
.mode-tab.active {
  background: var(--surface, #fff);
  color: var(--text-primary);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.mode-content {
  padding: 0;
}
.cohere-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}
.cohere-input:focus { border-color: var(--coral); }
.cohere-form-item { margin-bottom: var(--space-sm); }
.cohere-form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 4px;
}
.style-chip {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface, #fff);
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
}
.style-chip.active {
  border-color: var(--coral);
  background: var(--coral-bg, #fef2f2);
  color: var(--coral);
}
.results {
  margin-top: var(--space-sm);
}
.result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.1s;
}
.result-item:hover {
  border-color: var(--coral);
  background: var(--soft-stone);
}
.result-num {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--coral-bg, #fef2f2);
  color: var(--coral);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.result-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.4;
}
.result-action {
  font-size: 11px;
  color: var(--coral);
  flex-shrink: 0;
}
</style>
