// 2026-10-07 真机 E2E 暴露的假成功回归保护。
//
// 现场：publishBatch([{platform:'xiaohongshu'}]) 返回 taskId，history 记
// status=success、mode=dom，但应用日志里标题/正文/标签三项全是 WARN
// （title field not found / content editor not found / tag input not found），
// 页面什么都没写进去。根因：draftOnly 分支无条件 `return {success:true}`。
//
// 本文件锁三条不变量：
//   ① 内容没写进去 ⇒ 必须 success:false（绝不报成功）
//   ② 内容写进去了 ⇒ 才允许走落库判定并返回 draft 成功
//   ③ draftSaved 的判定不再接受孤立的「草稿」二字（页面常驻文案，恒真）

import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'

const MODULE = '../services/rpa-view-platforms'

// rpa-view-platforms.js 导出的是 mixin 集合（Object.assign(platformsMixin, ...)），
// `_publish_generic` 是挂在宿主类原型上的方法。测试直接把该方法挂到一个
// 桩实例上调用：这样测的是生产函数体本身，不经过导航/开窗等无关副作用。
async function loadPublishGeneric () {
  const mod = await import(MODULE)
  const mixin = mod.default || mod
  const fn = mixin._publish_generic
  if (typeof fn !== 'function') throw new Error('未能从 ' + MODULE + ' 取得 _publish_generic')
  return fn
}

/** 构造一个最小可用实例：只桩掉 draftOnly 判定会碰到的成员 */
function makeInstance (overrides = {}) {
  const calls = { waits: [], sleeps: [] }
  const inst = {
    _emitProgress: vi.fn(),
    _sleep: async (ms) => { calls.sleeps.push(ms) },
    _resolveSelector: vi.fn(async () => null),
    _fillInput: vi.fn(async () => {}),
    _click: vi.fn(async () => true),
    _waitForElement: vi.fn(async () => true),
    _setFileInput: vi.fn(async () => {}),
    _getPlatformConfig: vi.fn(() => ({})),
    _prepBaijiahao: vi.fn(async () => {}),
    _execHook: vi.fn(async () => {}),
    _waitForResponse: vi.fn(async () => null),
    _waitForCondition: vi.fn(async () => true),
    _composeEditorCaption: vi.fn(() => ''),
    _navigateAndWait: vi.fn(async () => {}),
    _waitForNavigation: vi.fn(async () => {}),
    // 导航后弹窗关闭：生产实现在 _publish_generic 里于 draftOnly 分支之前调用，
    // 缺这个桩会让 6 例在抵达被测逻辑前就 TypeError（首轮 7/7 全红的唯一原因）。
    _dismissPostNavDialogs: vi.fn(async () => {}),
    ...overrides,
  }
  inst.__calls = calls
  inst._win = {
    webContents: {
      getURL: () => 'https://creator.xiaohongshu.com/publish/publish?target=image',
      executeJavaScript: async () => undefined,
    },
  }
  return inst
}

function article (over = {}) {
  return { title: 'E2E 草稿箱验证', content: '正文内容', tags: ['E2E'], ...over }
}

/** 直接驱动 _publish_generic 到 draftOnly 分支，避免整条导航链路 */
async function runDraftOnly (inst, art, config = {}) {
  const cfg = {
    publish_url: 'https://creator.xiaohongshu.com/publish/publish',
    draftOnly: true,
    selectors: {
      title_input: [],
      editor: [],
      content_textarea: [],
      tag_input: [],
      draft_btn: [],
      publish_btn: [],
      ...(config.selectors || {}),
    },
    ...config,
  }
  const publishGeneric = await loadPublishGeneric()
  return publishGeneric.call(inst, inst._win, art, 'xiaohongshu', cfg)
}

