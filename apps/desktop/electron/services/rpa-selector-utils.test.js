// @ts-check
/**
 * buildResolveElementCode 文本匹配次序回归测试
 *
 * 背景（2026-09 快手 live DOM 取证）：快手发布页存在「在粉丝浏览高峰期发布」「发布成功次数」
 * 等含"发布"字样的提示文案，旧实现按「包含文本」优先返回，会命中这些文案而不是真正的
 * 发布按钮，点击后没有任何请求（responses=0）。文本匹配必须「精确文本 + 可交互标签」优先。
 */
const { buildResolveElementCode } = require('./rpa-selector-utils')

function resolveWith (sel, html) {
  document.body.innerHTML = html
  const code = buildResolveElementCode(sel)
  const fn = new Function('document', 'return ' + code)
  return fn(document)
}

describe('rpa-selector-utils — :has-text 文本匹配优先级', () => {
  const page = [
    '<div class="tip">在粉丝浏览高峰期发布</div>',
    '<span class="stat">发布成功次数</span>',
    '<button class="real">发布</button>',
  ].join('')

  it('button:has-text("发布") 命中精确文本的按钮，而不是含"发布"的文案', () => {
    const el = resolveWith('button:has-text("发布")', page)
    expect(el).toBeTruthy()
    expect(el.tagName.toLowerCase()).toBe('button')
    expect((el.textContent || '').trim()).toBe('发布')
  })

  it('精确叶子元素优先于包含文本的元素', () => {
    const el = resolveWith('span:has-text("发布")', page)
    expect(el).toBeTruthy()
    expect((el.textContent || '').trim()).toBe('发布成功次数')
  })

  it('无精确匹配时回退到包含文本的可交互元素（旧行为保留）', () => {
    const el = resolveWith('button:has-text("投稿")', '<button>立即投稿并发布</button>')
    expect(el).toBeTruthy()
    expect(el.tagName.toLowerCase()).toBe('button')
  })

  it('原生 CSS 选择器仍走 querySelector 快路径', () => {
    const el = resolveWith('#work-description-edit', '<div id="work-description-edit" contenteditable="true"></div>')
    expect(el).toBeTruthy()
    expect(el.id).toBe('work-description-edit')
  })

  it('text= 语法解析为精确文本匹配', () => {
    const el = resolveWith('text=确定', '<div class="a">取消</div><button class="b">确定</button>')
    expect(el).toBeTruthy()
    expect(el.tagName.toLowerCase()).toBe('button')
  })

  it('无可匹配元素时返回 null（调用方据此继续尝试下一个候选）', () => {
    expect(resolveWith('button:has-text("不存在")', page)).toBeNull()
  })

  // 选择器自带的 tag/class 必须参与过滤，否则 button:has-text("发布") 会退化成
  // “页面上任何一个含发布的元素”（取证时命中 span 统计文案）
  it('tag 约束生效：div:has-text("发布") 只从 div 中选', () => {
    const el = resolveWith('div:has-text("发布")', page)
    expect(el.tagName.toLowerCase()).toBe('div')
    expect((el.textContent || '').trim()).toBe('在粉丝浏览高峰期发布')
  })

  it('class 约束生效：button.real:has-text("发布") 命中带该 class 的按钮', () => {
    const el = resolveWith('button.real:has-text("发布")', page)
    expect(el.tagName.toLowerCase()).toBe('button')
    expect(el.className).toBe('real')
  })

  it('选择器前缀不是真实 CSS 语法（text=）时回退到全量候选池', () => {
    const el = resolveWith('text=发布', page)
    expect(el.tagName.toLowerCase()).toBe('button')
  })
})

describe('rpa-selector-utils — 快手 2026-09-28 活体发布页真提交钮（D2 正向证据）', () => {
  // 活体捕获（上传完成后的编辑页）：真提交钮是裸 <span>立即发布</span>（无 class/id/data）；
  // 同页还有顶导航 <span data-v-...>发布作品</span> 与 <span>定时发布</span>。
  // 旧候选 span:has-text("发布") 三重歧义 → 解析器点错对象 → responses=0。
  const livePage = [
    '<span data-v-08ce92df="">发布作品</span>',
    '<span>立即发布</span>',
    '<span>定时发布</span>',
  ].join('')

  it('span:has-text("立即发布") 精确命中真提交钮（唯一、零歧义）', () => {
    const el = resolveWith('span:has-text("立即发布")', livePage)
    expect(el).toBeTruthy()
    expect((el.textContent || '').trim()).toBe('立即发布')
  })

  it('旧候选 span:has-text("发布") 三重歧义：命中其一但不保证是真钮（失败根因演示）', () => {
    const el = resolveWith('span:has-text("发布")', livePage)
    expect(el).toBeTruthy()
    expect(['发布作品', '立即发布', '定时发布']).toContain((el.textContent || '').trim())
  })

  it('登录页无「立即发布」文案，新候选不误命中', () => {
    const loginPage = '<span>扫码登录</span><span>密码登录</span><button>登录</button>'
    expect(resolveWith('span:has-text("立即发布")', loginPage)).toBeNull()
  })

  it('未就绪（空表单）页面无提交钮，新候选返回 null 由调用方走候选链', () => {
    const emptyForm = '<div class="upload-zone">拖拽视频到这里</div>'
    expect(resolveWith('span:has-text("立即发布")', emptyForm)).toBeNull()
  })
})
