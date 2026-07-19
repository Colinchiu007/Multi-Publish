// @ts-check
/**
 * ExecutionRecorder 单元测试 — Backlot 生产回放录制服务
 *
 * 测试覆盖：
 *   - startListening / stopListening
 *   - startRecording 创建目录 + JSONL 文件
 *   - recordEvent 写入 JSONL + 内存缓存
 *   - getReplay 读取 JSONL + 总耗时计算
 *   - 自动开始录制（_handleEvent）
 *   - 缓存上限 100
 *   - cleanup 清理所有会话
 *   - boardService 快照集成
 *   - ProjectService 不存在的容错
 *   - 多项目并行录制
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger 防止 require('./logger') 报错（使用 __registerMock 兼容 CJS require）
__registerMock('../services/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const fs = require('fs');
const path = require('path');
const os = require('os');

// 测试用的临时 projects 目录
let tempDir;
let pipelineEngine;
let projectService;
let boardService;
let recorder;
let ExecutionRecorder;
let RECORDED_EVENTS;

beforeEach(() => {
  // 创建独立临时目录，避免污染真实 userData
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-recorder-test-'));
  // 清除 require 缓存，强制重新加载
  delete require.cache[require.resolve('../services/execution-recorder')];
  const mod = require('../services/execution-recorder');
  ExecutionRecorder = mod.ExecutionRecorder;
  RECORDED_EVENTS = mod.RECORDED_EVENTS;

  // Mock 工厂
  pipelineEngine = createMockPipelineEngine();
  projectService = createMockProjectService(tempDir);
  boardService = createMockBoardService();
  recorder = new ExecutionRecorder({
    projectService,
    pipelineEngine,
    boardService,
  });
});

afterEach(() => {
  const cleanupErrors = [];
  try {
    recorder.cleanup();
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(error);
  }
  delete require.cache[require.resolve('../services/execution-recorder')];
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'ExecutionRecorder 测试资源清理失败');
  }
});

// ─── Mock 工厂 ───

function createMockPipelineEngine() {
  const listeners = new Map();
  return {
    on: vi.fn((event, cb) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(cb);
      return () => {
        const arr = listeners.get(event);
        const idx = arr.indexOf(cb);
        if (idx !== -1) arr.splice(idx, 1);
      };
    }),
    off: vi.fn(),
    resume: vi.fn(() => ({ success: true })),
    _emit: vi.fn((event, data) => {
      const arr = listeners.get(event);
      if (arr) {
        for (const cb of arr) cb(data);
      }
    }),
  };
}

function createMockProjectService(tempDir) {
  const projectsDir = path.join(tempDir, 'projects');
  return {
    getProjectsDir: vi.fn(() => projectsDir),
    getProject: vi.fn(() => null),
  };
}

function createMockBoardService() {
  return {
    buildBoardState: vi.fn(() => ({ projectId: 'p1', status: 'running' })),
  };
}

// ─── 测试套件 ───

describe('ExecutionRecorder — Backlot 生产回放录制服务', () => {
  describe('构造函数', () => {
    it('初始化空会话和缓存', () => {
      expect(recorder._sessions.size).toBe(0);
      expect(recorder._cache.size).toBe(0);
      expect(recorder._listening).toBe(false);
    });

    it('允许 boardService 为空', () => {
      const r = new ExecutionRecorder({ projectService, pipelineEngine });
      expect(r.boardService).toBe(null);
    });
  });

  describe('RECORDED_EVENTS 常量', () => {
    it('包含 12 个事件类型', () => {
      expect(RECORDED_EVENTS).toHaveLength(12);
    });

    it('包含 pipeline:start', () => {
      expect(RECORDED_EVENTS).toContain('pipeline:start');
    });

    it('包含 checkpoint:pause', () => {
      expect(RECORDED_EVENTS).toContain('checkpoint:pause');
    });

    it('包含 approval:resolved', () => {
      expect(RECORDED_EVENTS).toContain('approval:resolved');
    });
  });

  describe('startListening / stopListening', () => {
    it('startListening 订阅所有 RECORDED_EVENTS', () => {
      recorder.startListening();
      expect(pipelineEngine.on).toHaveBeenCalledTimes(RECORDED_EVENTS.length);
      for (const event of RECORDED_EVENTS) {
        expect(pipelineEngine.on).toHaveBeenCalledWith(event, expect.any(Function));
      }
    });

    it('startListening 幂等（重复调用不重复订阅）', () => {
      recorder.startListening();
      recorder.startListening();
      expect(pipelineEngine.on).toHaveBeenCalledTimes(RECORDED_EVENTS.length);
    });

    it('stopListening 取消所有订阅', () => {
      recorder.startListening();
      expect(recorder._unsubscribers.length).toBe(RECORDED_EVENTS.length);
      recorder.stopListening();
      expect(recorder._unsubscribers.length).toBe(0);
      expect(recorder._listening).toBe(false);
    });

    it('stopListening 幂等', () => {
      recorder.startListening();
      recorder.stopListening();
      recorder.stopListening();
      expect(recorder._unsubscribers.length).toBe(0);
    });
  });

  describe('startRecording', () => {
    it('创建 projects/<id>/replay/ 目录', () => {
      recorder.startRecording('p1');
      const replayDir = path.join(tempDir, 'projects', 'p1', 'replay');
      expect(fs.existsSync(replayDir)).toBe(true);
    });

    it('创建 JSONL 写入流', () => {
      recorder.startRecording('p1');
      expect(recorder._sessions.has('p1')).toBe(true);
      const session = recorder._sessions.get('p1');
      expect(session.stream).toBeTruthy();
      expect(session.jsonlPath).toContain('execution.jsonl');
    });

    it('幂等（重复调用不创建新会话）', () => {
      recorder.startRecording('p1');
      const session1 = recorder._sessions.get('p1');
      recorder.startRecording('p1');
      const session2 = recorder._sessions.get('p1');
      expect(session1).toBe(session2);
    });

    it('初始化空缓存数组', () => {
      recorder.startRecording('p1');
      expect(recorder._cache.get('p1')).toEqual([]);
    });
  });

  describe('recordEvent', () => {
    beforeEach(() => {
      recorder.startRecording('p1');
    });

    it('写入事件到 JSONL 文件', (done) => {
      recorder.recordEvent('p1', 'pipeline:start', 'script', { projectId: 'p1' });
      // 等待流写入完成
      const session = recorder._sessions.get('p1');
      session.stream.on('finish', () => {
        const content = fs.readFileSync(session.jsonlPath, 'utf-8');
        expect(content).toContain('pipeline:start');
        done();
      });
      session.stream.end();
    });

    it('缓存事件到内存', () => {
      recorder.recordEvent('p1', 'pipeline:start', '', { projectId: 'p1' });
      const cache = recorder.getCachedEvents('p1');
      expect(cache).toHaveLength(1);
      expect(cache[0].type).toBe('pipeline:start');
    });

    it('事件包含 id、projectId、timestamp、type、stageName、data', () => {
      recorder.recordEvent('p1', 'stage:start', 'script', { foo: 'bar' });
      const event = recorder.getCachedEvents('p1')[0];
      expect(event.id).toMatch(/^evt_\d+$/);
      expect(event.projectId).toBe('p1');
      expect(event.timestamp).toBeTruthy();
      expect(event.type).toBe('stage:start');
      expect(event.stageName).toBe('script');
      expect(event.data).toEqual({ foo: 'bar' });
    });

    it('调用 boardService.buildBoardState 构建快照', () => {
      recorder.recordEvent('p1', 'pipeline:start', '', {});
      const event = recorder.getCachedEvents('p1')[0];
      expect(boardService.buildBoardState).toHaveBeenCalledWith('p1');
      expect(event.snapshot).toEqual({ projectId: 'p1', status: 'running' });
    });

    it('boardService 为空时 snapshot 为 null', () => {
      const r = new ExecutionRecorder({ projectService, pipelineEngine });
      r.startRecording('p1');
      r.recordEvent('p1', 'pipeline:start', '', {});
      const event = r.getCachedEvents('p1')[0];
      expect(event.snapshot).toBe(null);
      r.cleanup();
    });

    it('缓存上限为 100', () => {
      for (let i = 0; i < 105; i++) {
        recorder.recordEvent('p1', 'pipeline:start', '', { index: i });
      }
      const cache = recorder.getCachedEvents('p1');
      expect(cache).toHaveLength(100);
      // 最早的事件被移除，保留最后 100 个
      expect(cache[0].data.index).toBe(5);
      expect(cache[99].data.index).toBe(104);
    });

    it('未启动录制时记录事件不报错', () => {
      expect(() => {
        recorder.recordEvent('unknown', 'pipeline:start', '', {});
      }).not.toThrow();
    });

    it('eventIdCounter 单调递增', () => {
      recorder.recordEvent('p1', 'pipeline:start', '', {});
      recorder.recordEvent('p1', 'stage:start', 'script', {});
      const cache = recorder.getCachedEvents('p1');
      const id1 = parseInt(cache[0].id.replace('evt_', ''), 10);
      const id2 = parseInt(cache[1].id.replace('evt_', ''), 10);
      expect(id2).toBeGreaterThan(id1);
    });
  });

  describe('stopRecording', () => {
    it('结束写入流并删除会话', (done) => {
      recorder.startRecording('p1');
      const session = recorder._sessions.get('p1');
      session.stream.on('finish', () => {
        expect(recorder._sessions.has('p1')).toBe(false);
        done();
      });
      recorder.stopRecording('p1');
    });

    it('未启动的会话不报错', () => {
      expect(() => {
        recorder.stopRecording('unknown');
      }).not.toThrow();
    });
  });

  describe('_handleEvent 自动录制', () => {
    it('未启动会话时自动开始录制', () => {
      recorder._handleEvent('pipeline:start', { projectId: 'p1' });
      expect(recorder._sessions.has('p1')).toBe(true);
      expect(recorder.getCachedEvents('p1')).toHaveLength(1);
    });

    it('已有会话时不重复启动', () => {
      recorder.startRecording('p1');
      const session1 = recorder._sessions.get('p1');
      recorder._handleEvent('pipeline:start', { projectId: 'p1' });
      const session2 = recorder._sessions.get('p1');
      expect(session1).toBe(session2);
    });

    it('无 projectId 的事件被忽略', () => {
      recorder._handleEvent('pipeline:start', {});
      expect(recorder._sessions.size).toBe(0);
    });

    it('null data 被处理为空对象', () => {
      recorder._handleEvent('pipeline:start', null);
      expect(recorder._sessions.has('p1')).toBe(false);
    });

    it('data.runId 作为 projectId fallback', () => {
      recorder._handleEvent('pipeline:start', { runId: 'r1' });
      expect(recorder._sessions.has('r1')).toBe(true);
    });
  });

  describe('getReplay', () => {
    it('无录制文件时返回空数组', () => {
      const result = recorder.getReplay('p1');
      expect(result.events).toEqual([]);
      expect(result.totalDuration).toBe(0);
    });

    it('返回项目信息', () => {
      projectService.getProject.mockReturnValue({ id: 'p1', name: '测试项目' });
      const result = recorder.getReplay('p1');
      expect(result.project).toEqual({ id: 'p1', name: '测试项目' });
    });

    it('projectService.getProject 抛错时 project 为 null', () => {
      projectService.getProject.mockImplementation(() => {
        throw new Error('not found');
      });
      const result = recorder.getReplay('p1');
      expect(result.project).toBe(null);
    });

    it('读取 JSONL 文件返回事件列表', (done) => {
      recorder.startRecording('p1');
      recorder.recordEvent('p1', 'pipeline:start', '', { projectId: 'p1' });
      recorder.recordEvent('p1', 'pipeline:complete', '', { projectId: 'p1' });
      const session = recorder._sessions.get('p1');
      session.stream.on('finish', () => {
        const result = recorder.getReplay('p1');
        expect(result.events).toHaveLength(2);
        expect(result.events[0].type).toBe('pipeline:start');
        expect(result.events[1].type).toBe('pipeline:complete');
        done();
      });
      session.stream.end();
    });

    it('计算总耗时（秒）', (done) => {
      recorder.startRecording('p1');
      recorder.recordEvent('p1', 'pipeline:start', '', {});
      // 手动修改第一个事件的时间戳以模拟时间差
      const cache = recorder.getCachedEvents('p1');
      cache[0].timestamp = '2026-01-01T00:00:00.000Z';
      recorder.recordEvent('p1', 'pipeline:complete', '', {});
      const cache2 = recorder.getCachedEvents('p1');
      cache2[1].timestamp = '2026-01-01T00:01:30.000Z'; // 90 秒后
      const session = recorder._sessions.get('p1');
      session.stream.on('finish', () => {
        const result = recorder.getReplay('p1');
        expect(result.totalDuration).toBe(90);
        done();
      });
      session.stream.end();
    });

    it('单事件时 totalDuration 为 0', (done) => {
      recorder.startRecording('p1');
      recorder.recordEvent('p1', 'pipeline:start', '', {});
      const session = recorder._sessions.get('p1');
      session.stream.on('finish', () => {
        const result = recorder.getReplay('p1');
        expect(result.totalDuration).toBe(0);
        done();
      });
      session.stream.end();
    });

    it('跳过无效 JSON 行', (done) => {
      recorder.startRecording('p1');
      recorder.recordEvent('p1', 'pipeline:start', '', {});
      // 手动写入无效行
      const session = recorder._sessions.get('p1');
      session.stream.write('this is not json\n');
      session.stream.on('finish', () => {
        const result = recorder.getReplay('p1');
        expect(result.events).toHaveLength(1);
        done();
      });
      session.stream.end();
    });
  });

  describe('多项目并行录制', () => {
    it('支持同时录制多个项目', () => {
      recorder.startRecording('p1');
      recorder.startRecording('p2');
      expect(recorder._sessions.size).toBe(2);
      recorder.recordEvent('p1', 'pipeline:start', '', {});
      recorder.recordEvent('p2', 'pipeline:start', '', {});
      expect(recorder.getCachedEvents('p1')).toHaveLength(1);
      expect(recorder.getCachedEvents('p2')).toHaveLength(1);
    });
  });

  describe('cleanup', () => {
    it('清理所有会话', (done) => {
      recorder.startRecording('p1');
      recorder.startRecording('p2');
      const sessions = Array.from(recorder._sessions.values());
      let finished = 0;
      for (const session of sessions) {
        session.stream.on('finish', () => {
          finished++;
          if (finished === sessions.length) {
            expect(recorder._sessions.size).toBe(0);
            done();
          }
        });
      }
      recorder.cleanup();
    });

    it('停止监听', () => {
      recorder.startListening();
      recorder.cleanup();
      expect(recorder._listening).toBe(false);
    });

    it('无会话时 cleanup 不报错', () => {
      expect(() => recorder.cleanup()).not.toThrow();
    });
  });

  describe('PipelineEngine 事件集成', () => {
    it('startListening 后 PipelineEngine 事件自动触发录制', () => {
      recorder.startListening();
      pipelineEngine._emit('pipeline:start', { projectId: 'p1' });
      expect(recorder._sessions.has('p1')).toBe(true);
      expect(recorder.getCachedEvents('p1')).toHaveLength(1);
      expect(recorder.getCachedEvents('p1')[0].type).toBe('pipeline:start');
    });

    it('stage 事件被正确记录', () => {
      recorder.startListening();
      pipelineEngine._emit('stage:start', { projectId: 'p1', stageName: 'script' });
      pipelineEngine._emit('stage:complete', { projectId: 'p1', stageName: 'script' });
      const cache = recorder.getCachedEvents('p1');
      expect(cache).toHaveLength(2);
      expect(cache[0].type).toBe('stage:start');
      expect(cache[0].stageName).toBe('script');
      expect(cache[1].type).toBe('stage:complete');
    });

    it('checkpoint:pause 事件被记录', () => {
      recorder.startListening();
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'script',
        checkpointType: 'script',
      });
      const cache = recorder.getCachedEvents('p1');
      expect(cache).toHaveLength(1);
      expect(cache[0].type).toBe('checkpoint:pause');
    });
  });

  describe('getCachedEvents', () => {
    it('未录制的项目返回空数组', () => {
      expect(recorder.getCachedEvents('unknown')).toEqual([]);
    });
  });
});
