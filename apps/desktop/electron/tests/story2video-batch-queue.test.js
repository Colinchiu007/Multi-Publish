import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { Story2VideoBatchQueue, BATCH_MAX_CONCURRENT, BATCH_MAX_TEXTS, BATCH_MAX_FILES, BATCH_ERROR_CODES, BATCH_ITEM_STATUS } = require('../services/story2video-batch-queue')

function createEngineStub(overrides = {}) {
  const listeners = new Map()
  let runSeq = 0
  const engine = {
    maxConcurrentRuns: 4,
    _manualRunning: 0,
    startOrchestratedCalls: [],
    startOrchestrated: vi.fn(async () => {
      runSeq += 1
      return { success: true, runId: "run_mock_" + runSeq }
    }),
    _countActiveManualRuns: vi.fn(() => engine._manualRunning),
    getRunSnapshot: vi.fn(() => ({ status: { progress: 50, currentStage: "compose" } })),
    on: vi.fn((event, cb) => {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(cb)
      return async () => {
        const arr = listeners.get(event)
        if (arr) {
          const idx = arr.indexOf(cb)
          if (idx !== -1) arr.splice(idx, 1)
        }
      }
    }),
    _emit: vi.fn((event, data) => {
      for (const cb of listeners.get(event) || []) cb(data)
    }),
    __listeners: listeners,
    ...overrides,
  }
  return engine
}

