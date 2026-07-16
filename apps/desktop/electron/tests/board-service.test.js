// @ts-check
/**
 * BoardService 单元测试 — Backlot 实时看板服务
 *
 * 测试覆盖：
 *   - startListening/stopListening 事件订阅
 *   - subscribe/unsubscribe webContents 管理
 *   - buildBoardState 构建 BoardState 快照
 *   - PipelineEngine 事件触发看板更新推送
 *   - _handleEvent 事件处理逻辑
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger
__registerMock('../services/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const { BoardService } = require('../services/board-service');

// Mock PipelineEngine
function createMockPipelineEngine() {
  const listeners = new Map();
  return {
    _eventListeners: listeners,
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(cb);
      return () => this.off(event, cb);
    },
    off(event, cb) {
      const arr = listeners.get(event);
      if (arr) {
        const idx = arr.indexOf(cb);
        if (idx !== -1) arr.splice(idx, 1);
      }
    },
    _emit(event, data) {
      const arr = listeners.get(event);
      if (arr) for (const cb of arr) cb(data);
    },
    _getCurrentRun: () => null,
  };
}

// Mock webContents
function createMockWebContents() {
  const sent = [];
  return {
    _sent: sent,
    isDestroyed: () => false,
    send: (channel, payload) => sent.push({ channel, payload }),
    once: () => {},
  };
}

// Mock ProjectService
function createMockProjectService(project) {
  return {
    getProject: (id) => {
      if (project && project.id === id) return project;
      const err = new Error('Not found: ' + id);
      err.code = 'PROJECT_NOT_FOUND';
      throw err;
    },
  };
}

describe('BoardService — Backlot 实时看板', () => {
  let pipelineEngine;
  let projectService;
  let boardService;

  beforeEach(() => {
    pipelineEngine = createMockPipelineEngine();
    projectService = createMockProjectService({
      id: 'proj-1',
      name: '测试项目',
      status: 'running',
      stages: [],
      totalCost: 10.5,
      createdAt: new Date().toISOString(),
    });
    boardService = new BoardService({
      pipelineEngine,
      projectService,
      getMainWindow: () => null,
    });
  });

  afterEach(() => {
    boardService.stopListening();
  });

  describe('startListening / stopListening', () => {
    it('startListening 后事件被订阅', () => {
      boardService.startListening();
      expect(pipelineEngine._eventListeners.get('pipeline:start')).toBeDefined();
      expect(pipelineEngine._eventListeners.get('pipeline:start').length).toBe(1);
      expect(pipelineEngine._eventListeners.get('stage:start').length).toBe(1);
      expect(pipelineEngine._eventListeners.get('checkpoint:pause').length).toBe(1);
    });

    it('重复 startListening 不会重复订阅', () => {
      boardService.startListening();
      boardService.startListening();
      expect(pipelineEngine._eventListeners.get('pipeline:start').length).toBe(1);
    });

    it('stopListening 清除所有订阅', () => {
      boardService.startListening();
      boardService.stopListening();
      expect(pipelineEngine._eventListeners.get('pipeline:start')).toBeDefined();
      expect(pipelineEngine._eventListeners.get('pipeline:start').length).toBe(0);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('subscribe 返回 subscribed: true 和 initial 快照', () => {
      const wc = createMockWebContents();
      const result = boardService.subscribe(wc, 'proj-1');
      expect(result.subscribed).toBe(true);
      expect(result.initial).toBeTruthy();
      expect(result.initial.projectId).toBe('proj-1');
      expect(result.initial.projectName).toBe('测试项目');
    });

    it('subscribe 无 webContents 返回 subscribed: false', () => {
      const result = boardService.subscribe(null, 'proj-1');
      expect(result.subscribed).toBe(false);
    });

    it('unsubscribe 移除订阅', () => {
      const wc = createMockWebContents();
      boardService.subscribe(wc, 'proj-1');
      const result = boardService.unsubscribe(wc);
      expect(result.unsubscribed).toBe(true);
    });
  });

  describe('buildBoardState', () => {
    it('返回正确的项目信息', () => {
      const board = boardService.buildBoardState('proj-1');
      expect(board).toBeTruthy();
      expect(board.projectId).toBe('proj-1');
      expect(board.projectName).toBe('测试项目');
      expect(board.status).toBe('running');
    });

    it('无 PipelineEngine 运行时 stages 为空数组', () => {
      const board = boardService.buildBoardState('proj-1');
      expect(board.stages).toEqual([]);
    });

    it('projectId 不存在返回 null', () => {
      const board = boardService.buildBoardState('nonexistent');
      expect(board).toBeNull();
    });

    it('无 projectId 返回 null', () => {
      const board = boardService.buildBoardState(null);
      expect(board).toBeNull();
    });

    it('updatedAt 是有效 ISO 时间', () => {
      const board = boardService.buildBoardState('proj-1');
      expect(board.updatedAt).toBeTruthy();
      expect(new Date(board.updatedAt).getTime()).not.toBeNaN();
    });
  });

  describe('PipelineEngine 事件推送', () => {
    it('pipeline:start 事件触发 board:update 推送', () => {
      boardService.startListening();
      const wc = createMockWebContents();
      boardService.subscribe(wc, 'proj-1');

      // 模拟 pipeline:start 事件
      pipelineEngine._emit('pipeline:start', {
        runId: 'run-1',
        pipelineType: 'animated-explainer',
        stages: ['script', 'assets'],
      });

      // 验证 webContents 收到 board:update
      const update = wc._sent.find((s) => s.channel === 'board:update');
      expect(update).toBeTruthy();
      expect(update.payload.board).toBeTruthy();
      expect(update.payload.board.lastEvent.type).toBe('pipeline:start');
    });

    it('stage:complete 事件触发推送', () => {
      boardService.startListening();
      const wc = createMockWebContents();
      boardService.subscribe(wc, 'proj-1');

      pipelineEngine._emit('stage:complete', {
        runId: 'run-1',
        stageName: 'script',
        stageIndex: 0,
      });

      const update = wc._sent.find((s) => s.channel === 'board:update');
      expect(update).toBeTruthy();
      expect(update.payload.board.lastEvent.type).toBe('stage:complete');
    });

    it('pipeline:complete 清理 runId 映射', () => {
      boardService.startListening();
      boardService.subscribe(createMockWebContents(), 'proj-1');

      pipelineEngine._emit('pipeline:start', { runId: 'run-1', pipelineType: 'test' });
      expect(boardService._runProjectMap.has('run-1')).toBe(true);

      pipelineEngine._emit('pipeline:complete', { runId: 'run-1', pipelineType: 'test' });
      expect(boardService._runProjectMap.has('run-1')).toBe(false);
    });

    it('checkpoint:pause 事件触发推送', () => {
      boardService.startListening();
      const wc = createMockWebContents();
      boardService.subscribe(wc, 'proj-1');

      pipelineEngine._emit('pipeline:start', { runId: 'run-1', pipelineType: 'test' });
      wc._sent.length = 0; // 清空之前推送

      pipelineEngine._emit('checkpoint:pause', {
        runId: 'run-1',
        stageName: 'assets',
        checkpointType: 'human_approval',
      });

      const update = wc._sent.find((s) => s.channel === 'board:update');
      expect(update).toBeTruthy();
      expect(update.payload.board.lastEvent.type).toBe('checkpoint:pause');
    });
  });

  describe('PipelineEngine 事件系统（on/off/_emit）', () => {
    it('on 返回取消订阅函数', () => {
      const engine = createMockPipelineEngine();
      const cb = vi.fn();
      const unsub = engine.on('test:event', cb);
      expect(typeof unsub).toBe('function');
      engine._emit('test:event', { data: 1 });
      expect(cb).toHaveBeenCalledWith({ data: 1 });
      unsub();
      engine._emit('test:event', { data: 2 });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('off 移除指定回调', () => {
      const engine = createMockPipelineEngine();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      engine.on('test:event', cb1);
      engine.on('test:event', cb2);
      engine._emit('test:event', {});
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      engine.off('test:event', cb1);
      engine._emit('test:event', {});
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(2);
    });
  });
});
