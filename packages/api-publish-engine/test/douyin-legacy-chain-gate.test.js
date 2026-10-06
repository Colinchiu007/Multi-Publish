// §4.2 旧 douyin `aweme/post` 远程签名链下线 —— grep 门禁
// 口径（决策账锁定）：发布运行路径 src/adapters + src/publish 的 `aweme/post|_signature`
// 零命中（注释行豁免，只拦截真实调用/字符串字面量）。signer 浏览器参数遗留模块不在本门禁范围。
const fs = require('fs')
const path = require('path')

function walk (dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (/\.js$/.test(name)) out.push(p)
  }
  return out
}

const COMMENT = /^\s*(\/\/|\*|\/\*)/

describe('§4.2 旧 douyin aweme/post 远程签名链下线（grep 门禁）', () => {
  const srcRoot = path.join(__dirname, '..', 'src')

  it('扫描目录存在（防止路径漂移导致门禁空跑）', () => {
    expect(fs.existsSync(path.join(srcRoot, 'adapters'))).toBe(true)
    expect(fs.existsSync(path.join(srcRoot, 'publish'))).toBe(true)
  })

  it('src/adapters + src/publish 运行时代码零命中 aweme/post 与 _signature', () => {
    const files = [].concat(
      walk(path.join(srcRoot, 'adapters')),
      walk(path.join(srcRoot, 'publish'))
    )
    expect(files.length).toBeGreaterThan(0)
    const hits = []
    files.forEach((f) => {
      fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (COMMENT.test(line)) return
        if (/aweme\/post/.test(line)) hits.push(path.relative(srcRoot, f) + ':' + (i + 1) + ' → aweme/post')
        // 静态指纹占位（如 capabilities/douyin-capabilities.js 的 `_signature: '_'`）是
        // user-info 请求模板里的浏览器指纹字段，与已下线的「远程签名机制」不是一回事——
        // 旧链是把远程签名结果**计算**出来再发送，静态字面量恰恰证明这条链没被调用。
        // 故只豁免真正的字符串字面量（单/双引号）。**反引号不在豁免范围**：`` `${...}` ``
        // 是模板求值，值在运行时计算，与静态占位性质相反，必须照常拦截。
        if (/_signature/.test(line) && !/^\s*_signature\s*:\s*['"][^'"]*['"]\s*,?\s*$/.test(line)) {
          hits.push(path.relative(srcRoot, f) + ':' + (i + 1) + ' → _signature')
        }
      })
    })
    expect(hits).toEqual([])
  })

  it('新链 douyin-video.js 走 create_v2 端点常量（正向锚点：确已迁移到本地签名发布链）', () => {
    const txt = fs.readFileSync(path.join(srcRoot, 'publish', 'platforms', 'douyin-video.js'), 'utf8')
    expect(txt).toMatch(/CREATE_V2_PATH/)
    expect(txt).toMatch(/bd-ticket-guard/i)
    // 端点常量真值来自 douyin-ticket-guard（本地签名链），非旧远程 aweme/post
    const guard = fs.readFileSync(path.join(srcRoot, 'signer', 'douyin-ticket-guard.js'), 'utf8')
    expect(guard).toMatch(/create_v2/)
  })
})
