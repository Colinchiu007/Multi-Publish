/**
 * BatchArticleFields.test.js — 批量条目字段面（P2-7）
 *
 * 三条主线：
 * ① **条目作用域**：提示/面板按本条目 platformIds 计算，不受页面全局 selectedPlatforms 影响；
 * ② **写点存在**：封面/URL/可见性/差异化都必须能发出可被父层落进条目的事件
 *    （修复前 cover_* 在批量只有读点、没有写点，恒为空）；
 * ③ **空态如实**：未选平台时不渲染面板（不得渲染一张空面板让用户以为设置已生效）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import BatchArticleFields from './BatchArticleFields.vue'

const notifyWarning = vi.fn()
vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ notifyWarning }) }))

// 封面预览走 IPC 读本地文件，组件测试只关心「预览挂在条目 cover_path 上」这条接线
vi.mock('@/composables/useCoverPreview', () => ({
  useCoverPreview: () => ({
    dataUrl: { value: '' },
    error: { value: '' },
    loading: { value: false },
    reload: () => {},
  }),
}))

const normalizeUploadFile = vi.fn()
vi.mock('@/features/publish/publish-upload-file', () => ({
  normalizeUploadFile: file => normalizeUploadFile(file),
}))

describe('BatchArticleFields（批量条目字段面）', () => {
  // 每例重置上传/通知替身。mockResolvedValueOnce 是一次性队列，会跨用例泄漏：
  // 一条测试没消费完的队列值会喂给下一条，于是「第二个红」看不出归因，
  // 反证时也无法按失败原因对账。
  beforeEach(() => {
    normalizeUploadFile.mockReset()
    normalizeUploadFile.mockResolvedValue(null)
    notifyWarning.mockReset()
  })

  const catalog = [
    { id: 'douyin', label: '抖音' },
    { id: 'weibo', label: '微博' },
    { id: 'baijiahao', label: '百家号' },
  ]

  const articleOf = (overrides = {}) => reactive({
    _key: 'a_1',
    title: '标题',
    content: '正文',
    platforms: [],
    accounts: {},
    cover_path: '',
    cover_url: '',
    cover_file: null,
    platformOverrides: {},
    visibilitySemantic: '',
    ...overrides,
  })

  // el-upload 替身必须复刻它的 limit/exceed 合同，否则「重选封面」这类缺陷对
  // 组件测试层结构性不可见（旧替身每次点击恒触发 on-change，等于没有 limit，
  // main 上那条 Critical 正是由此逃过全部单测）。实测口径：
  // upload-content 的 uploadFiles() 在 fileList.length + 新文件数 > limit 时
  // 只调 on-exceed（其默认值就是 no-op）并 return，on-start/on-change 一律不触发。
  const uploadStub = {
    name: 'ElUploadStub',
    props: {
      onChange: { type: Function, default: () => {} },
      onExceed: { type: Function, default: () => {} },
      limit: { type: Number, default: undefined },
    },
    data () {
      return { files: [] }
    },
    methods: {
      // 镜像 use-handlers.handleStart：先入内部列表，再触发 on-change
      handleStart (file) {
        this.files.push(file)
        this.onChange(file, this.files)
      },
      // 镜像 upload 实例 expose 的 clearFiles
      clearFiles () {
        this.files = []
      },
      pick (name) {
        const file = { name, raw: { name } }
        if (this.limit && this.files.length + 1 > this.limit) {
          this.onExceed([file], this.files)
          return
        }
        this.handleStart(file)
      },
    },
    template: '<button data-testid="stub-upload" @click="pick(\'cover.png\')"><slot /></button>',
  }

  const mountWith = (article, extraProps = {}) => mount(BatchArticleFields, {
    props: { article, index: 0, platformCatalog: catalog, ...extraProps },
    global: {
      stubs: {
        'el-upload': uploadStub,
        CoverThumbnail: { name: 'CoverThumbnailStub', template: '<div data-testid="stub-cover-thumb" />' },
        PlatformOverridePanel: {
          name: 'OverridePanelStub',
          props: ['platforms', 'modelValue'],
          emits: ['update:modelValue'],
          template: '<div data-testid="stub-override-panel">{{ platforms.map(p => p.id).join(",") }}<button @click="$emit(\'update:modelValue\', { douyin: { title: \'覆盖标题\', content: \'\' } })" /></div>',
        },
        PublishVisibilitySelect: {
          name: 'VisibilityStub',
          props: ['modelValue', 'platforms', 'hint'],
          emits: ['update:modelValue'],
          template: '<div data-testid="stub-visibility">{{ platforms.join(",") }}<button @click="$emit(\'update:modelValue\', \'private\')" /></div>',
        },
      },
    },
  })

  it('无标题平台提示按本条目平台计算（命中才提示）', () => {
    const hit = mountWith(articleOf({ platforms: ['weibo'] }))
    expect(hit.find('[data-testid="batch-no-title-hint-0"]').exists()).toBe(true)
    expect(hit.get('[data-testid="batch-no-title-hint-0"]').text()).toContain('微博')

    const miss = mountWith(articleOf({ platforms: ['baijiahao'] }))
    expect(miss.find('[data-testid="batch-no-title-hint-0"]').exists()).toBe(false)
  })

  it('两条目互不污染：A 命中无标题平台不影响 B', () => {
    const a = mountWith(articleOf({ platforms: ['weibo'] }))
    const b = mountWith(articleOf({ platforms: ['baijiahao'] }))
    expect(a.find('[data-testid="batch-no-title-hint-0"]').exists()).toBe(true)
    expect(b.find('[data-testid="batch-no-title-hint-0"]').exists()).toBe(false)
  })

  it('封面支持度徽标来自注册表共用实现（含分子/分母）', () => {
    const wrapper = mountWith(articleOf())
    const badge = wrapper.get('[data-testid="batch-field-support-cover-0"]')
    expect(badge.text()).toMatch(/\d/)
    expect(badge.text()).toContain('/')
  })

  it('未选平台时不渲染差异化面板与可见性控件，只给如实提示', () => {
    const wrapper = mountWith(articleOf({ platforms: [] }))
    expect(wrapper.find('[data-testid="stub-override-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="stub-visibility"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="batch-no-platform-hint-0"]').exists()).toBe(true)
  })

  it('选了平台才出现可见性控件（且只带支持该语义的平台）', () => {
    const wrapper = mountWith(articleOf({ platforms: ['douyin', 'baijiahao'] }))
    expect(wrapper.find('[data-testid="stub-visibility"]').exists()).toBe(true)
    // 百家号未声明 visibility 字段，不得出现在控件的平台清单里
    expect(wrapper.get('[data-testid="stub-visibility"]').text()).not.toContain('baijiahao')
  })

  it('可见性档位变更只冒泡事件，不自行改写条目', async () => {
    const article = articleOf({ platforms: ['douyin'] })
    const wrapper = mountWith(article)
    await wrapper.get('[data-testid="stub-visibility"]').get('button').trigger('click')
    expect(wrapper.emitted('update:visibility')).toEqual([['private']])
    expect(article.visibilitySemantic).toBe('')
  })

  it('差异化面板展开后携带本条目平台规格，变更只冒泡事件', async () => {
    const article = articleOf({ platforms: ['douyin', 'weibo'] })
    const wrapper = mountWith(article)
    expect(wrapper.find('[data-testid="stub-override-panel"]').exists()).toBe(false)
    await wrapper.get('[data-testid="batch-diff-toggle-0"]').trigger('click')
    const panel = wrapper.get('[data-testid="stub-override-panel"]')
    expect(panel.text()).toContain('douyin')
    expect(panel.text()).not.toContain('baijiahao')
    await panel.get('button').trigger('click')
    expect(wrapper.emitted('update:overrides')[0][0]).toEqual({ douyin: { title: '覆盖标题', content: '' } })
    expect(article.platformOverrides).toEqual({})
  })

  it('封面选择经共用上传解析后冒泡描述符（写点存在——修复前批量无任何写点）', async () => {
    const descriptor = { path: 'D:/cover.png', name: 'cover.png' }
    normalizeUploadFile.mockResolvedValueOnce(descriptor)
    const article = articleOf()
    const wrapper = mountWith(article)
    await wrapper.get('[data-testid="stub-upload"]').trigger('click')
    await flushPromises()
    expect(normalizeUploadFile).toHaveBeenCalled()
    expect(wrapper.emitted('update:cover')).toEqual([[descriptor]])
  })

  it('重选封面必须替换旧图，不得被 el-upload 的 limit 静默丢弃（main 上的 Critical 回归锁）', async () => {
    const first = { path: 'D:/a.png', name: 'a.png' }
    const second = { path: 'D:/b.png', name: 'b.png' }
    normalizeUploadFile.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const wrapper = mountWith(articleOf())
    await wrapper.get('[data-testid="stub-upload"]').trigger('click')
    await flushPromises()
    // 第二次选图走 el-upload 的超限分支：条目里 :limit="1"，内部列表已有 1 项
    wrapper.findComponent({ name: 'ElUploadStub' }).vm.pick('b.png')
    await flushPromises()
    expect(wrapper.emitted('update:cover'), '第二次选封面被丢弃＝用户看到「选了没反应」').toEqual([[first], [second]])
  })

  it('负控：只声明 :limit 而不处理 on-exceed 时，替身必须真的丢弃第二个文件', async () => {
    // 这条不为业务，只为证明上面那条回归锁有料：若替身退化成「恒触发 on-change」，
    // 「重选被丢弃」就再次不可见，本条会先红。
    const changes = []
    const Host = {
      components: { 'el-upload': uploadStub },
      template: '<el-upload :limit="1" :on-change="record" />',
      setup () {
        return { record: (file) => changes.push(file.name) }
      },
    }
    const wrapper = mount(Host)
    const upload = wrapper.findComponent({ name: 'ElUploadStub' })
    upload.vm.pick('a.png')
    upload.vm.pick('b.png')
    expect(changes).toEqual(['a.png'])
  })


  it('解析不出路径时出声报错，且不冒泡假描述符', async () => {
    normalizeUploadFile.mockResolvedValueOnce(null)
    notifyWarning.mockClear()
    const wrapper = mountWith(articleOf())
    await wrapper.get('[data-testid="stub-upload"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:cover')).toBeUndefined()
    expect(notifyWarning).toHaveBeenCalledWith(
      'story2video.media_path_unresolved',
      expect.objectContaining({ params: expect.objectContaining({ kindLabel: expect.any(String) }) }),
    )
  })

  it('封面 URL 输入与清除各自冒泡独立事件', async () => {
    const wrapper = mountWith(articleOf({ cover_path: 'D:/a.png' }))
    // UiInput 的 testid 落在其根 div 上，输入语义经组件事件校验（setValue 只认 input）
    const urlField = wrapper.getComponent('[data-testid="batch-cover-url-0"]')
    await urlField.vm.$emit('update:model-value', 'https://example.com/a.png')
    expect(wrapper.emitted('update:cover-url')).toEqual([['https://example.com/a.png']])
    await wrapper.get('[data-testid="batch-clear-cover-0"]').trigger('click')
    expect(wrapper.emitted('clear-cover')).toBeTruthy()
  })

  it('无封面时不显示清除入口（零无效动作）', () => {
    expect(mountWith(articleOf()).find('[data-testid="batch-clear-cover-0"]').exists()).toBe(false)
  })

  it('testid 按条目下标区分（同页多条目可各自定位）', () => {
    const wrapper = mount(BatchArticleFields, {
      props: { article: articleOf(), index: 3, platformCatalog: catalog },
      global: { stubs: { 'el-upload': uploadStub, CoverThumbnail: true, PlatformOverridePanel: true, PublishVisibilitySelect: true } },
    })
    expect(wrapper.find('[data-testid="batch-fields-3"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="batch-fields-0"]').exists()).toBe(false)
  })

  it('只有远程 URL 封面时如实提示「不预览远程图片」（不得读起来像封面没设上）', () => {
    const w = mountWith(articleOf({ cover_url: 'https://cdn.example/only.jpg' }))
    const hint = w.find('[data-testid="batch-cover-url-only-0"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('不预览远程图片')
  })

  it('已选本地封面时不得再出「仅远程地址」提示（提示必须与 payload 的本地优先同口径）', () => {
    const w = mountWith(articleOf({
      cover_url: 'https://cdn.example/stale.jpg',
      cover_path: 'D:/covers/a.png',
      cover_file: { path: 'D:/covers/a.png', name: 'a.png' },
    }))
    expect(w.find('[data-testid="batch-cover-url-only-0"]').exists()).toBe(false)
    // 「本地优先」的另一面是**用户输入的远程地址会被清掉**。这一态必须单独出声：
    // 只把「仅远程」提示藏起来，等于静默丢弃用户刚填的内容却不告知。
    const dropped = w.find('[data-testid="batch-cover-url-dropped-0"]')
    expect(dropped.exists()).toBe(true)
    expect(dropped.text()).toContain('不会提交')
    // 清除封面按钮对两种来源都要在（否则远程 URL 态无法回到「无封面」）
    expect(w.find('[data-testid="batch-clear-cover-0"]').exists()).toBe(true)
  })

  it('只有远程 URL 时不得出「不会提交」提示（两条提示必须互斥且各自如实）', () => {
    const w = mountWith(articleOf({ cover_url: 'https://cdn.example/only.jpg' }))
    expect(w.find('[data-testid="batch-cover-url-dropped-0"]').exists()).toBe(false)
  })
})

async function flushPromises () {
  await new Promise(resolve => setTimeout(resolve, 0))
}
