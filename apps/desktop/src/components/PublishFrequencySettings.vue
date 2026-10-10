<template>
  <div class="pubfreq" data-testid="publish-frequency-settings">
    <h3 class="pubfreq__title">{{ t('settings.publishFrequency.title') }}</h3>
    <p class="pubfreq__hint">{{ t('settings.publishFrequency.subtitle') }}</p>

    <el-alert
      v-if="loadError"
      type="error"
      :closable="false"
      show-icon
      :title="loadError"
      data-testid="pubfreq-load-error"
    />

    <template v-else>
      <!-- 当前生效口径（只读） -->
      <section class="pubfreq__section" data-testid="pubfreq-current">
        <div class="pubfreq__row">
          <span class="pubfreq__label">{{ t('settings.publishFrequency.currentTier') }}</span>
          <span class="pubfreq__value">{{ currentTierText }}</span>
        </div>
        <div class="pubfreq__row">
          <span class="pubfreq__label">{{ t('settings.publishFrequency.effectiveRange') }}</span>
          <span class="pubfreq__value">{{ effectiveRangeText }}</span>
        </div>
      </section>

      <!-- 覆盖项（保存后即时生效） -->
      <section class="pubfreq__section">
        <div class="pubfreq__field">
          <label class="pubfreq__label">{{ t('settings.publishFrequency.accountInterval') }}</label>
          <el-input-number v-model="form.accountMinutes" :min="0" :max="10080" :step="1" data-testid="pubfreq-account-min" />
        </div>
        <div class="pubfreq__field">
          <label class="pubfreq__label">{{ t('settings.publishFrequency.platformInterval') }}</label>
          <el-input-number v-model="form.platformMinutes" :min="0" :max="10080" :step="1" data-testid="pubfreq-platform-min" />
          <span class="pubfreq__field-hint">{{ t('settings.publishFrequency.platformIntervalHint') }}</span>
        </div>
        <div class="pubfreq__field">
          <label class="pubfreq__label">{{ t('settings.publishFrequency.dailyMaxLong') }}</label>
          <el-input-number v-model="form.dailyLong" :min="0" :max="999" :step="1" data-testid="pubfreq-daily-long" />
        </div>
        <div class="pubfreq__field">
          <label class="pubfreq__label">{{ t('settings.publishFrequency.dailyMaxClip') }}</label>
          <el-input-number v-model="form.dailyClip" :min="0" :max="999" :step="1" data-testid="pubfreq-daily-clip" />
        </div>
        <div class="pubfreq__field">
          <label class="pubfreq__label">{{ t('settings.publishFrequency.dailyMaxShort') }}</label>
          <el-input-number v-model="form.dailyShort" :min="0" :max="999" :step="1" data-testid="pubfreq-daily-short" />
        </div>
        <div class="pubfreq__field">
          <label class="pubfreq__label">{{ t('settings.publishFrequency.jitterOn') }}</label>
          <el-switch v-model="form.jitterOn" data-testid="pubfreq-jitter" />
          <span class="pubfreq__field-hint">{{ t('settings.publishFrequency.jitterHint') }}</span>
        </div>
        <el-alert
          type="info"
          :closable="false"
          :title="t('settings.publishFrequency.dailyMaxPendingConfirm')"
          data-testid="pubfreq-pending-confirm"
        />
        <div class="pubfreq__actions">
          <el-button type="primary" :loading="saving" data-testid="pubfreq-save" @click="onSave">
            {{ t('settings.publishFrequency.save') }}
          </el-button>
          <el-button :disabled="saving" data-testid="pubfreq-reset" @click="onReset">
            {{ t('settings.publishFrequency.reset') }}
          </el-button>
        </div>
      </section>

      <!-- 紧急放行（P2-2）：二次确认 + 每日上限 + 冷却 + 追加式审计 + 三态回显 -->
      <section class="pubfreq__section pubfreq__section--danger">
        <h4 class="pubfreq__subtitle">{{ t('settings.publishFrequency.emergencyTitle') }}</h4>
        <p class="pubfreq__hint">{{ t('settings.publishFrequency.emergencyHint') }}</p>
        <div class="pubfreq__row">
          <span class="pubfreq__label">{{ t('settings.publishFrequency.emergencyQuota') }}</span>
          <span class="pubfreq__value" data-testid="pubfreq-emergency-quota">{{ emergencyQuotaText }}</span>
        </div>
        <div class="pubfreq__field">
          <label class="pubfreq__label">{{ t('settings.publishFrequency.emergencyPlatform') }}</label>
          <el-select v-model="emergency.platform" :placeholder="t('settings.publishFrequency.emergencyPlatform')" data-testid="pubfreq-emergency-platform">
            <el-option v-for="p in platformKeys" :key="p" :label="p" :value="p" />
          </el-select>
        </div>
        <div class="pubfreq__field">
          <label class="pubfreq__label">{{ t('settings.publishFrequency.emergencyAccount') }}</label>
          <el-input v-model="emergency.accountId" :placeholder="t('settings.publishFrequency.emergencyAccountPlaceholder')" data-testid="pubfreq-emergency-account" />
        </div>
        <div class="pubfreq__field">
          <label class="pubfreq__label">{{ t('settings.publishFrequency.emergencyReason') }}</label>
          <el-input v-model="emergency.reason" maxlength="200" show-word-limit data-testid="pubfreq-emergency-reason" />
        </div>
        <el-button
          type="warning"
          :loading="releasing"
          :disabled="!emergency.platform"
          data-testid="pubfreq-emergency-submit"
          @click="onEmergencyRelease"
        >
          {{ t('settings.publishFrequency.emergencySubmit') }}
        </el-button>
        <p v-if="emergencyResult" class="pubfreq__result" :class="emergencyResultClass" data-testid="pubfreq-emergency-result">
          {{ emergencyResult }}
        </p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
