/**
 * useS2VVoicePreview —— S2V 旁白试听（浏览器内置 SpeechSynthesis）。
 *
 * 从 CreateView.vue 抽出的原因有两个：
 * 1. 它是纯浏览器 API 调用，只读 voiceSpeed / voiceVolume 两个配置字段，
 *   与组件其余部分几乎没有耦合 —— 抽出后 CreateView 净减约 18 行，
 *   让「债务熔断」（MAX_FILE_LINES 基线 5657）重新达标。
 *   在 5600 行的巨型文件上，任何修复性改动都会撞这条门禁；
 *   把低耦合代码真正移出去，才是让门禁与修复并存的正解。
 * 2. 与 useAsrInstall（批次 A，M-16）同一形态：副作用持有在独立模块里，
 *   组件只调一个入口，卸载时统一清理。
 *
 * 文案来源：本模块**不含任何用户可见文案** —— 提示语与试听文本由调用方
 * 传入（视图层从 locale 取，zh/en 成对，CI Gate 7 强制）。
 * 首版把两句中文写死在这里，被 Gate 7 的「渲染端新增硬编码中文」判据拦下：
 * 视图层同名文案是存量基线豁免，换文件就成了"新增"，判据拦得对。
 *
 * 防御分支的取舍：speechSynthesis 不存在 / 用户开了「减少动态效果」时，
 * 提示并静默返回 —— 试听是锦上添花的功能，任何失败都不该打断主流程。
 *
 * @param {() => { unsupportedText: string, previewText: string }} getTexts
 *   返回本次要用的文案（调用时才取，保证跟随当前语言切换）。
 */
export function useS2VVoicePreview(getTexts) {
  function previewS2VVoice(s2vConfig, showS2VOptionsToast) {
    try {
      if (!window.speechSynthesis) {
        showS2VOptionsToast(getTexts().unsupportedText)
        return
      }
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(getTexts().previewText)
      const speed = Number(s2vConfig.voiceSpeed) || 1
      const volume = Math.min(1, Math.max(0, Number(s2vConfig.voiceVolume) || 1))
      utterance.rate = speed
      utterance.volume = volume
      utterance.lang = 'zh-CN'
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      window.speechSynthesis.speak(utterance)
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useS2VVoicePreview] SpeechSynthesis failed:', e)
      }
    }
  }
  return { previewS2VVoice }
}