const TEMPLATE = { version: 1, mode: "text", split: { language: "zh" }, video: { mode: "off" } }

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("Story2VideoBatchQueue", async () => {
  let engine
  let queue

  beforeEach(async () => {
    engine = createEngineStub()
    queue = new Story2VideoBatchQueue({ pipelineEngine: engine, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
  })

  afterEach(async () => {
    queue.dispose()
    vi.useRealTimers()
  })

  it("导出常量与类", async () => {
    expect(BATCH_MAX_CONCURRENT).toBe(2)
    expect(BATCH_MAX_TEXTS).toBe(10)
    expect(BATCH_MAX_FILES).toBe(20)
    expect(Story2VideoBatchQueue).toBeTypeOf("function")
  })

  it("创建批量：text 模式逐项入队并立即启动前两个任务（并行上限内）", async () => {
    const result = await queue.createBatch({ mode: "text", texts: ["文案A", "文案B"], story2videoTextConfigTemplate: TEMPLATE, uiLocale: "zh" })
    expect(result.success).toBe(true)
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ source: "text", label: "文案 1", status: "running" })
    expect(result.items[1]).toMatchObject({ source: "text", label: "文案 2", status: "running" })
    expect(engine.startOrchestrated).toHaveBeenCalledTimes(2)
    const [, params] = engine.startOrchestrated.mock.calls[0]
    expect(params).toMatchObject({ source: "batch", batchId: result.batchId, text: "文案A", autoAdvance: true, background: true, checkpointPolicy: "none" })
    expect(params.story2videoTextConfig.prompt).toBe("文案A")
  })

  it("并行上限：无手动任务时最多同时运行 2 个批量任务", async () => {
    const result = await queue.createBatch({ mode: "text", texts: ["1", "2", "3", "4", "5"], story2videoTextConfigTemplate: TEMPLATE })
    expect(result.success).toBe(true)
    const snapshot = () => queue.getBatches()[0]
    // 入队后立即并行启动 2 个，其余排队
    expect(snapshot().summary).toMatchObject({ running: 2, pending: 3 })
    // 完成第 1 个运行项 → 启动下一个，仍保持 2 个并行
    engine._emit("pipeline:complete", { runId: snapshot().items[0].runId })
    await flush()
    expect(snapshot().summary).toMatchObject({ running: 2, pending: 2, completed: 1 })
    // 再完成一个运行项 → 继续补位
    const runningItem = snapshot().items.find((i) => i.status === "running")
    engine._emit("pipeline:complete", { runId: runningItem.runId })
    await flush()
    expect(snapshot().summary).toMatchObject({ running: 2, pending: 1, completed: 2 })
  })

  it("手动任务互斥：手动运行中批量仅并行 1 个", async () => {
    engine._manualRunning = 1
    const result = await queue.createBatch({ mode: "text", texts: ["a", "b", "c"], story2videoTextConfigTemplate: TEMPLATE })
    const snapshot = () => queue.getBatches()[0]
    // 手动运行中 → 批量只启动 1 个
    expect(engine.startOrchestrated).toHaveBeenCalledTimes(1)
    expect(snapshot().summary).toMatchObject({ running: 1, pending: 2 })
    // 完成第一个 → 手动仍运行 → 只再启动一个
    engine._emit("pipeline:complete", { runId: snapshot().items[0].runId })
    await flush()
    expect(engine.startOrchestrated).toHaveBeenCalledTimes(2)
    expect(snapshot().summary).toMatchObject({ running: 1, pending: 1, completed: 1 })
    // 手动完成 → 批量可并行 2 → 启动剩余排队项
    engine._manualRunning = 0
    const runningItem = snapshot().items.find((i) => i.status === "running")
    engine._emit("pipeline:complete", { runId: runningItem.runId })
    await flush()
    expect(snapshot().summary).toMatchObject({ running: 1, pending: 0, completed: 2 })
  })

  it("全局预算：批量+手动达到 maxConcurrentRuns 时停止启动", async () => {
    engine.maxConcurrentRuns = 2
    engine._manualRunning = 1
    const result = await queue.createBatch({ mode: "text", texts: ["a", "b"], story2videoTextConfigTemplate: TEMPLATE })
    // 手动1 + 批量1 = 2 = 预算 → 第二个 pending 不启动
    expect(engine.startOrchestrated).toHaveBeenCalledTimes(1)
    expect(queue.getBatches()[0].summary).toMatchObject({ running: 1, pending: 1 })
  })

  it("引擎并发预算拒绝：退避重试后启动（不标记失败）", async () => {
    vi.useFakeTimers()
    const limited = createEngineStub({
      startOrchestrated: vi.fn(async () => ({ success: false, error: "当前已有 2 条流水线正在运行，最多同时运行 2 条", errorCode: "PIPELINE_CONCURRENCY_LIMIT" })),
    })
    const q = new Story2VideoBatchQueue({ pipelineEngine: limited, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    const result = await q.createBatch({ mode: "text", texts: ["a"], story2videoTextConfigTemplate: TEMPLATE })
    expect(result.items[0].status).toBe("pending")
    // 预算恢复 → 退避到期后启动成功
    limited.startOrchestrated.mockImplementation(async () => ({ success: true, runId: "run_ok" }))
    await vi.advanceTimersByTimeAsync(1100)
    const status = q.getBatches()[0]
    expect(status.items[0].status).toBe("running")
    q.dispose()
  })

  it("失败终态：pipeline:fail 将 item 标记 failed 并继续调度", async () => {
    const result = await queue.createBatch({ mode: "text", texts: ["a", "b"], story2videoTextConfigTemplate: TEMPLATE })
    const failRunId = result.items[0].runId
    engine.__listeners.get("pipeline:fail").forEach((cb) => cb({ runId: failRunId, error: "阶段执行失败" }))
    await flush()
    const status = queue.getBatches()[0]
    expect(status.items[0]).toMatchObject({ status: "failed", error: "阶段执行失败" })
    // 失败后启动下一个排队项
    expect(engine.startOrchestrated).toHaveBeenCalledTimes(2)
  })

  it("取消仅限 pending 项", async () => {
    const result = await queue.createBatch({ mode: "text", texts: ["a", "b", "c"], story2videoTextConfigTemplate: TEMPLATE })
    const items = result.items
    // 入队即启动前 2 个：仅第 3 个仍排队可取消
    const cancelled = queue.cancelBatchItems(result.batchId, [items[1].itemId, items[2].itemId])
    expect(cancelled).toEqual({ success: true, cancelled: 1 })
    const status = queue.getBatches()[0]
    expect(status.items[1].status).toBe("running")
    expect(status.items[2].status).toBe("cancelled")
    expect(status.items[0].status).toBe("running")
  })

  it("取消不存在的批次返回 BATCH_NOT_FOUND", async () => {
    const result = queue.cancelBatchItems("batch_missing", [])
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe(BATCH_ERROR_CODES.NOT_FOUND)
  })

  it("校验：空文案拒绝（BATCH_NO_ITEMS / BATCH_TEXT_EMPTY）", async () => {
    expect((await queue.createBatch({ mode: "text", texts: [], story2videoTextConfigTemplate: TEMPLATE })).errorCode).toBe(BATCH_ERROR_CODES.NO_ITEMS)
    const empty = await queue.createBatch({ mode: "text", texts: ["   "], story2videoTextConfigTemplate: TEMPLATE })
    expect(empty.success).toBe(false)
    expect(empty.errorCode).toBe(BATCH_ERROR_CODES.TEXT_EMPTY)
  })

  it("校验：文案条数上限 10", async () => {
    const many = Array.from({ length: 11 }, (_, i) => "文案" + i)
    const result = await queue.createBatch({ mode: "text", texts: many, story2videoTextConfigTemplate: TEMPLATE })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe(BATCH_ERROR_CODES.ITEMS_LIMIT)
  })

  it("校验：文件扩展名白名单 + 内容读取 + 条数上限 20", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s2v-batch-test-"))
    const txt = path.join(dir, "a.txt")
    const md = path.join(dir, "b.md")
    const bad = path.join(dir, "c.png")
    fs.writeFileSync(txt, "第一个文件文案", "utf8")
    fs.writeFileSync(md, "第二个文件文案", "utf8")
    fs.writeFileSync(bad, "not a text", "utf8")
    const result = await queue.createBatch({ mode: "files", files: [{ path: txt }, { path: md }, { path: bad }], story2videoTextConfigTemplate: TEMPLATE })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe(BATCH_ERROR_CODES.FILE_EXT_UNSUPPORTED)
    expect(result.failedItems).toHaveLength(1)
    expect(result.failedItems[0].label).toBe("c.png")
    // 仅合法文件 → 成功
    const ok = await queue.createBatch({ mode: "files", files: [{ path: txt }, { path: md }], story2videoTextConfigTemplate: TEMPLATE })
    expect(ok.success).toBe(true)
    expect(ok.items).toHaveLength(2)
    expect(ok.items.map((i) => i.label)).toEqual(["a.txt", "b.md"])
    // 循环调度：两个文件按队列顺序依次启动（并行上限 2 内）
    expect(engine.startOrchestrated.mock.calls[0][1].text).toBe("第一个文件文案")
    expect(engine.startOrchestrated.mock.calls[1][1].text).toBe("第二个文件文案")
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("校验：文件过大拒绝（FILE_TOO_LARGE）", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s2v-batch-test-"))
    const big = path.join(dir, "big.txt")
    fs.writeFileSync(big, "x".repeat(3 * 1024 * 1024), "utf8")
    const result = await queue.createBatch({ mode: "files", files: [{ path: big }], story2videoTextConfigTemplate: TEMPLATE })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe(BATCH_ERROR_CODES.FILE_TOO_LARGE)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("校验：文件不可读拒绝（FILE_UNREADABLE）", async () => {
    const result = await queue.createBatch({ mode: "files", files: [{ path: "Z:/definitely/missing/file.txt" }], story2videoTextConfigTemplate: TEMPLATE })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe(BATCH_ERROR_CODES.FILE_UNREADABLE)
  })

  it("运行中 item 透出 runId 与进度快照", async () => {
    const result = await queue.createBatch({ mode: "text", texts: ["a"], story2videoTextConfigTemplate: TEMPLATE })
    expect(result.items[0].runId).toBe("run_mock_1")
    expect(result.items[0].progress).toBe(50)
    expect(result.items[0].currentStage).toBe("compose")
  })
})