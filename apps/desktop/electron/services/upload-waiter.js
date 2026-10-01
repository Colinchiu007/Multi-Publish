// @ts-check
/**
 * upload-waiter.js — 视频上传等待循环（mixin 片段，rpa-view-navigation-helpers 的下沉拆分）
 *
 * 为什么独立成文件（2026-10 publish-progress-dup-upload）：
 * 逐文件行数门禁（.github/scripts/check-max-lines.js，limit=500）下
 * rpa-view-navigation-helpers.js 登记 495 行已无膨胀余量，而 v4 等待策略要加
 * 探针串 + 自实现轮询循环。故按本仓既有 mixin 拆分范式下沉到本文件，
 * 由 rpa-view-platforms.js 用 Object.assign 合回（与 navigationHelpers 同款接线）。
 *
 * 依赖：log（logger）+ upload-wait-strategy（纯判定）+ 宿主提供的 this._sleep/_emitProgress。
 * 方法内只通过 this.* 访问宿主 mixin，不反向依赖 platforms/navigation。
 */
'use strict'

const log = require('./logger')
const {
  computeBudgetMs,
  decideUploadWait,
} = require('./upload-wait-strategy')

/**
 * 读取视频字节数（供上传等待预算自适应）。
 * 拿不到（路径缺失/已清理/无权限）返回 null —— 调用方回退到既有 900000ms 预算，
 * 不因取体积失败而改变等待语义。
 * @param {string|null|undefined} videoPath
 * @returns {number|null}
 */
function readVideoFileBytes (videoPath) {
  if (typeof videoPath !== 'string' || !videoPath) return null
  try {
    const size = require('fs').statSync(videoPath).size
    return Number.isFinite(size) && size > 0 ? size : null
  } catch (_) {
    return null
  }
}

