<template>
  <div class="cohere-card" style="cursor:default;padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md);padding-bottom:var(--space-sm);border-bottom:1px solid var(--border)">
      <span style="font-weight:600;font-size:14px"># 智能标签建议</span>
      <button class="cohere-btn-ghost" @click="$emit('close')" style="font-size:12px;padding:2px 6px">✕</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" style="text-align:center;padding:20px 0;font-size:13px;color:var(--muted);animation:pulse 1.5s ease-in-out infinite">
      分析内容中...
    </div>

    <!-- Empty / no content -->
    <div v-else-if="!content || content.trim().length < 3" style="padding:12px 0;font-size:12px;color:var(--muted);text-align:center">
      输入内容后自动分析标签
    </div>

    <!-- Error -->
    <div v-else-if="error" style="padding:12px 0;font-size:13px;color:var(--coral)">
      {{ error }}
    </div>

    <!-- Results -->
    <div v-else-if="suggestions">
      <!-- Extracted keywords -->
      <div style="margin-bottom:var(--space-md)">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">提取关键词：</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          <span v-for="kw in suggestions.keywords" :key="kw"
            class="cohere-tag"
            :class="kw.startsWith('#') ? 'cohere-tag-success' : 'cohere-tag-info'"
            style="font-size:12px;padding:2px 8px;border-radius:4px">
            {{ kw }}
          </span>
        </div>
      </div>

      <!-- Related terms -->
      <div v-if="suggestions.relatedTerms && suggestions.relatedTerms.length > 0" style="margin-bottom:var(--space-md)">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">相关话题：</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          <span v-for="term in suggestions.relatedTerms" :key="term"
            class="cohere-tag cohere-tag-info"
            style="font-size:12px;padding:2px 8px;border-radius:4px">
            {{ term }}
          </span>
        </div>
      </div>

      <!-- Per-platform tags -->
      <div v-if="suggestions.byPlatform">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">各平台标签：</div>
        <div v-for="(tags, platform) in suggestions.byPlatform" :key="platform" style="margin-bottom:var(--space-sm);padding:var(--space-sm);background:#f8f9fa;border-radius:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:12px;font-weight:600;color:var(--text)">{{ platformLabel(platform) }}</span>
            <button class="cohere-btn-ghost" @click="copyPlatformTags(platform, tags)" style="font-size:11px;padding:2px 8px">
              复制标签
            </button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            <span v-for="tag in tags" :key="tag"
              class="cohere-tag"
              :class="tag.startsWith('#') ? 'cohere-tag-success' : 'cohere-tag-info'"
              style="font-size:11px;padding:2px 6px;border-radius:4px">
              {{ tag }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { usePlatformStore } from '@/stores/platforms'
import { ElMessage } from 'element-plus'
import { intelligenceSuggestTags } from '@/api/publisher'

const props = defineProps({
  content: { type: String, required: true },
})

defineEmits(['close'])

const loading = ref(false)
const error = ref(null)
const suggestions = ref(null)
const platformStore = usePlatformStore()
platformStore.load()

function platformLabel (key) {
  return platformStore.getLabel(key) || key
}

let debounceTimer = null
watch(() => props.content, (newVal) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!newVal || newVal.trim().length < 3) {
    suggestions.value = null
    error.value = null
    return
  }
  debounceTimer = setTimeout(async () => {
    loading.value = true
    error.value = null
    try {
      const res = await intelligenceSuggestTags(newVal, {
        platforms: ['zhihu', 'weibo', 'xiaohongshu', 'bilibili', 'toutiao'],
      })
      if (res && res.keywords) {
        suggestions.value = res
      } else {
        suggestions.value = { keywords: [], relatedTerms: [], byPlatform: {} }
      }
    } catch (e) {
      error.value = '标签分析失败: ' + e.message
      suggestions.value = null
    } finally {
      loading.value = false
    }
  }, 800)
})

async function copyPlatformTags (platform, tags) {
  const text = tags.join(' ')
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`已复制 ${platformLabel(platform)} 标签`)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    ElMessage.success(`已复制 ${platformLabel(platform)} 标签`)
  }
}
</script>

<style scoped>
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
