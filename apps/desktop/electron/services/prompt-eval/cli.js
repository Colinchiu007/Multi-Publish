#!/usr/bin/env node
// @ts-check
/**
 * PromptEval CLI — 提示词优化效果评估（图片 v1）
 *
 * 用法：
 *   node cli.js --image <path> --source-text "..." [--context "..."|--context-json '{}']
 *              [--optimized-prompt "..."] [--negative-prompt "..."] [--evaluator <module>]
 *              [--out <dir>] [--json]
 *   node cli.js --batch input.json --evaluator <module> [--out <dir>] [--json]
 *   node cli.js --analyze [--out <dir>]
 *
 * 退出码：0 成功；2 输入错误/评估失败。
 * 评估器契约：模块导出 async function evaluate({ prompt, images }) => string（原始文本）。
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')

function parseArgs (argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const name = key.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) { args[name] = true } else { args[name] = next; i += 1 }
  }
  return args
}

function loadEvaluator (modulePath) {
  if (!modulePath) return null
  const resolved = path.resolve(modulePath)
  const mod = require(resolved)
  const fn = typeof mod === 'function' ? mod : (mod && (mod.evaluate || mod.default))
  if (typeof fn !== 'function') throw new Error('评估器模块必须导出 async evaluate({ prompt, images })')
  return fn
}

function readBatch (file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!parsed || !Array.isArray(parsed.items) && !Array.isArray(parsed)) {
    throw new Error('batch 文件必须是 { items: [...] } 或数组')
  }
  const items = Array.isArray(parsed.items) ? parsed.items : parsed
  return { mediaType: (parsed.mediaType) || 'image', items, options: parsed.options || {} }
}

async function main () {
  const args = parseArgs(process.argv.slice(2))
  const evaluator = loadEvaluator(args.evaluator || process.env.PROMPT_EVAL_EVALUATOR)
  const outDir = args.out ? path.resolve(args.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-eval-cli-'))
  const { createPromptEvalService } = require('./index')
  const { toMarkdown, aggregate } = require('./report')
  const service = createPromptEvalService({ userDataDir: outDir, evaluator, log: { info: () => {}, warn: () => {}, error: () => {} } })

  if (args.analyze) {
    const result = service.analyze()
    console.log(JSON.stringify(result, null, 2))
    return 0
  }

  let request
  if (args.batch) {
    request = readBatch(args.batch)
  } else {
    if (!args.image || !args['source-text']) {
      console.error('用法：--image <path> --source-text "<原文>" [--context <上下文>] [--optimized-prompt <优化后提示词>] [--negative-prompt <负向>] [--evaluator <模块>] [--json]')
      return 2
    }
    const context = args['context-json'] ? JSON.parse(args['context-json']) : (args.context || undefined)
    request = {
      mediaType: 'image',
      items: [{
        imagePath: path.resolve(args.image),
        sourceText: args['source-text'],
        context,
        optimizedPrompt: args['optimized-prompt'] || '',
        negativePrompt: args['negative-prompt'] || '',
        imageIndex: 0,
      }],
      options: {},
    }
  }

  if (!evaluator) {
    console.error('缺少评估器：请用 --evaluator <模块路径> 指定（模块导出 async evaluate({ prompt, images }) => string），或设置环境变量 PROMPT_EVAL_EVALUATOR')
    return 2
  }

  const result = await service.run(request)
  if (!result.success) {
    console.error('评估失败 [' + (result.error && result.error.code) + ']: ' + (result.error && result.error.message))
    return 2
  }
  const record = result.report
  if (args.json) {
    console.log(JSON.stringify(record, null, 2))
  } else {
    console.log(toMarkdown(record))
    console.error('报告已保存: ' + path.join(outDir, 'prompt-eval', 'reports', record.id + '.md'))
  }
  return 0
}

main().then(code => { process.exit(code) }).catch(err => {
  console.error('CLI 错误: ' + (err && err.message ? err.message : String(err)))
  process.exit(2)
})

