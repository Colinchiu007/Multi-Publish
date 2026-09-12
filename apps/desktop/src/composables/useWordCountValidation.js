import { computed } from 'vue'

/**
 * 字数区间校验（文案改写页 / 采集页共用）
 *
 * 契约：min 0-5999 整数、max 1-6000 整数、max >= min；默认 800-2000。
 * 错误文案经 resolveError(key) 解析（调用方传入 locale/notify 适配器，
 * 兼容 vue-i18n 的 t() 与 notifyCore 的 resolveNotifyText().text 两种来源）。
 *
 * @param {import('vue').Ref<number|''>} minRef - 最小字数（v-model.number，清空时为 ''）
 * @param {import('vue').Ref<number|''>} maxRef - 最大字数
 * @param {(key: string) => string} resolveError - 错误文案解析器
 * @returns {{ error: import('vue').ComputedRef<string> }}
 */
export function useWordCountValidation(minRef, maxRef, resolveError) {
  const error = computed(() => {
    const min = minRef.value
    const max = maxRef.value
    // v-model.number + type=number 清空时值为 ''（Number('')===0 会绕过，必须显式拦截）
    if (min === '' || min === null || min === undefined || !Number.isInteger(Number(min)) || Number(min) < 0 || Number(min) > 5999) {
      return resolveError('wordCountMinInvalid')
    }
    if (max === '' || max === null || max === undefined || !Number.isInteger(Number(max)) || Number(max) < 1 || Number(max) > 6000) {
      return resolveError('wordCountMaxInvalid')
    }
    if (Number(max) < Number(min)) {
      return resolveError('wordCountMaxLtMin')
    }
    return ''
  })
  return { error }
}
