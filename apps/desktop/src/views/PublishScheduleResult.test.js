/**
 * 发布结果面板的「排期」第三态（2026-10-07 真机 E2E，PR #3087 同族）。
 *
 * 平台侧定时下，`usePublishFlow` 在 `schedulerCreate` 返回 code=0 时就把
 * `result.success` 置 true —— 但那一刻平台**还没被联系**，受理发生在之后的
 * 队列异步提交里（真机实测平台可能返回 code=7050 拒收）。
 *
 * 于是视图若只按 `result.success` 渲染，就会给排期结果打上绿色的「发布成功」标签：
 * 平台拒收时用户看到的仍是成功，而失败只落在发布记录里、当场无感知 —— 假成功。
 *
 * 本文件锁住视图的三条不变式：
 *   ① 排期分支存在且渲染「排期已创建」而非「发布成功」；
 *   ② scheduled 分支排在 success 分支**之前**（否则立即发布会被误判成排期）；
 *   ③ 给出「去哪看平台真实结果」的出口与说明。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(path.resolve(process.cwd(), 'src/views/Publish.vue'), 'utf8')

describe('发布结果面板 —— 排期不得渲染成「发布成功」', () => {
  it('排期结果渲染独立的第三态标签与说明', () => {
    expect(SRC).toContain('publishPage.scheduleCreatedTag')
    expect(SRC).toContain('publishPage.scheduleCreatedHint')
    expect(SRC).toContain('schedule-created-hint')
  })

  it('scheduled 分支排在 success 分支之前', () => {
    const sIdx = SRC.indexOf('result.scheduled" class=')
    const okIdx = SRC.indexOf('result.success" class=')
    expect(sIdx).toBeGreaterThan(-1)
    expect(okIdx).toBeGreaterThan(-1)
    expect(sIdx).toBeLessThan(okIdx)
  })

  it('排期结果不再挂「重试发布」按钮（还没发布，谈不上重试），改为去发布记录看真实结果', () => {
    expect(SRC).toContain('publishPage.scheduleViewHistory')
    expect(SRC).toContain("router.push('/publish/history')")
  })

  it('zh/en 词条成对存在（渲染文案不得缺失导致露出 key）', async () => {
    // locales 结构拆分后改为模块导入断言（FRONTEND-FILE-SPLIT-PLAN-2026-10 v3 §3.2-6）
    // 三键位于 publishPage.publishFlow 子对象（2026-10-07 排期第三态同族）
    for (const lang of ['zh', 'en']) {
      const mod = (await import(`../locales/${lang}.js`)).default
      expect(mod.publishPage.publishFlow, `${lang} 缺 scheduleCreatedTag`).toHaveProperty('scheduleCreatedTag')
      expect(mod.publishPage.publishFlow, `${lang} 缺 scheduleCreatedHint`).toHaveProperty('scheduleCreatedHint')
      expect(mod.publishPage.publishFlow, `${lang} 缺 scheduleViewHistory`).toHaveProperty('scheduleViewHistory')
    }
  })
})