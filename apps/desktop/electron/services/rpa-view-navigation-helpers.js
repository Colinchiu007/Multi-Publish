// @ts-check
/**
 * rpa-view-navigation-helpers.js — RPA 发布流程的导航/等待类 helper（mixin 片段）
 *
 * 拆分自 rpa-view-platforms.js (2026-09-29)：原文件超逐文件行数门禁
 * （check-max-lines LEDGER_GREW）。这些方法都是通过 `this.*` 调用的自包含 helper，
 * 抽出后用 Object.assign 合回 platformsMixin，行为不变。
 *
 * 依赖：log（logger）+ 宿主 mixin 提供的 this._waitForElement/_sleep/_waitForCondition。
 */
'use strict'

const log = require('./logger')

const navigationHelpers = {
  // ========== 导航后弹窗清理 ==========
  // 平台上传落地页会叠加草稿恢复弹窗（快手：继续编辑/放弃）与功能引导遮罩
  // （抖音/B站：我知道了/知道了），不先关掉会遮挡上传区与表单，导致字段选择器
  // 全部 timeout（2026-09 E2E 实锤：快手草稿弹窗遮挡发布流程）。
  // 草稿冲突优先点「放弃」（丢弃陈旧草稿，本次上传走全新流程）；只有「继续编辑」时点它。
  async _dismissPostNavDialogs(win, platform) {
    try {
      const dismissed = await win.webContents.executeJavaScript(
        '(function(){var clicked=[];' +
        'var visible=function(e){return e&&e.offsetParent&&(e.innerText||"").trim().length<=12};' +
        'var find=function(txt){return [...document.querySelectorAll("button,a,span,div,[role=button]")].filter(function(e){return visible(e)&&(e.innerText||"").trim()===txt})};' +
        'var giveup=find("放弃");if(giveup.length){giveup[giveup.length-1].click();clicked.push("放弃")}' +
        'else{var cont=find("继续编辑");if(cont.length){cont[cont.length-1].click();clicked.push("继续编辑")}}' +
        'var acks=find("我知道了").concat(find("知道了"));for(var i=0;i<acks.length;i++){acks[i].click();clicked.push((acks[i].innerText||"").trim())}' +
        'return clicked.join(",")})()'
      )
      if (dismissed) log.info('RpaView', '[' + platform + '] post-nav dialogs dismissed: ' + String(dismissed))
    } catch (e) { log.warn('RpaView', '[' + platform + '] post-nav dialogs: ' + e.message) }
  },

  // ========== 选择器候选回退 ==========
  // 旧实现只用 candidates[0]：平台改版或落地页差异会让首个候选不存在，整条链路
  // 直接 timeout（2026-09 live DOM 实锤：快手编辑页根本没有 input[placeholder*="标题"]，
  // 标题与作品描述同为 div#work-description-edit[contenteditable]）。必须逐候选尝试。
  // 首个候选给完整预算（等 SPA 渲染），其余候选快速判定存在与否。
  async _resolveSelector(win, selectors, firstTimeoutMs, restTimeoutMs) {
    const list = (Array.isArray(selectors) ? selectors : [selectors]).filter((s) => typeof s === 'string' && s.length > 0)
    for (let i = 0; i < list.length; i++) {
      const cand = list[i]
      // eslint-disable-next-line no-await-in-loop
      if (await this._waitForElement(win, cand, i === 0 ? (firstTimeoutMs || 8000) : (restTimeoutMs || 2500))) return cand
    }
    return null
  },

  // 无独立标题字段的平台（快手作品描述）：标题与正文合并成一段文案写进编辑器，
  // 长度按平台 max_content 截断（快手 1000），避免后续正文填充把标题覆写掉。
  // 2026-10-08 CCG 评审（W1/W2）统一口径：合并分隔符从 '\n\n' 收敛为 '\n'、
  // 截断从 UTF-16 slice 改为按码点（不切断代理对），与注册表
  // composeNoTitleDescription 及引擎各链（shipinhao/twitter/weibo/tiktok）一致。
  _composeEditorCaption(article, maxLen) {
    const limit = Number(maxLen) > 0 ? Number(maxLen) : 2000
    const parts = [article && article.title, article && article.content]
      .filter((v) => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim())
    const composed = parts.join('\n')
    const chars = Array.from(composed)
    return chars.length > limit ? chars.slice(0, limit).join('') : composed
  },

  // ========== 图片上传后的「图片编辑」模态层收起 ==========
  // 2026-09-29 实测（小红书图文）：图片上传成功后平台自动进入图片编辑（裁剪）界面——
  // 模态层文本「图片编辑 裁剪 模版 贴纸 文字 滤镜 比例 … 裁剪设置 滚动鼠标滚轮或触控板
  // 可缩放图片 完成」。该原生层遮挡「发布」按钮，不收起则发布按钮选择器必然超时
  // （实测 button:has-text("发布") 3s timeout → publish verification failed）。
  // 优先点「完成」（保留默认比例），回退「取消/关闭/×」。
  async _dismissImageEditModal(win, platform) {
    try {
      const result = await win.webContents.executeJavaScript(
        '(function(){var t=(document.body&&document.body.innerText)||"";'
        + 'if(!/裁剪设置|可缩放图片|图片编辑/.test(t))return "NO_EDIT_MODAL";'
        + 'var pick=function(txt){return [...document.querySelectorAll("button,div,span")].filter(function(e){return (e.innerText||"").trim()===txt&&e.offsetParent})};'
        + 'var done=pick("完成");if(done.length){done[done.length-1].click();return "DISMISSED"}'
        + 'var cancel=pick("取消").concat(pick("关闭"),pick("×"));if(cancel.length){cancel[cancel.length-1].click();return "CANCELLED"}'
        + 'return "MODAL_NO_CLOSE"})()'
      )
      if (result && result !== 'NO_EDIT_MODAL') log.info('RpaView', '[' + platform + '] image-edit modal: ' + result)
      if (result === 'DISMISSED' || result === 'CANCELLED') await this._sleep(1500)
      return result
    } catch (e) {
      log.warn('RpaView', '[' + platform + '] image-edit modal: ' + e.message)
      return null
    }
  },

  // ========== 视频上传完成强判定 ==========
  // 旧判定 !progress||success 在快手/B站等平台立即为真（页面不用 progress class），
  // 导致还在上传落地页就继续填字段/点发布，全部失败（2026-09 smoke4 实锤）。
  // v2 收紧：blob 本地预览注入瞬间就存在，不能算完成（smoke5 实锤）。
  // v3（2026-09 smoke6 实锤）：快手 25s 即误判完成，因为页内存在 https 广告 video。
  // 因此加入平台通用的“正在上传”负向信号：上传中…/剩余时间：/转码中/可见进度条
  // 任一命中就继续等；预算也拉到 15 分钟（实测 B站 96MB 上传超 10 分钟）。
  async _waitForVideoUploadComplete(win, platform, timeoutMs) {
    await this._sleep(25000) // 最低稳定期：80MB 视频不可能 25s 内传完，防 blob 预览/首拍误判
    const cond = 'function(){var t=(document.body&&document.body.innerText)||"";'
      + 'var pv=[...document.querySelectorAll("[class*=progress],[class*=uploading],[class*=percent],[class*=Percent]")].filter(function(e){return e.offsetParent&&e.clientHeight>0}).length;'
      + 'var m=t.match(/(\\d{1,3})\\s*%/);var pct=m?Number(m[1]):-1;'
      + 'var uploading=/上传中[….]{1,3}|正在上传|剩余时间[:\uff1a]|转码中|上传失败/.test(t)||pv>0||(pct>=0&&pct<100);'
      + 'if(uploading)return false;'
      + 'var vv=[...document.querySelectorAll("video")].some(function(v){var s=v.currentSrc||v.src||"";return s.indexOf("https:")===0&&v.getClientRects().length>0});'
      + 'var ed=!!document.querySelector(\'input[placeholder*="标题"],textarea[placeholder],[contenteditable="true"]\');'
      + 'return vv||ed||location.href.indexOf("post/video")!==-1}'
    const ok = await this._waitForCondition(win, cond, timeoutMs || 900000, 3000)
    if (!ok) log.warn('RpaView', '[' + platform + '] video upload-complete signal not detected (preview/url), continuing best-effort')
    return ok
  },
}

module.exports = { navigationHelpers }
