// @ts-check
/**
 * story2video-compose-engine 字幕转义单元测试
 *
 * 测试 ffmpeg drawtext 滤镜中字幕文本的转义逻辑。
 * 重点：转义顺序（\ 必须最先）+ 字符覆盖（: , ' % { } \）
 */
const { escapeSubtitleText } = require('./story2video-compose-engine')

describe('escapeSubtitleText — ffmpeg drawtext 字幕转义', () => {
  // 1. 正常路径：纯中文无需转义
  it('1. 纯中文文本保持原样', () => {
    expect(escapeSubtitleText('你好世界')).toBe('你好世界')
  })

  // 2. 冒号转义
  it('2. 冒号转义为 \\:', () => {
    expect(escapeSubtitleText('时间: 30秒')).toBe('时间\\: 30秒')
  })

  // 3. 单引号转义
  it('3. 单引号转义为 \\’', () => {
    expect(escapeSubtitleText("It's OK")).toBe("It\\'s OK")
  })

  // 4. 逗号转义
  it('4. 逗号转义为 \\,', () => {
    expect(escapeSubtitleText('Hello, World')).toBe('Hello\\, World')
  })

  // 5. 反斜杠转义（必须最先转义，否则后续转义符被二次转义）
  // 输入 'C:\\path'（JS 字符串值 C:\path）含 \ 和 :，两者都需转义
  // 步骤1 \→\\：C:\\path；步骤2 :→\:：C\:\\path
  // JS 字面量 'C\\:\\\\path' 表示字符串值 C\:\\path
  it('5. 反斜杠转义为 \\\\', () => {
    expect(escapeSubtitleText('C:\\path')).toBe('C\\:\\\\path')
  })

  // 6. 百分号转义（避免 %{...} 函数扩展）
  it('6. 百分号转义为 \\%', () => {
    expect(escapeSubtitleText('50% off')).toBe('50\\% off')
  })

  // 7. 花括号转义（避免 ${...} 变量扩展；$ 本身不需转义）
  it('7. 花括号转义为 \\{ \\}', () => {
    expect(escapeSubtitleText('${var}')).toBe('$\\{var\\}')
  })

  // 8. 组合特殊字符
  it('8. 组合特殊字符全部转义', () => {
    const input = "100% {k}: v, 't'"
    const expected = "100\\% \\{k\\}\\: v\\, \\'t\\'"
    expect(escapeSubtitleText(input)).toBe(expected)
  })

  // 9. 空字符串
  it('9. 空字符串返回空', () => {
    expect(escapeSubtitleText('')).toBe('')
  })

  // 10. 转义顺序验证：含 \\ 的文本先转义 \\，否则后续 : 转义会变成 \\\\
  it('10. 转义顺序：反斜杠在冒号之前转义', () => {
    // 输入 "a\b:c"
    // 错误顺序（先 : 后 \）：a\b\:c → a\\b\\:c（多了一个 \）
    // 正确顺序（先 \ 后 :）：a\\b:c → a\\b\:c
    expect(escapeSubtitleText('a\\b:c')).toBe('a\\\\b\\:c')
  })

  // 11. null/undefined 边界
  it('11. null/undefined 返回空字符串', () => {
    expect(escapeSubtitleText(null)).toBe('')
    expect(escapeSubtitleText(undefined)).toBe('')
  })

  // 12. 换行符保留（ffmpeg drawtext 支持换行）
  it('12. 换行符保留不转义', () => {
    expect(escapeSubtitleText('第一行\n第二行')).toBe('第一行\n第二行')
  })
})
