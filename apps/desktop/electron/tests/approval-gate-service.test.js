// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalGateService } from '../services/approval-gate-service';

// Mock logger
vi.mock('../services/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

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
      if (arr) for (const cb of arr) { try { cb(data); } catch (_) {} }
    }),
  };
}

function createMockBoardService() {
  return {
    _subscribers: new Set(),
    buildBoardState: vi.fn(() => ({ projectId: 'p1', status: 'paused' })),
    _pushToSubscribers: vi.fn(),
  };
}

describe('ApprovalGateService', () => {
  let service;
  let pipelineEngine;
  let boardService;
  let getMainWindow;

  beforeEach(() => {
    pipelineEngine = createMockPipelineEngine();
    boardService = createMockBoardService();
    getMainWindow = vi.fn(() => null);
    service = new ApprovalGateService({ pipelineEngine, boardService, getMainWindow });
    service.startListening();
  });

  describe('getCurrentGate', () => {
    it('returns null when no gates', () => {
      expect(service.getCurrentGate('p1')).toBe(null);
    });

    it('returns null for null projectId', () => {
      expect(service.getCurrentGate(null)).toBe(null);
    });

    it('returns first gate after checkpoint:pause', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'script',
        checkpointType: 'script',
      });
      const gate = service.getCurrentGate('p1');
      expect(gate).toBeTruthy();
      expect(gate.type).toBe('script');
      expect(gate.status).toBe('pending');
    });
  });

  describe('approveGate', () => {
    it('returns resolved:false for unknown gate', () => {
      const result = service.approveGate('unknown', 'approve');
      expect(result.resolved).toBe(false);
    });

    it('approves gate with decision=approve', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'assets',
        checkpointType: 'scene_assets',
      });
      const gate = service.getCurrentGate('p1');
      const result = service.approveGate(gate.id, 'approve');
      expect(result.resolved).toBe(true);
      expect(result.gate.status).toBe('approved');
      expect(result.gate.resolvedAt).toBeTruthy();
    });

    it('calls pipelineEngine.resume on approve', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'assets',
      });
      const gate = service.getCurrentGate('p1');
      service.approveGate(gate.id, 'approve');
      expect(pipelineEngine.resume).toHaveBeenCalled();
    });

    it('emits approval:resolved event', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'assets',
      });
      const gate = service.getCurrentGate('p1');
      service.approveGate(gate.id, 'approve');
      expect(pipelineEngine._emit).toHaveBeenCalledWith('approval:resolved', expect.objectContaining({
        projectId: 'p1',
        decision: 'approve',
      }));
    });

    it('approves with modification when decision=modify', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'script',
        checkpointType: 'script',
      });
      const gate = service.getCurrentGate('p1');
      const result = service.approveGate(gate.id, 'modify', 'change opening');
      expect(result.resolved).toBe(true);
      expect(result.gate.status).toBe('modified');
      expect(result.gate.modification).toBe('change opening');
    });

    it('rejects modify without modification text', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'script',
        checkpointType: 'script',
      });
      const gate = service.getCurrentGate('p1');
      const result = service.approveGate(gate.id, 'modify');
      expect(result.resolved).toBe(false);
    });

    it('rejects unknown decision', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'assets',
      });
      const gate = service.getCurrentGate('p1');
      const result = service.approveGate(gate.id, 'unknown');
      expect(result.resolved).toBe(false);
    });

    it('notifies BoardService on resolve', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'assets',
      });
      const gate = service.getCurrentGate('p1');
      service.approveGate(gate.id, 'approve');
      expect(boardService.buildBoardState).toHaveBeenCalledWith('p1');
      expect(boardService._pushToSubscribers).toHaveBeenCalled();
    });
  });

  describe('_onCheckpointPause', () => {
    it('creates gate with inferred type from stageName', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'script_generation',
      });
      const gate = service.getCurrentGate('p1');
      expect(gate.type).toBe('script');
    });

    it('creates gate with inferred storyboard type', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'storyboard_review',
      });
      const gate = service.getCurrentGate('p1');
      expect(gate.type).toBe('storyboard');
    });

    it('uses checkpointType when provided', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 'unknown',
        checkpointType: 'scene_assets',
      });
      const gate = service.getCurrentGate('p1');
      expect(gate.type).toBe('scene_assets');
    });

    it('sets requiredDecision based on type', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 's',
        checkpointType: 'script',
      });
      const gate = service.getCurrentGate('p1');
      expect(gate.requiredDecision).toBe('approve_or_modify');
    });

    it('extracts content from eventData.content', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 's',
        content: '脚本内容...',
      });
      const gate = service.getCurrentGate('p1');
      expect(gate.content).toBe('脚本内容...');
    });

    it('extracts content from eventData.context.script', () => {
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 's',
        context: { script: '从 context 提取的脚本' },
      });
      const gate = service.getCurrentGate('p1');
      expect(gate.content).toBe('从 context 提取的脚本');
    });

    it('pushes gate via main window', () => {
      const wc = { isDestroyed: () => false, send: vi.fn() };
      getMainWindow.mockReturnValue({ webContents: wc });
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 's',
        checkpointType: 'script',
      });
      expect(wc.send).toHaveBeenCalledWith('approval:request', expect.objectContaining({
        type: 'approval_gate',
      }));
    });

    it('pushes gate via BoardService subscribers', () => {
      const wc = { isDestroyed: () => false, send: vi.fn() };
      boardService._subscribers.add(wc);
      getMainWindow.mockReturnValue(null);
      pipelineEngine._emit('checkpoint:pause', {
        projectId: 'p1',
        stageName: 's',
      });
      expect(wc.send).toHaveBeenCalledWith('approval:request', expect.objectContaining({
        type: 'approval_gate',
      }));
    });

    it('ignores event without projectId and runId', () => {
      pipelineEngine._emit('checkpoint:pause', { stageName: 's' });
      expect(service.getCurrentGate('p1')).toBe(null);
    });

    it('uses runId as projectId when projectId missing', () => {
      pipelineEngine._emit('checkpoint:pause', {
        runId: 'r1',
        stageName: 's',
      });
      expect(service.getCurrentGate('r1')).toBeTruthy();
    });
  });

  describe('gate queue', () => {
    it('queues multiple gates per project', () => {
      pipelineEngine._emit('checkpoint:pause', { projectId: 'p1', stageName: 's1' });
      pipelineEngine._emit('checkpoint:pause', { projectId: 'p1', stageName: 's2' });
      // getCurrentGate returns first
      const first = service.getCurrentGate('p1');
      expect(first.stageName).toBe('s1');
    });

    it('pushes next gate after first resolved', () => {
      const wc = { isDestroyed: () => false, send: vi.fn() };
      getMainWindow.mockReturnValue({ webContents: wc });
      pipelineEngine._emit('checkpoint:pause', { projectId: 'p1', stageName: 's1' });
      pipelineEngine._emit('checkpoint:pause', { projectId: 'p1', stageName: 's2' });
      wc.send.mockClear();
      const first = service.getCurrentGate('p1');
      service.approveGate(first.id, 'approve');
      // Should push next gate
      expect(wc.send).toHaveBeenCalledWith('approval:request', expect.objectContaining({
        type: 'approval_gate',
        stageName: 's2',
      }));
    });
  });

  describe('startListening / stopListening', () => {
    it('registers checkpoint:pause listener', () => {
      expect(pipelineEngine.on).toHaveBeenCalledWith('checkpoint:pause', expect.any(Function));
    });

    it('is idempotent', () => {
      const before = pipelineEngine.on.mock.calls.length;
      service.startListening();
      expect(pipelineEngine.on.mock.calls.length).toBe(before);
    });

    it('stopListening prevents further events', () => {
      service.stopListening();
      pipelineEngine._emit('checkpoint:pause', { projectId: 'p1', stageName: 's' });
      expect(service.getCurrentGate('p1')).toBe(null);
    });
  });

  describe('clearProjectGates', () => {
    it('removes all gates for project', () => {
      pipelineEngine._emit('checkpoint:pause', { projectId: 'p1', stageName: 's1' });
      pipelineEngine._emit('checkpoint:pause', { projectId: 'p1', stageName: 's2' });
      service.clearProjectGates('p1');
      expect(service.getCurrentGate('p1')).toBe(null);
    });
  });
});
