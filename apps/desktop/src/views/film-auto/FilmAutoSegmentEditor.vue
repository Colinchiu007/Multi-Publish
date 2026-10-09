<script setup>
/**
 * FilmAutoSegmentEditor — 自动模式的「片段修改」入口（openspec change: film-auto-mode，design D15/D16）
 *
 * 交互范式复用故事讲述流水线的成片编辑（`ResultView.vue` 的分段卡片：可直接改文本、可只重跑这一段），
 * 但数据落**影视工程自己的契约**（`film-engineering:auto-update-shot` / `auto-regenerate-shot`），
 * 因为两者真源不同（s2v 是 s2v project，自动模式是 auto taskId 的 project.json）。
 *
 * 三条纪律：
 *   - 保存只写项目文件（内容真源），**不动**计划文件与台账；服务端会据此把 editedAt 推后，
 *     从而让下一次「启动/重生成」必须先重新确认（成本门槛不会被编辑绕过）；
 *   - 重新生成是**单镜**行为：按镜号定位批次目录，临时目录生成 → ffprobe 校验 → rename 原子覆盖，
 *     失败不破坏既有产物（服务端保证，本组件只负责如实回显结果）；
 *   - 提示词**逐字符**提交，不经任何润色/优化器（影视工程原样直送合同）。
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MAX_AUTO_SHOT_PROMPT_LENGTH, AUTO_SHOT_SECONDS } from './auto-constants'

const props = defineProps({
  /** 待编辑片段（auto-status 投影里的 shot；null 表示未选中） */
  shot: { type: Object, default: null },
  shotIndex: { type: Number, default: -1 },
})
const emit = defineEmits(['close', 'save', 'regenerate'])

const { t } = useI18n()
const draftPrompt = ref('')
const draftSeconds = ref(5)
const saving = ref(false)
const regenerating = ref(false)
const errorText = ref('')

const originalPrompt = computed(() => (props.shot && typeof props.shot.prompt === 'string' ? props.shot.prompt : ''))
const changed = computed(() => draftPrompt.value !== originalPrompt.value || Number(draftSeconds.value) !== Number(props.shot && props.shot.seconds))
const promptLength = computed(() => String(draftPrompt.value || '').length)
const promptTooLong = computed(() => promptLength.value > MAX_AUTO_SHOT_PROMPT_LENGTH)
const outputPath = computed(() => (props.shot && props.shot.outputPath) || '')
const fileUrl = computed(() => {
  if (!outputPath.value) return ''
  const normalized = String(outputPath.value).replace(/\\/g, '/')
  return normalized.startsWith('/') ? 'file://' + normalized : 'file:///' + normalized
})

watch(() => props.shot, (s) => {
  draftPrompt.value = s && typeof s.prompt === 'string' ? s.prompt : ''
  draftSeconds.value = s && s.seconds ? Number(s.seconds) : 5
  errorText.value = ''
}, { immediate: true })

function restoreOriginal () {
  draftPrompt.value = originalPrompt.value
}

async function save () {
  if (!props.shot || props.shotIndex < 0) return
  if (promptTooLong.value) {
    errorText.value = t('filmEngineering.auto.segment.promptTooLong', { max: MAX_AUTO_SHOT_PROMPT_LENGTH })
    return
  }
  if (String(draftPrompt.value || '').trim() === '') {
    errorText.value = t('filmEngineering.auto.segment.promptRequired')
    return
  }
  saving.value = true
  errorText.value = ''
  const patch = { prompt: draftPrompt.value }
  if (Number(draftSeconds.value) !== Number(props.shot.seconds)) patch.seconds = Number(draftSeconds.value)
  const result = await new Promise((resolve) => {
    emit('save', { shotIndex: props.shotIndex, patch, done: resolve })
    // 父组件不回调时按「已提交」处理，避免面板卡住（父组件会经 errorText 回显失败）
    setTimeout(() => resolve({ ok: true }), 0)
  })
  saving.value = false
  if (result && result.ok === false) {
    errorText.value = result.message || t('filmEngineering.auto.segment.saveFailed')
    return
  }
  if (typeof emit === 'function') emit('close')
}

async function regenerate () {
  if (!props.shot || props.shotIndex < 0) return
  regenerating.value = true
  errorText.value = ''
  emit('regenerate', props.shotIndex)
  setTimeout(() => { regenerating.value = false }, 0)
}

