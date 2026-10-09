<script setup>
/**
 * FilmAutoPanel — 影视工程「自动」模式面板（openspec change: film-auto-mode）
 *
 * 目标（用户原话）：越简单越好——输入一段文案、可选人物/场景参考图、设定横竖屏与大概时长，
 * 其余全部由程序完成生成与合成；生成后可对某个片段修改调整。
 *
 * 因此本面板只承担「人类必须做的那几步决策」：
 *   ① 输入  → ② 预览确认（清单式，非金额）→ ③ 运行（进度/逐镜状态）→ ④ 收口合成 → ⑤ 片段编辑
 * 其余一切（分场、镜数规划、提示词套用影视工程模板、角色槽位、参考绑定、分批、续跑、磁盘复核）
 * 全部在服务端（IPC/服务层）完成，面板不做任何业务推断——这是「应用底层全部积累」的纪律：
 * 面板越薄，越不可能绕过成本门槛与账本。
 *
 * 复用（不重造）：
 *   - 进度流程：story2video 的 `StageProgress.vue`（`testidPrefix="film-auto"` 参数化复用）
 *   - 合成路径：`pipelineStartOrchestrated('film-engineering', { initialContext: { renderManifest } })`
 *     ——与全量出片收口**同一条**引擎路径（manifest 直通 run，generate_videos 过闸零调用）
 *   - 参考图存储：`film-engineering:upload-reference`（受控媒体根 + 引用计数回收）
 *
 * 安全/正确性契约：
 *   - `auto-start` 只传 `{planId, taskId, confirmed, overwrite}`：分镜与参考图路径一律由服务端从
 *     自己落盘的计划重建，渲染端**不具备**伪造分镜的能力；
 *   - 未勾选确认 → 不调用 `auto-start`；服务端返回 `needsReconfirm`（编辑过/计划变更）时回到确认卡；
 *   - 事件推送优先 + 轮询兜底（3000ms），runId/taskId 守卫防止陈旧响应覆盖新状态（对齐 story2video 纪律）。
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import StageProgress from '@/views/video-creation/StageProgress.vue'
import { pipelineStartOrchestrated, onPipelineUpdate } from '@/api/publisher'
import FilmAutoSegmentEditor from './FilmAutoSegmentEditor.vue'
import {
  MAX_AUTO_SCRIPT_LENGTH, MAX_AUTO_REFS, MIN_AUTO_DURATION_SEC, MAX_AUTO_DURATION_SEC,
  AUTO_ASPECTS, AUTO_SHOT_SECONDS,
  AUTO_DEFAULT_ASPECT, AUTO_DEFAULT_SHOT_SECONDS, AUTO_DEFAULT_TARGET_DURATION_SEC,
  planShotCount,
} from './auto-constants'

const DURATION_PRESETS = Object.freeze([30, 60, 90, 120])

const props = defineProps({
  /** 注入 window.electronAPI.filmEngineering（测试用；生产为 null 时自动取全局） */
  api: { type: Object, default: null },
  pollIntervalMs: { type: Number, default: 3000 },
})

const { t } = useI18n()

function feApi () {
  if (props.api) return props.api
  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.filmEngineering) {
    return window.electronAPI.filmEngineering
  }
  return null
}

/** 阶段机：input（填表）→ preview（清单确认）→ running → done（可收口/可编辑） */
const phase = ref('input')
const busy = ref(false)
const errorText = ref('')

const form = reactive({
  script: '',
  aspect: AUTO_DEFAULT_ASPECT,
  targetDurationSec: AUTO_DEFAULT_TARGET_DURATION_SEC,
  shotSeconds: AUTO_DEFAULT_SHOT_SECONDS,
})
/** @type {import('vue').Ref<Array<{name:string,path:string}>>} */
const characterRefs = ref([])
/** @type {import('vue').Ref<string[]>} */
const sceneRefs = ref([])
const uploadingKind = ref('')

