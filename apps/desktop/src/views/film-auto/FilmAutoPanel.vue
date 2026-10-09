<script setup>
/**
 * FilmAutoPanel — 自动模式面板（表单骨架；规划/执行/编辑流程按 tasks 4.2-5.5 落地）
 *
 * 输入契约（design D10 / spec「自动模式输入与校验契约」）：
 *   剧本 ≤10000 字（必填）、人物参考图 ≤8（可选，带角色名）、场景参考图 ≤8（可选）、
 *   画面方向 16x9|9x16、大概时长 10–600s；单镜秒数 5|8|10 置于「高级」折叠区。
 *
 * 文案契约：所有用户可见文字走 filmEngineering.auto 命名空间 t(key)，本文件不写中文字面量。
 */
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  MAX_AUTO_SCRIPT_LENGTH, MAX_AUTO_REFS, MIN_AUTO_DURATION_SEC, MAX_AUTO_DURATION_SEC,
  AUTO_ASPECTS, AUTO_SHOT_SECONDS,
  AUTO_DEFAULT_ASPECT, AUTO_DEFAULT_SHOT_SECONDS, AUTO_DEFAULT_TARGET_DURATION_SEC,
  planShotCount,
} from './auto-constants'

const DURATION_PRESETS = Object.freeze([30, 60, 90, 120])

const { t } = useI18n()

const form = reactive({
  script: '',
  characterRefs: [],
  sceneRefs: [],
  aspect: AUTO_DEFAULT_ASPECT,
  targetDurationSec: AUTO_DEFAULT_TARGET_DURATION_SEC,
  shotSeconds: AUTO_DEFAULT_SHOT_SECONDS,
})

const scriptLength = computed(() => String(form.script || '').trim().length)
const scriptTooLong = computed(() => scriptLength.value > MAX_AUTO_SCRIPT_LENGTH)
const scriptEmpty = computed(() => scriptLength.value === 0)
const durationValid = computed(() => (
  Number.isInteger(form.targetDurationSec) &&
  form.targetDurationSec >= MIN_AUTO_DURATION_SEC &&
  form.targetDurationSec <= MAX_AUTO_DURATION_SEC
))
const plannedShotCount = computed(() => planShotCount(form.targetDurationSec, form.shotSeconds))
const plannedDurationSec = computed(() => plannedShotCount.value * Number(form.shotSeconds))
const canPlan = computed(() => !scriptEmpty.value && !scriptTooLong.value && durationValid.value)

function aspectLabel (value) {
  return value === '9x16' ? t('filmEngineering.auto.aspect916') : t('filmEngineering.auto.aspect169')
}

defineExpose({ form, canPlan, plannedShotCount, plannedDurationSec, scriptLength, scriptTooLong, durationValid })
</script>

