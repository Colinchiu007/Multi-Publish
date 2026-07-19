import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const html = fs.readFileSync(path.join(currentDir, 'index.html'), 'utf8')
const windowSource = fs.readFileSync(path.join(currentDir, '../electron/window.js'), 'utf8')

function getCspDirectives() {
  const document = new JSDOM(html).window.document
  const policies = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
  expect(policies).toHaveLength(1)

  return new Map(
    policies[0].content
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...values] = directive.split(/\s+/)
        return [name, values]
      }),
  )
}

describe('index.html Content Security Policy', () => {
  it('只由页面声明策略，主进程不使用 session 级响应头覆盖', () => {
    expect(windowSource).not.toContain('onHeadersReceived')
    expect(windowSource).not.toContain("'Content-Security-Policy'")
  })

  it('允许应用所需的本机服务、字体和媒体资源', () => {
    const directives = getCspDirectives()

    expect(directives.get('connect-src')).toEqual(expect.arrayContaining([
      "'self'",
      'ws:',
      'wss:',
      'https:',
      'http://localhost:*',
      'http://127.0.0.1:*',
    ]))
    expect(directives.get('style-src')).toEqual(expect.arrayContaining([
      'https://api.fontshare.com',
      'https://fonts.googleapis.com',
    ]))
    expect(directives.get('font-src')).toEqual(expect.arrayContaining([
      'https://api.fontshare.com',
      'https://fonts.gstatic.com',
    ]))
    expect(directives.get('img-src')).toContain('blob:')
    expect(directives.get('media-src')).toContain('blob:')
  })

  it('阻止插件对象、外部基址和跨来源表单提交', () => {
    const directives = getCspDirectives()

    expect(directives.get('object-src')).toEqual(["'none'"])
    expect(directives.get('base-uri')).toEqual(["'self'"])
    expect(directives.get('form-action')).toEqual(["'self'"])
  })
})