/** 服务端预览投影（完整提示词只在服务端计划文件里） */
const plan = ref(null)
/** 项目视图（auto-status 投影；含可编辑 shots） */
const project = ref(null)
const progress = ref({ doneCount: 0, totalCount: 0, batchIndex: null, lastType: '' })
const confirmed = ref(false)
const overwriteExisting = ref(false)
const editingShotIndex = ref(null)
const composeRunId = ref('')
const composePercent = ref(0)
const finalUnavailable = ref('')

let unsubscribeAuto = null
let unsubscribePipeline = null
let pollTimer = null
let composePollTimer = null
let fileInput = null

const scriptLength = computed(() => String(form.script || '').trim().length)
const scriptTooLong = computed(() => scriptLength.value > MAX_AUTO_SCRIPT_LENGTH)
const durationValid = computed(() => (
  Number.isInteger(form.targetDurationSec) &&
  form.targetDurationSec >= MIN_AUTO_DURATION_SEC &&
  form.targetDurationSec <= MAX_AUTO_DURATION_SEC
))
const estimatedShots = computed(() => planShotCount(form.targetDurationSec, form.shotSeconds))
const canPlan = computed(() => !busy.value && scriptLength.value > 0 && !scriptTooLong.value && durationValid.value)
const percent = computed(() => {
  const total = Number(progress.value.totalCount) || 0
  if (total <= 0) return 0
  return Math.round((Number(progress.value.doneCount) || 0) / total * 100)
})
const stepIndex = computed(() => ({ input: 0, preview: 1, running: 2, done: 3 }[phase.value] || 0))

/** StageProgress 阶段清单：把 auto 的批次进度映射成阶段列表（复用既有渲染与状态语义） */
const stageList = computed(() => {
  const total = Number(progress.value.totalCount) || Number(plan.value?.shotCount) || 0
  const done = Number(progress.value.doneCount) || 0
  const running = phase.value === 'running'
  const finished = phase.value === 'done'
  const batchCount = Number(plan.value?.batchCount) || (plan.value?.estimates?.batchCount) || 1
  const planStage = { name: 'film_auto_plan', status: phase.value === 'preview' ? 'paused' : 'completed' }
  const genStage = {
    name: 'film_auto_generate',
    status: finished ? 'completed' : (running ? 'running' : 'pending'),
    progress: total > 0 ? { percent: Math.round(done / total * 100), messageKey: 'filmEngineering.auto.stageShotProgress', messageParams: { done, total } } : null,
  }
  const composeStage = {
    name: 'film_auto_render',
    status: composeRunId.value ? (composePercent.value >= 100 ? 'completed' : 'running') : (finished ? 'pending' : 'pending'),
    progress: composeRunId.value ? { percent: composePercent.value } : null,
  }
  void batchCount
  return [planStage, genStage, composeStage]
})

const shots = computed(() => (project.value && Array.isArray(project.value.shots) ? project.value.shots : []))

function fail (message) {
  errorText.value = message || t('filmEngineering.auto.genericError')
  ElMessage.error(errorText.value)
}

function unwrap (res) {
  if (!res || res.code !== 0) {
    const err = new Error((res && res.message) || 'IPC error')
    err.errorCode = res && res.errorCode
    err.envelope = res
    throw err
  }
  return res.data
}

// ── 参考图（复用 upload-reference：受控根 + 引用计数）────────────────────

function pickRefFile (kind) {
  uploadingKind.value = kind
  if (typeof document === 'undefined') return
  if (!fileInput) {
    fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/png,image/jpeg,image/webp'
    fileInput.style.display = 'none'
    if (document.body) document.body.appendChild(fileInput)
  }
  fileInput.onchange = () => {
    const file = fileInput.files && fileInput.files[0]
    fileInput.value = ''
    if (file) void uploadRefFile(kind, file)
  }
  fileInput.click()
}