defineExpose({ draftPrompt, draftSeconds, changed, promptLength, promptTooLong, fileUrl, save, regenerate, restoreOriginal })
</script>

<template>
  <div class="fae" data-testid="fa-segment-editor">
    <div class="fae-head">
      <span class="fae-title">{{ t('filmEngineering.auto.segment.title', { shotId: shot ? shot.shotId : '' }) }}</span>
      <el-button size="small" link data-testid="fa-segment-close" @click="emit('close')">{{ t('filmEngineering.auto.segment.close') }}</el-button>
    </div>
    <p v-if="errorText" class="fae-error" data-testid="fa-segment-error">{{ errorText }}</p>

    <div class="fae-body">
      <div class="fae-left">
        <div class="fae-label">{{ t('filmEngineering.auto.segment.promptLabel') }}</div>
        <el-input v-model="draftPrompt" type="textarea" :rows="10" :maxlength="MAX_AUTO_SHOT_PROMPT_LENGTH" data-testid="fa-segment-prompt" />
        <div class="fae-meta">
          <span :class="{ 'is-danger': promptTooLong }" data-testid="fa-segment-count">{{ t('filmEngineering.auto.segment.promptCount', { n: promptLength, max: MAX_AUTO_SHOT_PROMPT_LENGTH }) }}</span>
          <el-button size="small" link :disabled="!changed" data-testid="fa-segment-restore" @click="restoreOriginal">{{ t('filmEngineering.auto.segment.restore') }}</el-button>
        </div>
        <div class="fae-label">{{ t('filmEngineering.auto.segment.secondsLabel') }}</div>
        <el-select v-model="draftSeconds" size="small" data-testid="fa-segment-seconds">
          <el-option v-for="s in AUTO_SHOT_SECONDS" :key="s" :label="t('filmEngineering.auto.shotSecondsN', { n: s })" :value="s" />
        </el-select>
        <p class="fae-hint">{{ t('filmEngineering.auto.segment.verbatimHint') }}</p>
        <div class="fae-actions">
          <el-button type="primary" size="small" :loading="saving" :disabled="!changed || promptTooLong" data-testid="fa-segment-save" @click="save">
            {{ t('filmEngineering.auto.segment.save') }}
          </el-button>
          <el-button size="small" :loading="regenerating" data-testid="fa-segment-regen" @click="regenerate">
            {{ t('filmEngineering.auto.segment.regenerate') }}
          </el-button>
        </div>
      </div>
      <div class="fae-right">
        <div class="fae-label">{{ t('filmEngineering.auto.segment.previewLabel') }}</div>
        <video v-if="fileUrl" class="fae-video" :src="fileUrl" controls data-testid="fa-segment-video"></video>
        <p v-else class="fae-hint" data-testid="fa-segment-nopreview">{{ t('filmEngineering.auto.segment.noPreview') }}</p>
        <p v-if="shot && shot.status" class="fae-hint">{{ t('filmEngineering.auto.colStatus') }}: {{ t('filmEngineering.auto.shotStatus.' + shot.status) }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fae { border: 1px solid var(--el-border-color, #dcdfe6); border-radius: 8px; padding: 12px 14px; background: var(--el-bg-color, #fff); }
.fae-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.fae-title { font-size: var(--font-size-sm, 13px); font-weight: 600; }
.fae-body { display: flex; gap: 16px; flex-wrap: wrap; }
.fae-left { flex: 1 1 420px; min-width: 320px; }
.fae-right { flex: 1 1 280px; min-width: 240px; }
.fae-label { font-size: var(--font-size-sm, 13px); font-weight: 600; margin: 8px 0 6px; }
.fae-meta { display: flex; justify-content: space-between; align-items: center; font-size: var(--font-size-xs, 12px); color: var(--el-text-color-secondary, #909399); margin: 4px 0; }
.fae-meta .is-danger, .fae-error { color: var(--el-color-danger, #f56c6c); }
.fae-hint { margin: 6px 0 0; color: var(--el-text-color-secondary, #909399); font-size: var(--font-size-xs, 12px); line-height: 1.6; }
.fae-actions { display: flex; gap: 8px; margin-top: 10px; }
.fae-video { width: 100%; max-height: 260px; border-radius: 6px; background: #000; }
</style>