// 项目约定：Vue 组件一律经 @/api/publisher 访问 IPC，禁止直接调 window.electronAPI
import {
  getPublishFrequencyPolicy,
  setPublishFrequencyPolicy,
  emergencyReleasePublishWait,
} from '@/api/publisher'

const { t } = useI18n()

const loading = ref(false)
const saving = ref(false)
const releasing = ref(false)
const loadError = ref('')
const raw = ref(null)

const form = reactive({
  accountMinutes: 0,
  platformMinutes: 0,
  dailyLong: 0,
  dailyClip: 0,
  dailyShort: 0,
  jitterOn: true,
})

const emergency = reactive({ platform: '', accountId: '', reason: '' })
const emergencyResult = ref('')
const emergencyResultClass = ref('')

const platformKeys = computed(() => Object.keys((raw.value && raw.value.platforms) || {}).sort())

/** 当前档位文案：按平台档位分组给出代表性取值（不逐平台罗列，避免 15 行噪音） */
const currentTierText = computed(() => {
  const platforms = (raw.value && raw.value.platforms) || {}
  const keys = Object.keys(platforms)
  if (keys.length === 0) return '—'
  const byTier = new Map()
  for (const k of keys) {
    const v = platforms[k] || {}
    const sig = `${v.accountMinMs}/${v.platformMinMs}/${v.accountDailyMax}`
    if (!byTier.has(sig)) byTier.set(sig, { tier: v.tier, sample: k, v, count: 0 })
    byTier.get(sig).count += 1
  }
  return [...byTier.values()]
    .map((g) => `${g.tier}（${g.count} 个平台，如 ${g.sample}）：${fmtMin(g.v.accountMinMs)} / ${fmtMin(g.v.platformMinMs)} / ${g.v.accountDailyMax}`)
    .join('；')
})

/** 实际等待区间 = [账号档, 账号档 × (1 + 抖动比例)) */
const effectiveRangeText = computed(() => {
  const platforms = (raw.value && raw.value.platforms) || {}
  const ratios = Number(raw.value && raw.value.jitterRatio) || 0
  const keys = Object.keys(platforms)
  if (keys.length === 0) return '—'
  const mins = keys.map((k) => Number(platforms[k].accountMinMs) || 0)
  const lo = Math.min(...mins)
  const hi = Math.max(...mins)
  return `${fmtMin(lo)}–${fmtMin(Math.round(hi * (1 + ratios)))}`
})

const emergencyQuotaText = computed(() => {
  const st = raw.value && raw.value.emergencyStatus
  if (!st) return '—'
  return t('settings.publishFrequency.emergencyQuotaValue', { max: st.max })
})

function fmtMin (ms) {
  const n = Math.round((Number(ms) || 0) / 60000)
  return `${n} min`
}

async function load () {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getPublishFrequencyPolicy()
    if (!res || res.code !== 0) {
      loadError.value = (res && res.message) || t('settings.publishFrequency.loadFailed')
      return
    }
    raw.value = res.data
    applyOverridesToForm(res.data)
  } catch (e) {
    loadError.value = (e && e.message) || t('settings.publishFrequency.loadFailed')
  } finally {
    loading.value = false
  }
}

function applyOverridesToForm (data) {
  const ov = data && data.overrides && typeof data.overrides === 'object' ? data.overrides : {}
  const anyPlatform = Object.values((data && data.platforms) || {})[0] || {}
  const toMin = (ms, dflt) => (Number.isFinite(Number(ms)) ? Math.round(Number(ms) / 60000) : dflt)
  form.accountMinutes = toMin(ov.accountMinMs, toMin(anyPlatform.accountMinMs, 0))
  form.platformMinutes = toMin(ov.platformMinMs, toMin(anyPlatform.platformMinMs, 0))
  form.dailyLong = Number.isFinite(Number(ov.dailyMax && ov.dailyMax.long))
    ? Number(ov.dailyMax.long)
    : Number(anyPlatform.accountDailyMax) || 0
  form.dailyClip = Number.isFinite(Number(ov.dailyMax && ov.dailyMax.clip))
    ? Number(ov.dailyMax.clip)
    : Number(anyPlatform.accountDailyMax) || 0
  form.dailyShort = Number.isFinite(Number(ov.dailyMax && ov.dailyMax.short))
    ? Number(ov.dailyMax.short)
    : Number(anyPlatform.accountDailyMax) || 0
  form.jitterOn = ov.jitterRatio === undefined ? true : ov.jitterRatio > 0
}