/** 供测试与拖拽入口复用的上传路径（file 为浏览器 File 或 {name, dataUrl}） */
async function uploadRefFile (kind, file) {
  const api = feApi()
  if (!api) return fail(t('filmEngineering.auto.noDesktop'))
  const limit = kind === 'character' ? characterRefs.value.length : sceneRefs.value.length
  if (limit >= MAX_AUTO_REFS) return fail(t('filmEngineering.auto.refsFull', { max: MAX_AUTO_REFS }))
  try {
    const dataUrl = file.dataUrl || await readAsDataUrl(file)
    uploadingKind.value = kind
    const data = unwrap(await api.uploadReference({ dataUrl, kind }))
    const stored = data && (data.path || data.filePath)
    if (!stored) throw new Error(t('filmEngineering.auto.uploadNoPath'))
    if (kind === 'character') {
      const base = String(file.name || '').replace(/\.[^.]+$/, '').slice(0, 20)
      characterRefs.value = characterRefs.value.concat([{ name: base || t('filmEngineering.auto.defaultCharName'), path: stored }])
    } else {
      sceneRefs.value = sceneRefs.value.concat([stored])
    }
    errorText.value = ''
  } catch (e) {
    fail((e && e.message) || String(e))
  } finally {
    uploadingKind.value = ''
  }
}

function readAsDataUrl (file) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') return reject(new Error('FileReader unavailable'))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function removeCharRef (index) {
  characterRefs.value = characterRefs.value.filter((_r, i) => i !== index)
}
function removeSceneRef (index) {
  sceneRefs.value = sceneRefs.value.filter((_p, i) => i !== index)
}

// ── ① → ② 规划（零 provider 调用）──────────────────────────────────────

async function runPlan () {
  const api = feApi()
  if (!api) return fail(t('filmEngineering.auto.noDesktop'))
  if (!canPlan.value) return fail(scriptTooLong.value ? t('filmEngineering.auto.scriptTooLong') : t('filmEngineering.auto.durationRange', { min: MIN_AUTO_DURATION_SEC, max: MAX_AUTO_DURATION_SEC }))
  busy.value = true
  errorText.value = ''
  try {
    const payload = JSON.parse(JSON.stringify({
      script: form.script,
      characterRefs: characterRefs.value,
      sceneRefs: sceneRefs.value,
      aspect: form.aspect,
      seconds: Number(form.shotSeconds),
      targetDurationSec: Number(form.targetDurationSec),
    }))
    const data = unwrap(await api.autoPlan(payload))
    plan.value = data
    project.value = null
    progress.value = { doneCount: 0, totalCount: Number(data.shotCount) || 0, batchIndex: null, lastType: '' }
    confirmed.value = false
    overwriteExisting.value = false
    phase.value = 'preview'
  } catch (e) {
    fail((e && e.message) || String(e))
  } finally {
    busy.value = false
  }
}

// ── ② → ③ 启动（服务端重建分镜；渲染端只递确认与归属）──────────────────

async function startRun () {
  const api = feApi()
  if (!api) return fail(t('filmEngineering.auto.noDesktop'))
  if (!plan.value) return
  if (!confirmed.value) return fail(t('filmEngineering.auto.mustConfirm'))
  busy.value = true
  errorText.value = ''
  try {
    const payload = JSON.parse(JSON.stringify({
      planId: plan.value.planId,
      taskId: plan.value.taskId,
      confirmed: true,
      overwrite: overwriteExisting.value === true,
    }))
    const data = unwrap(await api.autoStart(payload))
    if (data && data.needsReconfirm) {
      // 服务端认为需要重新确认（计划变更/此前编辑过）——回到确认卡，不偷偷开跑
      confirmed.value = false
      phase.value = 'preview'
      return
    }
    progress.value = { doneCount: Number(data.doneCount) || 0, totalCount: Number(data.totalCount) || progress.value.totalCount, batchIndex: null, lastType: '' }
    if (data && Array.isArray(data.renderManifest) && data.renderManifest.length > 0) {
      phase.value = 'done'
    } else {
      phase.value = 'running'
      startPolling()
    }
    await refreshStatus()
  } catch (e) {
    fail((e && e.message) || String(e))
  } finally {
    busy.value = false
  }
}

// ── 只读状态同步（事件优先 + 轮询兜底）─────────────────────────────────