<template>
  <div class="fa-panel" data-testid="film-auto-panel">
    <section class="fa-card">
      <label class="fa-label" for="fa-script">{{ t('filmEngineering.auto.scriptLabel') }}</label>
      <el-input
        id="fa-script"
        v-model="form.script"
        type="textarea"
        :rows="8"
        :maxlength="MAX_AUTO_SCRIPT_LENGTH"
        :placeholder="t('filmEngineering.auto.scriptPlaceholder')"
        data-testid="fa-script"
      />
      <div class="fa-meta">
        <span :class="{ 'is-danger': scriptTooLong }" data-testid="fa-script-count">{{ t('filmEngineering.auto.scriptCount', { n: scriptLength }) }}</span>
        <span v-if="scriptTooLong" class="fa-error" data-testid="fa-script-too-long">{{ t('filmEngineering.auto.scriptTooLong') }}</span>
      </div>
    </section>

    <section class="fa-card">
      <div class="fa-label">{{ t('filmEngineering.auto.charRefs') }}</div>
      <p class="fa-hint">{{ t('filmEngineering.auto.charRefsHint', { max: MAX_AUTO_REFS }) }}</p>
    </section>

    <section class="fa-card">
      <div class="fa-label">{{ t('filmEngineering.auto.sceneRefs') }}</div>
      <p class="fa-hint">{{ t('filmEngineering.auto.sceneRefsHint', { max: MAX_AUTO_REFS }) }}</p>
    </section>

    <section class="fa-card fa-row">
      <div class="fa-field">
        <div class="fa-label">{{ t('filmEngineering.auto.aspect') }}</div>
        <div class="fa-choices" role="radiogroup" :aria-label="t('filmEngineering.auto.aspect')">
          <label v-for="a in AUTO_ASPECTS" :key="a" class="fa-choice">
            <input v-model="form.aspect" type="radio" :value="a" :data-testid="'fa-aspect-' + a" />
            <span>{{ aspectLabel(a) }}</span>
          </label>
        </div>
      </div>
      <div class="fa-field">
        <div class="fa-label">{{ t('filmEngineering.auto.duration') }}</div>
        <div class="fa-choices">
          <button
            v-for="p in DURATION_PRESETS"
            :key="p"
            type="button"
            :class="['fa-chip', { active: Number(form.targetDurationSec) === p }]"
            :data-testid="'fa-duration-preset-' + p"
            @click="form.targetDurationSec = p"
          >{{ t('filmEngineering.auto.durationPreset', { n: p }) }}</button>
        </div>
        <el-input v-model.number="form.targetDurationSec" size="small" type="number" data-testid="fa-duration" />
        <p v-if="!durationValid" class="fa-error" data-testid="fa-duration-error">{{ t('filmEngineering.auto.durationRange', { min: MIN_AUTO_DURATION_SEC, max: MAX_AUTO_DURATION_SEC }) }}</p>
      </div>
    </section>

    <el-collapse class="fa-advanced">
      <el-collapse-item :title="t('filmEngineering.auto.advanced')" name="advanced">
        <div class="fa-label">{{ t('filmEngineering.auto.shotSeconds') }}</div>
        <el-select v-model="form.shotSeconds" size="small" data-testid="fa-shot-seconds">
          <el-option v-for="s in AUTO_SHOT_SECONDS" :key="s" :label="t('filmEngineering.auto.shotSecondsN', { n: s })" :value="s" />
        </el-select>
      </el-collapse-item>
    </el-collapse>

    <section class="fa-card">
      <p class="fa-estimate" data-testid="fa-estimate">
        {{ t('filmEngineering.auto.estimate', { shots: plannedShotCount, seconds: plannedDurationSec }) }}
      </p>
      <el-button type="primary" size="small" :disabled="!canPlan" data-testid="fa-plan">
        {{ t('filmEngineering.auto.planBtn') }}
      </el-button>
    </section>
  </div>
</template>

<style scoped>
.fa-panel { padding: 16px 24px 24px; display: flex; flex-direction: column; gap: 12px; overflow: auto; }
.fa-card { border: 1px solid var(--el-border-color-lighter, #ebeef5); border-radius: 8px; padding: 12px 14px; }
.fa-label { font-size: var(--font-size-sm, 13px); font-weight: 600; margin-bottom: 8px; }
.fa-hint { margin: 0; color: var(--el-text-color-secondary, #909399); font-size: var(--font-size-xs, 12px); line-height: 1.6; }
.fa-meta { display: flex; justify-content: space-between; margin-top: 6px; font-size: var(--font-size-xs, 12px); color: var(--el-text-color-secondary, #909399); }
.fa-meta .is-danger, .fa-error { color: var(--el-color-danger, #f56c6c); }
.fa-row { display: flex; gap: 16px; flex-wrap: wrap; }
.fa-field { min-width: 200px; }
.fa-choices { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
.fa-choice { display: inline-flex; align-items: center; gap: 4px; font-size: var(--font-size-sm, 13px); }
.fa-chip { appearance: none; border: 1px solid var(--el-border-color, #dcdfe6); background: transparent; border-radius: 999px; padding: 2px 10px; font-size: var(--font-size-xs, 12px); cursor: pointer; }
.fa-chip.active { border-color: var(--el-color-primary, #5048e5); color: var(--el-color-primary, #5048e5); font-weight: 600; }
.fa-estimate { margin: 0 0 8px; font-size: var(--font-size-sm, 13px); color: var(--el-text-color-regular, #606266); }
.fa-advanced { border: 1px solid var(--el-border-color-lighter, #ebeef5); border-radius: 8px; padding: 0 12px; }
</style>