/** 组装覆盖对象：与主进程 resolvePolicyOverrides 的字段名逐一对应（不得自创字段名） */
function buildPolicy () {
  const policy = {
    accountMinMs: Math.round(form.accountMinutes * 60000),
    platformMinMs: Math.round(form.platformMinutes * 60000),
    dailyMax: {
      long: Math.round(form.dailyLong),
      clip: Math.round(form.dailyClip),
      short: Math.round(form.dailyShort),
    },
    jitterRatio: form.jitterOn ? 0.4 : 0,
  }
  return policy
}

async function onSave () {
  saving.value = true
  try {
    const res = await setPublishFrequencyPolicy(buildPolicy())
    if (!res || res.code !== 0) {
      // 主进程是「全有或全无」判据的唯一真源：非法时它整体拒绝且不写库，此处如实回显
      ElMessage.error((res && res.message) || t('settings.publishFrequency.saveInvalid'))
      return
    }
    ElMessage.success(t('settings.publishFrequency.saveOk'))
    await load()
  } catch (e) {
    ElMessage.error((e && e.message) || t('settings.publishFrequency.saveInvalid'))
  } finally {
    saving.value = false
  }
}

async function onReset () {
  saving.value = true
  try {
    const res = await setPublishFrequencyPolicy(null)
    if (!res || res.code !== 0) {
      ElMessage.error((res && res.message) || t('settings.publishFrequency.saveInvalid'))
      return
    }
    ElMessage.success(t('settings.publishFrequency.resetOk'))
    await load()
  } catch (e) {
    ElMessage.error((e && e.message) || t('settings.publishFrequency.saveInvalid'))
  } finally {
    saving.value = false
  }
}

async function onEmergencyRelease () {
  try {
    await ElMessageBox.confirm(
      t('settings.publishFrequency.emergencyConfirm'),
      t('settings.publishFrequency.emergencyTitle'),
      { type: 'warning' },
    )
  } catch (_) {
    return // 用户取消：不执行、不提示（取消不是失败）
  }

  releasing.value = true
  emergencyResult.value = ''
  try {
    const res = await emergencyReleasePublishWait({
      platform: emergency.platform,
      accountId: emergency.accountId || null,
      reason: emergency.reason || undefined,
    })
    if (!res || res.code !== 0) {
      emergencyResultClass.value = 'is-error'
      emergencyResult.value = (res && res.message) || t('settings.publishFrequency.loadFailed')
      return
    }
    const d = res.data || {}
    if (d.released) {
      emergencyResultClass.value = 'is-ok'
      emergencyResult.value = t('settings.publishFrequency.emergencyOk')
      emergency.reason = ''
    } else {
      emergencyResultClass.value = 'is-warn'
      // 四态各自明确回显，不静默也不含糊
      const map = {
        exhausted: 'emergencyExhausted',
        cooldown: 'emergencyCooldown',
        no_waiting_window: 'emergencyNoWait',
        disabled: 'emergencyDisabled',
        no_guard: 'emergencyNoWait',
      }
      const key = map[d.reason] || 'emergencyNoWait'
      emergencyResult.value = t(
        `settings.publishFrequency.${key}`,
        { max: d.max, minutes: Math.max(1, Math.ceil((d.retryAfterMs || 0) / 60000)) },
      )
    }
    await load()
  } catch (e) {
    emergencyResultClass.value = 'is-error'
    emergencyResult.value = (e && e.message) || t('settings.publishFrequency.loadFailed')
  } finally {
    releasing.value = false
  }
}

onMounted(load)

// load / buildPolicy 是稳定的对外契约（供父组件刷新与复用）；
// emergency / form 仅为测试与诊断读取内部状态，**不属于**对外契约，勿在别处依赖。
defineExpose({ load, buildPolicy, emergency, form })
</script>

<style scoped>
.pubfreq { display: flex; flex-direction: column; gap: 16px; }
.pubfreq__title { margin: 0; font-size: 16px; font-weight: 600; }
.pubfreq__subtitle { margin: 0; font-size: 14px; font-weight: 600; }
.pubfreq__hint { margin: 0; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; }
.pubfreq__section { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.pubfreq__section--danger { border-color: var(--el-color-warning-light-5); }
.pubfreq__row { display: flex; gap: 10px; align-items: baseline; }
.pubfreq__label { min-width: 220px; font-size: 13px; color: var(--el-text-color-regular); }
.pubfreq__value { font-size: 13px; color: var(--el-text-color-primary); }
.pubfreq__field { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.pubfreq__field-hint { font-size: 12px; color: var(--el-text-color-secondary); }
.pubfreq__actions { display: flex; gap: 10px; }
.pubfreq__result { margin: 0; font-size: 13px; }
.pubfreq__result.is-ok { color: var(--el-color-success); }
.pubfreq__result.is-warn { color: var(--el-color-warning); }
.pubfreq__result.is-error { color: var(--el-color-danger); }
</style>