async function refreshStatus () {
  const api = feApi()
  if (!api || !plan.value) return
  try {
    const data = unwrap(await api.autoStatus({ taskId: plan.value.taskId }))
    if (!data || !data.exists) return
    project.value = data
    progress.value = {
      doneCount: Number(data.doneCount) || 0,
      totalCount: Number(data.totalCount) || progress.value.totalCount,
      batchIndex: progress.value.batchIndex,
      lastType: progress.value.lastType,
    }
    if (data.running) {
      phase.value = 'running'
    } else if (Number(data.doneCount) >= Number(data.totalCount) && Number(data.totalCount) > 0) {
      finalUnavailable.value = data.manifestError || ''
      phase.value = 'done'
      stopPolling()
    }
  } catch { /* 轮询失败不改状态（下一轮重试） */ }
}

function applyAutoEvent (evt) {
  if (!evt || typeof evt !== 'object') return
  progress.value = {
    doneCount: Number(evt.doneCount) || progress.value.doneCount,
    totalCount: Number(evt.totalCount) || progress.value.totalCount,
    batchIndex: evt.batchIndex === undefined ? progress.value.batchIndex : evt.batchIndex,
    lastType: String(evt.type || ''),
  }
  if (evt.type === 'production:complete') {
    stopPolling()
    void refreshStatus()
  }
}

function startPolling () {
  stopPolling()
  const interval = Number(props.pollIntervalMs) > 0 ? Number(props.pollIntervalMs) : 3000
  pollTimer = setInterval(() => { void refreshStatus() }, interval)
}