const uploadWaiterMixin = {
  // ========== 视频上传完成判定（v4 自适应轮询） ==========
  // v1/v2/v3 留在 rpa-view-navigation-helpers.js 的历史注释里。v4 改三点：
  //   ① 自实现 3s 轮询（不再用 _waitForCondition 黑盒），每轮取结构化信号；
  //   ② 等待期把**页面自身上传百分比**映射为真实进度上报（30~49 波段，stage 串不变）；
  //   ③ 预算按文件大小自适应（computeBudgetMs：909KB→90s；不传 fileBytes 仍 900000 兜底）；
  //   ④ 停滞检测（百分比 180s 不变 + 结构性信号）提前 best-effort 放行。
  // 行为兼容：done → true；besteffort → 打既有 warn 日志并返回 false。
  async _waitForVideoUploadComplete(win, platform, timeoutMs, opts = {}) {
    // 上传信号探针（页面上下文执行的函数字面量串）。旧版只回一个布尔
    // （负向信号不命中 && 正向信号命中），而抖音上传完成后页面残留可见
    // `[class*=progress]` 元素/「转码中」文本 ⇒ uploading 恒真 ⇒ 白等满 15 分钟。
    // 改为返回四元组交由 decideUploadWait 加权决策：
    //   uploading = 上传中/正在上传/剩余时间/转码中/上传失败 + 可见进度类元素 + 百分比<100
    //   pagePercent = 页面自报百分比（(\d{1,3})\s*%，无则 null）→ 真实进度上报
    //   positive = https 视频预览 || 编辑器输入 || location.href 含 post/video
    //   structural = 任意可见 video（含 blob 预览）|| 编辑器输入 || 上传完成类文案
    const probe = 'function(){var t=(document.body&&document.body.innerText)||"";'
      + 'var pv=[...document.querySelectorAll("[class*=progress],[class*=uploading],[class*=percent],[class*=Percent]")].filter(function(e){return e.offsetParent&&e.clientHeight>0}).length;'
      + 'var m=t.match(/(\\d{1,3})\\s*%/);var pct=m?Number(m[1]):-1;'
      + 'var uploading=/上传中[….]{1,3}|正在上传|剩余时间[:\uff1a]|转码中|上传失败/.test(t)||pv>0||(pct>=0&&pct<100);'
      + 'var vv=[...document.querySelectorAll("video")].some(function(v){var s=v.currentSrc||v.src||"";return s.indexOf("https:")===0&&v.getClientRects().length>0});'
      + 'var ed=!!document.querySelector(\'input[placeholder*="标题"],textarea[placeholder],[contenteditable="true"]\');'
      + 'var vu=[...document.querySelectorAll("video")].some(function(v){return v.getClientRects().length>0});'
      + 'var doneText=/重新上传|重新选择|上传完成|上传成功/.test(t);'
      + 'return {uploading:!!uploading,pagePercent:pct>=0?pct:null,positive:!!(vv||ed||location.href.indexOf("post/video")!==-1),structural:!!(vu||ed||doneText)}}'
    const bytes = Number(opts && opts.fileBytes)
    const budgetMs = Number.isFinite(bytes) && bytes > 0 ? computeBudgetMs(bytes) : (timeoutMs || 900000)
    const startedAt = Date.now()
    let prevPagePercent = null
    let stableSince = startedAt
    let lastReported = null
    for (;;) {
      const now = Date.now()
      const signal = await this._probeUploadSignal(win, probe)
      // 评审整改 C4（2026-10）：只有**有效百分比帧**且与上一有效值不同才重置停滞计时；
      // 连续无效帧（pagePercent=null，页面 DOM 未就绪/executeJavaScript 容错路径）
      // 不得刷新 stableSince，否则停滞判定永远凑不满 180s（预算形同虚设的变体）。
      if (signal.pagePercent !== null && signal.pagePercent !== prevPagePercent) {
        prevPagePercent = signal.pagePercent
        stableSince = now
      }
      const decision = decideUploadWait({
        elapsedMs: now - startedAt,
        budgetMs,
        pagePercent: signal.pagePercent,
        prevPagePercent,
        uploading: signal.uploading,
        positiveSignal: signal.positive,
        structuralSignal: signal.structural,
        stableSinceMs: now - stableSince,
      })
      // 进度只增不减（页面百分比抖动不至于让用户看到进度条倒退）
      const reportPercent = decision.reportPercent
      if (reportPercent !== null && (lastReported === null || reportPercent > lastReported)) {
        lastReported = reportPercent
        this._emitProgress(platform, 'waiting upload...', reportPercent)
      }
      if (decision.action === 'done') return true
      if (decision.action === 'besteffort') {
        log.warn('RpaView', '[' + platform + '] video upload-complete signal not detected (preview/url), continuing best-effort')
        return false
      }
      // 稳定期（25s，防 blob 预览误判的历史纪律）由 decideUploadWait 内部守：
      // 稳定期内也轮询上报页面百分比，但不判定 done/besteffort。
      // 评审整改 C3（2026-10）：_sleep 异常不得中断等待循环（否则预算「必然返回」
      // 的保证被打破）；sleep 失败按「继续等待」处理，下一轮照常探针+决策。
      try {
        await this._sleep(3000)
      } catch (_sleepErr) { /* 容错继续：循环终止性优先于单次休眠失败 */ }
    }
  },

  /**
   * 取一帧上传信号（在页面上下文执行探针函数串）。
   * executeJavaScript 异常/非对象返回一律容错为「无信号」（不抛错、不中断等待循环）。
   * @param {object} win BrowserWindow（WebContentsView 宿主）
   * @param {string} probeFn 页面上下文函数字面量串（硬编码，禁止拼接用户输入）
   * @returns {Promise<{uploading:boolean,pagePercent:number|null,positive:boolean,structural:boolean}>}
   */
  async _probeUploadSignal(win, probeFn) {
    const empty = { uploading: false, pagePercent: null, positive: false, structural: false }
    if (typeof probeFn !== 'string' || !probeFn) return empty
    try {
      const raw = await win.webContents.executeJavaScript('(' + probeFn + ')()')
      if (!raw || typeof raw !== 'object') return empty
      // null/undefined 必须先拦：Number(null) === 0 会被误读成「页面报 0%」，
      // 进而让判定长期卡在「百分比 <100」分支（等待预算形同虚设）。
      const rawPct = raw.pagePercent === null || raw.pagePercent === undefined ? null : Number(raw.pagePercent)
      const pct = rawPct !== null && Number.isFinite(rawPct) && rawPct >= 0 && rawPct <= 100 ? rawPct : null
      return {
        uploading: Boolean(raw.uploading),
        pagePercent: pct,
        positive: Boolean(raw.positive),
        structural: Boolean(raw.structural),
      }
    } catch (_e) {
      return empty
    }
  },
}

module.exports = { uploadWaiterMixin, readVideoFileBytes }