describe('draftOnly 假成功修复（2026-10-07）', () => {
  it('标题选择器全部失配 ⇒ 必须 success:false（不得报成功）', async () => {
    const inst = makeInstance({ _resolveSelector: vi.fn(async () => null) })
    const res = await runDraftOnly(inst, article(), {
      selectors: { title_input: ['#never-matches'], editor: ['#also-never'] },
    })
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('PUBLISH_DRAFT_CONTENT_NOT_FILLED')
    expect(String(res.error)).toMatch(/草稿内容未写入页面/)
  })

  it('正文编辑器未找到 ⇒ 必须 success:false', async () => {
    const inst = makeInstance({ _resolveSelector: vi.fn(async () => null) })
    const res = await runDraftOnly(inst, article(), {
      selectors: { title_input: ['#t'], editor: ['#e'], content_textarea: [] },
    })
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('PUBLISH_DRAFT_CONTENT_NOT_FILLED')
  })

  it('填入抛错（重试耗尽）⇒ 必须 success:false', async () => {
    const inst = makeInstance({
      _resolveSelector: vi.fn(async () => '#e'),
      _fillInput: vi.fn(async () => { throw new Error('readback empty') }),
    })
    const res = await runDraftOnly(inst, article(), {
      selectors: { title_input: ['#t'], editor: ['#e'] },
    })
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe('PUBLISH_DRAFT_CONTENT_NOT_FILLED')
    expect(String(res.error)).toMatch(/readback empty/)
  })

  it('标题正文都写成功 ⇒ 允许返回 draft 成功（不得把真成功也打成失败）', async () => {
    const inst = makeInstance({
      _resolveSelector: vi.fn(async () => '#e'),
      _fillInput: vi.fn(async () => {}),
    })
    const res = await runDraftOnly(inst, article(), {
      selectors: { title_input: ['#t'], editor: ['#e'] },
    })
    expect(res.success).toBe(true)
    expect(res.draft).toBe(true)
    expect(res.fillReport).toBeTruthy()
    expect(res.fillReport.title.ok).toBe(true)
    expect(res.fillReport.content.ok).toBe(true)
  })

  it('只有标签失配 ⇒ 降级放行（标签是增强项，不阻断）', async () => {
    // 标题与正文必须成功，只有标签选择器失配 —— 否则测的就不是「只标签失败」了
    // （首轮桩写成「标签选择器数组非空但 resolve 返回 null」，结果正文也 resolve
    //  不到，于是走的是「正文未写入」分支，断言在错误的语义上失败）。
    // 源码 rpa-view-platforms.js:382 的调用是
    //   this._resolveSelector(win, sel.tag_input, 5000, 2000)
    // 第二参是**数组** `['#tag-never']`。首轮桩写成字符串比较（sels === '#tag-never'）
    // 恒假 ⇒ 返回 '#ok' ⇒ tagsOk=1 ⇒ fillReport.tags.ok 为 true，
    // 断言在错误的语义上失败。这里按数组语义匹配。
    const inst = makeInstance({
      _resolveSelector: vi.fn(async (win, sels) =>
        (Array.isArray(sels) && sels.includes('#tag-never')) ? null : '#ok'),
      _fillInput: vi.fn(async () => {}),
    })
    const res = await runDraftOnly(inst, article(), {
      selectors: { title_input: ['#t'], editor: ['#e'], tag_input: ['#tag-never'] },
    })
    expect(res.success).toBe(true)
    expect(res.fillReport.tags.ok).toBe(false)
    expect(res.fillReport.title.ok).toBe(true)
    expect(res.fillReport.content.ok).toBe(true)
  })

  it('文章没有正文 ⇒ 不因正文缺失判失败（只判实际尝试过的字段）', async () => {
    const inst = makeInstance({
      _resolveSelector: vi.fn(async () => '#t'),
      _fillInput: vi.fn(async () => {}),
    })
    const res = await runDraftOnly(inst, article({ content: '' }), {
      selectors: { title_input: ['#t'], editor: ['#e'] },
    })
    expect(res.success).toBe(true)
  })

  it('draftSaved 判定条件不再接受孤立的「草稿」二字', async () => {
    // 从源码位置反推文件绝对路径：vitest 4 + jsdom 下 import.meta.url
    // 不是 file: scheme，new URL(..., import.meta.url) 会被 fs 拒收。
    const fs = await import('node:fs')
    const file = path.resolve(process.cwd(), 'electron/services/rpa-view-platforms.js')
    const src = fs.readFileSync(file, 'utf-8')

    // 落库判定被拆成多行 JS 字符串拼接，不能按「单行含编辑于」去找——
    // 首轮就是这么写的，结果 find 返回 undefined，断言在错误的层面失败。
    const block = src.slice(
      src.indexOf('draftSaved = await this._waitForCondition'),
      src.indexOf('draftSaved = await this._waitForCondition') + 600)

    expect(block).toBeTruthy()
    // 旧正则尾部是「|草稿/」，孤立的「草稿」二字在小红书创作者页恒真
    expect(block).not.toMatch(/草稿\//)
    expect(block).not.toMatch(/已保存\|草稿/)
    // 收紧后：要求「编辑于」后跟时间量词。
    // 注意 block 是**源码文本**，该段是 JS 字符串字面量，所以源码里写的是
    // 双反斜杠 \\s*\\S{1,12}；正则字面量要匹配这两个反斜杠需写 \\\\s。
    // 首轮写成 /编辑于\\s\*\\S/ 只匹配「一个反斜杠」，差一层转义。
    expect(block).toContain('编辑于\\\\s*\\\\S{1,12}')
    expect(block).toMatch(/已保存/)
    // 额外锁住「不接受孤立的草稿」这一意图：整个判定块里不得再出现「草稿」二字。
    // （旧实现是 /编辑于|已保存|草稿/ —— 裸「草稿」在小红书创作者页是侧边栏
    //   「草稿箱」常驻文案，恒真 ⇒ saved 恒为 true，等于没有判据。）
    expect(block.includes('草稿')).toBe(false)
  })
})