function stopPolling () {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

// ── ④ 收口合成（与全量出片同一条引擎路径）──────────────────────────────

async function compose () {
  const api = feApi()
  if (!api || !plan.value) return
  busy.value = true
  errorText.value = ''
  try {
    const data = unwrap(await api.autoCompose({ taskId: plan.value.taskId }))
    const manifest = data && data.renderManifest
    if (!Array.isArray(manifest) || manifest.length === 0) throw new Error(t('filmEngineering.auto.composeNoManifest'))
    const payload = JSON.parse(JSON.stringify({ autoAdvance: true, initialContext: { renderManifest: manifest } }))
    const res = await pipelineStartOrchestrated('film-engineering', payload)
    if (!res || res.code !== 0 || !res.data || !res.data.success || !res.data.runId) {
      throw new Error((res && (res.message || (res.data && res.data.error))) || t('filmEngineering.auto.composeFailed'))
    }
    composeRunId.value = res.data.runId
    composePercent.value = 0
    unsubscribePipeline = onPipelineUpdate((snapshot) => {
      const p = snapshot && snapshot.progress
      if (typeof p === 'number') composePercent.value = Math.max(0, Math.min(100, Math.round(p)))
    })
    startComposePolling()
  } catch (e) {
    fail((e && e.message) || String(e))
  } finally {
    busy.value = false
  }
}

async function pollCompose () {
  const api = feApi()
  if (!api || !plan.value) return
  try {
    const data = unwrap(await api.autoStatus({ taskId: plan.value.taskId }))
    if (data) project.value = data
  } catch { /* 忽略 */ }
}

function startComposePolling () {
  if (composePollTimer) clearInterval(composePollTimer)
  const interval = Number(props.pollIntervalMs) > 0 ? Number(props.pollIntervalMs) : 3000
  composePollTimer = setInterval(() => { void pollCompose() }, interval)
}

// ── ⑤ 片段编辑 ────────────────────────────────────────────────────────

function openEditor (index) {
  editingShotIndex.value = index
}

async function saveShotEdit (payload) {
  const api = feApi()
  if (!api || !plan.value) return { ok: false }
  try {
    const data = unwrap(await api.autoUpdateShot({ taskId: plan.value.taskId, shotIndex: payload.shotIndex, patch: payload.patch }))
    await refreshStatus()
    return { ok: true, shot: data && data.shot }
  } catch (e) {
    fail((e && e.message) || String(e))
    return { ok: false, message: (e && e.message) || String(e) }
  }
}

async function regenerateShot (index) {
  const api = feApi()
  if (!api || !plan.value) return { ok: false }
  try {
    const data = unwrap(await api.autoRegenerateShot({ taskId: plan.value.taskId, shotIndex: index, confirmed: true }))
    if (data && data.needsReconfirm) return { ok: false, needsReconfirm: true }
    await refreshStatus()
    if (typeof data !== 'undefined') errorText.value = ''
    return { ok: true, path: data && data.path }
  } catch (e) {
    fail((e && e.message) || String(e))
    return { ok: false, message: (e && e.message) || String(e) }
  }
}

function resetAll () {
  phase.value = 'input'
  plan.value = null
  project.value = null
  confirmed.value = false
  composeRunId.value = ''
  composePercent.value = 0
  progress.value = { doneCount: 0, totalCount: 0, batchIndex: null, lastType: '' }
  stopPolling()
}

onMounted(() => {
  const api = feApi()
  if (api && typeof api.onAutoUpdate === 'function') {
    unsubscribeAuto = api.onAutoUpdate(applyAutoEvent)
  }
})

onBeforeUnmount(() => {
  if (typeof unsubscribeAuto === 'function') unsubscribeAuto()
  if (typeof unsubscribePipeline === 'function') unsubscribePipeline()
  stopPolling()
  if (composePollTimer) { clearInterval(composePollTimer); composePollTimer = null }
  if (fileInput && fileInput.parentNode) fileInput.parentNode.removeChild(fileInput)
  fileInput = null
})

defineExpose({
  form, characterRefs, sceneRefs, plan, project, phase, progress, confirmed, busy, errorText,
  percent, stageList, shots, estimatedShots, canPlan, scriptLength, scriptTooLong, durationValid,
  runPlan, startRun, refreshStatus, applyAutoEvent, compose, saveShotEdit, regenerateShot,
  uploadRefFile, pickRefFile, removeCharRef, removeSceneRef, resetAll, openEditor,
})
</script>

<template>
  <div class="fa-panel" data-testid="film-auto-panel">
    <el-steps :active="stepIndex" simple class="fa-steps">
      <el-step :title="t('filmEngineering.auto.stepInput')" />
      <el-step :title="t('filmEngineering.auto.stepConfirm')" />
      <el-step :title="t('filmEngineering.auto.stepRun')" />
      <el-step :title="t('filmEngineering.auto.stepDone')" />
    </el-steps>

    <p v-if="errorText" class="fa-error fa-error-bar" data-testid="fa-error">{{ errorText }}</p>

    <!-- ① 输入 -->
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
        <span v-if="scriptTooLong" class="fa-error">{{ t('filmEngineering.auto.scriptTooLong') }}</span>
      </div>
    </section>

    <section class="fa-card">
      <div class="fa-label">{{ t('filmEngineering.auto.charRefs') }}</div>
      <p class="fa-hint">{{ t('filmEngineering.auto.charRefsHint', { max: MAX_AUTO_REFS }) }}</p>
      <ul v-if="characterRefs.length" class="fa-ref-list" data-testid="fa-char-refs">
        <li v-for="(r, i) in characterRefs" :key="r.path + i" class="fa-ref-item">
          <el-input v-model="r.name" size="small" class="fa-ref-name" :placeholder="t('filmEngineering.auto.charNamePlaceholder')" :data-testid="'fa-char-name-' + i" />
          <span class="fa-ref-path" :title="r.path">{{ r.path }}</span>
          <el-button size="small" link :data-testid="'fa-char-remove-' + i" @click="removeCharRef(i)">{{ t('filmEngineering.auto.remove') }}</el-button>
        </li>
      </ul>
      <el-button size="small" :loading="uploadingKind === 'character'" :disabled="characterRefs.length >= MAX_AUTO_REFS" data-testid="fa-add-char" @click="pickRefFile('character')">
        {{ t('filmEngineering.auto.addCharRef') }}
      </el-button>
    </section>

    <section class="fa-card">
      <div class="fa-label">{{ t('filmEngineering.auto.sceneRefs') }}</div>
      <p class="fa-hint">{{ t('filmEngineering.auto.sceneRefsHint', { max: MAX_AUTO_REFS }) }}</p>
      <ul v-if="sceneRefs.length" class="fa-ref-list" data-testid="fa-scene-refs">
        <li v-for="(p, i) in sceneRefs" :key="p + i" class="fa-ref-item">
          <span class="fa-ref-path" :title="p">{{ p }}</span>
          <el-button size="small" link @click="removeSceneRef(i)">{{ t('filmEngineering.auto.remove') }}</el-button>
        </li>
      </ul>
      <el-button size="small" :loading="uploadingKind === 'scene'" :disabled="sceneRefs.length >= MAX_AUTO_REFS" data-testid="fa-add-scene" @click="pickRefFile('scene')">
        {{ t('filmEngineering.auto.addSceneRef') }}
      </el-button>
    </section>

    <section class="fa-card fa-row">
      <div class="fa-field">
        <div class="fa-label">{{ t('filmEngineering.auto.aspect') }}</div>
        <div class="fa-choices" role="radiogroup" :aria-label="t('filmEngineering.auto.aspect')">
          <label v-for="a in AUTO_ASPECTS" :key="a" class="fa-choice">
            <input v-model="form.aspect" type="radio" :value="a" :data-testid="'fa-aspect-' + a" />
            <span>{{ a === '9x16' ? t('filmEngineering.auto.aspect916') : t('filmEngineering.auto.aspect169') }}</span>
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
        <p v-if="!durationValid" class="fa-error">{{ t('filmEngineering.auto.durationRange', { min: MIN_AUTO_DURATION_SEC, max: MAX_AUTO_DURATION_SEC }) }}</p>
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

    <section class="fa-card fa-actions">
      <p class="fa-estimate" data-testid="fa-estimate">
        {{ t('filmEngineering.auto.estimate', { shots: estimatedShots, seconds: estimatedShots * Number(form.shotSeconds) }) }}
      </p>
      <el-button type="primary" size="small" :disabled="!canPlan" :loading="busy" data-testid="fa-plan" @click="runPlan">
        {{ t('filmEngineering.auto.planBtn') }}
      </el-button>
    </section>

    <!-- ② 预览确认（清单式；确认前零调用） -->
    <section v-if="plan" class="fa-card" data-testid="fa-preview">
      <div class="fa-label">{{ t('filmEngineering.auto.previewTitle') }}</div>
      <dl class="fa-kv">
        <div><dt>{{ t('filmEngineering.auto.kvTask') }}</dt><dd data-testid="fa-kv-task">{{ plan.taskId }}</dd></div>
        <div><dt>{{ t('filmEngineering.auto.kvShots') }}</dt><dd data-testid="fa-kv-shots">{{ plan.shotCount }}</dd></div>
        <div><dt>{{ t('filmEngineering.auto.kvBatches') }}</dt><dd>{{ plan.batchCount }}</dd></div>
        <div><dt>{{ t('filmEngineering.auto.kvDuration') }}</dt><dd>{{ t('filmEngineering.auto.kvDurationValue', { planned: plan.plannedDurationSec, target: plan.targetDurationSec }) }}</dd></div>
        <div><dt>{{ t('filmEngineering.auto.kvAspect') }}</dt><dd>{{ plan.aspect === '9x16' ? t('filmEngineering.auto.aspect916') : t('filmEngineering.auto.aspect169') }}</dd></div>
        <div><dt>{{ t('filmEngineering.auto.kvProvider') }}</dt><dd>{{ plan.provider && plan.provider.id ? plan.provider.id : t('filmEngineering.auto.kvProviderNone') }}</dd></div>
        <div><dt>{{ t('filmEngineering.auto.kvRefs') }}</dt><dd>{{ plan.shotsWithReferences }}</dd></div>
      </dl>

      <div v-if="plan.warnings && plan.warnings.length" class="fa-warnings" data-testid="fa-warnings">
        <div class="fa-label">{{ t('filmEngineering.auto.warningsTitle') }}</div>
        <ul>
          <li v-for="(w, i) in plan.warnings" :key="w.code + i" :data-testid="'fa-warning-' + w.code">{{ w.message }}</li>
        </ul>
      </div>

      <div v-if="plan.characterMap && Object.keys(plan.characterMap).length" class="fa-charmap" data-testid="fa-charmap">
        <span class="fa-label">{{ t('filmEngineering.auto.charMapTitle') }}</span>
        <span v-for="(name, slot) in plan.characterMap" :key="slot" class="fa-chip">{{ slot }} → {{ name }}</span>
      </div>

      <ul class="fa-shot-preview" data-testid="fa-shot-preview">
        <li v-for="s in plan.shots" :key="s.shotId">
          <span class="fa-shot-id">{{ s.shotId }}</span>
          <span class="fa-shot-title">{{ s.title }}</span>
          <span class="fa-shot-len">{{ t('filmEngineering.auto.promptChars', { n: s.promptLength }) }}</span>
          <span v-if="s.refPaths && s.refPaths.length" class="fa-shot-refs">🖼 {{ s.refPaths.length }}</span>
        </li>
      </ul>

      <label class="fa-confirm">
        <input v-model="confirmed" type="checkbox" data-testid="fa-confirm-check" />
        <span>{{ t('filmEngineering.auto.confirmCheckbox', { shots: plan.shotCount, seconds: plan.plannedDurationSec }) }}</span>
      </label>
      <p class="fa-hint" data-testid="fa-confirm-hint">{{ t('filmEngineering.auto.confirmHint') }}</p>
      <el-button type="primary" size="small" :disabled="!confirmed" :loading="busy" data-testid="fa-start" @click="startRun">
        {{ t('filmEngineering.auto.startBtn') }}
      </el-button>
    </section>

    <!-- ③ 运行 / ④ 收口 / ⑤ 片段编辑 -->
    <section v-if="phase === 'running' || phase === 'done'" class="fa-card" data-testid="fa-run">
      <StageProgress
        :stages="stageList"
        :progress-percent="percent"
        :summary="t('filmEngineering.auto.runSummary', { done: progress.doneCount, total: progress.totalCount })"
        testid-prefix="film-auto"
      />
      <p class="fa-hint" data-testid="fa-run-hint">{{ t('filmEngineering.auto.runHint') }}</p>

      <table v-if="shots.length" class="fa-shots" data-testid="fa-shots">
        <thead>
          <tr>
            <th>{{ t('filmEngineering.auto.colIndex') }}</th>
            <th>{{ t('filmEngineering.auto.colStatus') }}</th>
            <th>{{ t('filmEngineering.auto.colError') }}</th>
            <th>{{ t('filmEngineering.auto.colActions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in shots" :key="s.shotId" :data-testid="'fa-shot-' + s.shotId">
            <td>{{ s.shotId }}</td>
            <td :data-testid="'fa-shot-status-' + s.shotId">{{ t('filmEngineering.auto.shotStatus.' + (s.status || 'pending')) }}</td>
            <td class="fa-shot-error">{{ s.error || '' }}</td>
            <td>
              <el-button size="small" link :data-testid="'fa-edit-' + s.shotId" @click="openEditor(s.index)">{{ t('filmEngineering.auto.editShot') }}</el-button>
              <el-button size="small" link :data-testid="'fa-regen-' + s.shotId" @click="regenerateShot(s.index)">{{ t('filmEngineering.auto.regenShot') }}</el-button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="phase === 'done'" class="fa-card fa-actions">
      <p v-if="finalUnavailable" class="fa-error" data-testid="fa-manifest-error">{{ finalUnavailable }}</p>
      <el-button type="primary" size="small" :loading="busy" data-testid="fa-compose" @click="compose">
        {{ t('filmEngineering.auto.composeBtn') }}
      </el-button>
      <span v-if="composeRunId" class="fa-hint" data-testid="fa-compose-run">{{ t('filmEngineering.auto.composeRunning', { runId: composeRunId, percent: composePercent }) }}</span>
      <el-button size="small" data-testid="fa-reset" @click="resetAll">{{ t('filmEngineering.auto.resetBtn') }}</el-button>
    </section>

    <FilmAutoSegmentEditor
      v-if="editingShotIndex !== null"
      :shot="shots.find((s) => s.index === editingShotIndex) || null"
      :shot-index="editingShotIndex"
      @close="editingShotIndex = null"
      @save="saveShotEdit"
      @regenerate="regenerateShot"
    />
  </div>
</template>

<style scoped>
.fa-panel { padding: 16px 24px 24px; display: flex; flex-direction: column; gap: 12px; overflow: auto; }
.fa-steps { margin-bottom: 4px; }
.fa-card { border: 1px solid var(--el-border-color-lighter, #ebeef5); border-radius: 8px; padding: 12px 14px; }
.fa-label { font-size: var(--font-size-sm, 13px); font-weight: 600; margin-bottom: 8px; }
.fa-hint { margin: 0; color: var(--el-text-color-secondary, #909399); font-size: var(--font-size-xs, 12px); line-height: 1.6; }
.fa-meta { display: flex; justify-content: space-between; margin-top: 6px; font-size: var(--font-size-xs, 12px); color: var(--el-text-color-secondary, #909399); }
.fa-meta .is-danger, .fa-error { color: var(--el-color-danger, #f56c6c); }
.fa-error-bar { margin: 0 0 8px; font-size: var(--font-size-sm, 13px); }
.fa-row { display: flex; gap: 16px; flex-wrap: wrap; }
.fa-field { min-width: 200px; }
.fa-choices { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
.fa-choice { display: inline-flex; align-items: center; gap: 4px; font-size: var(--font-size-sm, 13px); }
.fa-chip { appearance: none; border: 1px solid var(--el-border-color, #dcdfe6); background: transparent; border-radius: 999px; padding: 2px 10px; font-size: var(--font-size-xs, 12px); cursor: pointer; margin-right: 4px; }
.fa-chip.active { border-color: var(--el-color-primary, #5048e5); color: var(--el-color-primary, #5048e5); font-weight: 600; }
.fa-estimate { margin: 0 0 8px; font-size: var(--font-size-sm, 13px); color: var(--el-text-color-regular, #606266); }
.fa-advanced { border: 1px solid var(--el-border-color-lighter, #ebeef5); border-radius: 8px; padding: 0 12px; }
.fa-ref-list { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.fa-ref-item { display: flex; align-items: center; gap: 8px; }
.fa-ref-name { max-width: 180px; }
.fa-ref-path { color: var(--el-text-color-secondary, #909399); font-size: var(--font-size-xs, 12px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 380px; }
.fa-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px 16px; margin: 0 0 10px; }
.fa-kv div { display: flex; gap: 6px; font-size: var(--font-size-sm, 13px); }
.fa-kv dt { color: var(--el-text-color-secondary, #909399); min-width: 72px; }
.fa-kv dd { margin: 0; }
.fa-warnings ul { margin: 0; padding-left: 18px; font-size: var(--font-size-xs, 12px); line-height: 1.7; color: var(--el-color-warning, #e6a23c); }
.fa-charmap { margin: 8px 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.fa-shot-preview { list-style: none; margin: 8px 0; padding: 0; max-height: 200px; overflow: auto; font-size: var(--font-size-xs, 12px); }
.fa-shot-preview li { display: flex; gap: 10px; padding: 2px 0; }
.fa-shot-id { min-width: 72px; color: var(--el-text-color-secondary, #909399); }
.fa-shot-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fa-confirm { display: flex; gap: 8px; align-items: flex-start; font-size: var(--font-size-sm, 13px); margin: 8px 0 4px; }
.fa-shots { width: 100%; border-collapse: collapse; font-size: var(--font-size-xs, 12px); margin-top: 8px; }
.fa-shots th, .fa-shots td { border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5); padding: 4px 6px; text-align: left; }
.fa-shot-error { color: var(--el-color-danger, #f56c6c); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fa-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
