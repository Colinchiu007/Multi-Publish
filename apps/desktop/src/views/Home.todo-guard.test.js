import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// T0-4 主页整改守卫测试（源码级断言，参照 ProfileMenu.test.js 先例）：
// 1) 主页 emoji 图标清零；2) 空态统一 EmptyState；3) 全 0 CTA 指向 /publish；
// 4) i18n zh/en 成对新增 home.todo.* / home.empty.*。

const viewDir = join(dirname(fileURLToPath(import.meta.url)))
const homeSrc = readFileSync(join(viewDir, 'Home.vue'), 'utf8')

describe('Home.vue T0-4 主页整改（源码级守卫）', () => {
  it('快捷入口/操作按钮不再使用 emoji 图标', () => {
    const banned = ['✏️', '👤', '📋', '🚀', '🔐', '📊', '📈', '💬']
    for (const glyph of banned) {
      expect(homeSrc.includes(glyph), `主页仍残留 emoji 图标: ${glyph}`).toBe(false)
    }
    expect(homeSrc).toContain('@element-plus/icons-vue')
  })

  it('空态统一 EmptyState，且裸文本空态类已移除', () => {
    expect(homeSrc).toContain("from '@/components/EmptyState.vue'")
    expect(homeSrc.includes('.mp-home-empty {')).toBe(false)
  })

  it('全 0 数据引导 CTA 指向新建发布', () => {
    expect(homeSrc).toContain('home-zero-cta')
    expect(homeSrc).toContain("@action=\"go('/publish')\"")
  })

  it('待办摘要只渲染真实数据项（home-todo）且为 0 项时显示鼓励语', () => {
    expect(homeSrc).toContain('home-todo')
    expect(homeSrc).toContain('todoItems.length > 0')
    expect(homeSrc).toContain('home.todo.allClear')
    expect(homeSrc).toContain('statsLoaded.value = true')
  })

  it('home.todo.* 与 home.empty.* 在 zh/en 成对存在', async () => {
    // locales 结构拆分后改为模块导入断言（FRONTEND-FILE-SPLIT-PLAN-2026-10 v3 §3.2-6）
    const zh = (await import('../locales/zh.js')).default
    const en = (await import('../locales/en.js')).default
    for (const key of ['expired', 'failed', 'allClear']) {
      expect(zh.home.todo, `zh home.todo 缺 ${key}`).toHaveProperty(key)
      expect(en.home.todo, `en home.todo 缺 ${key}`).toHaveProperty(key)
    }
    expect(zh.home.empty.title).toBe('还没有发布数据')
    expect(en.home.empty.title).toBe('No publish data yet')
  })
})
