// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactSheetService } from '../services/contact-sheet-service';

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
    _listeners: listeners,
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
    _emit: vi.fn((event, data) => {
      const arr = listeners.get(event);
      if (arr) {
        for (const cb of arr) cb(data);
      }
    }),
  };
}

function createMockBoardService() {
  return {
    _subscribers: new Set(),
    buildBoardState: vi.fn(() => ({ projectId: 'p1', status: 'running' })),
    _pushToSubscribers: vi.fn(),
  };
}

describe('ContactSheetService', () => {
  let service;
  let pipelineEngine;
  let boardService;
  let getMainWindow;

  beforeEach(() => {
    pipelineEngine = createMockPipelineEngine();
    boardService = createMockBoardService();
    getMainWindow = vi.fn(() => null);
    service = new ContactSheetService({
      pipelineEngine,
      boardService,
      getMainWindow,
    });
    service.startListening();
  });

  describe('getContactSheet', () => {
    it('returns empty array for unknown project', () => {
      expect(service.getContactSheet('unknown')).toEqual([]);
    });

    it('returns empty array for null projectId', () => {
      expect(service.getContactSheet(null)).toEqual([]);
    });

    it('returns scenes after scene:complete event', () => {
      pipelineEngine._emit('scene:complete', {
        runId: 'r1',
        sceneId: 's1',
        projectId: 'p1',
        sceneName: 'Scene 1',
        takes: [{ id: 't1', thumbnail: 'a.jpg' }],
      });
      const scenes = service.getContactSheet('p1');
      expect(scenes.length).toBe(1);
      expect(scenes[0].id).toBe('s1');
      expect(scenes[0].status).toBe('AWAITING');
      expect(scenes[0].takes.length).toBe(1);
    });
  });

  describe('approveScene', () => {
    it('returns approved:false for unknown scene', () => {
      const result = service.approveScene('unknown', 't1');
      expect(result.approved).toBe(false);
    });

    it('updates scene status to APPROVED', () => {
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', takes: [{ id: 't1' }],
      });
      const result = service.approveScene('s1', 't1');
      expect(result.approved).toBe(true);
      expect(result.scene.status).toBe('APPROVED');
      expect(result.scene.selectedTakeId).toBe('t1');
      expect(result.scene.approvedAt).toBeTruthy();
    });

    it('notifies BoardService on approve', () => {
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', takes: [],
      });
      service.approveScene('s1');
      expect(boardService.buildBoardState).toHaveBeenCalledWith('p1');
      expect(boardService._pushToSubscribers).toHaveBeenCalled();
    });

    it('emits contact_sheet:all_approved when all scenes approved', () => {
      // Add 2 scenes
      pipelineEngine._emit('scene:complete', { sceneId: 's1', projectId: 'p1', takes: [] });
      pipelineEngine._emit('scene:complete', { sceneId: 's2', projectId: 'p1', takes: [] });
      // Approve first
      service.approveScene('s1');
      expect(pipelineEngine._emit).not.toHaveBeenCalledWith('contact_sheet:all_approved', expect.anything());
      // Approve second → should trigger all_approved
      service.approveScene('s2');
      expect(pipelineEngine._emit).toHaveBeenCalledWith('contact_sheet:all_approved', { projectId: 'p1' });
    });

    it('does not emit all_approved when not all approved', () => {
      pipelineEngine._emit('scene:complete', { sceneId: 's1', projectId: 'p1', takes: [] });
      pipelineEngine._emit('scene:complete', { sceneId: 's2', projectId: 'p1', takes: [] });
      service.approveScene('s1');
      expect(pipelineEngine._emit).not.toHaveBeenCalledWith('contact_sheet:all_approved', expect.anything());
    });
  });

  describe('rejectScene', () => {
    it('returns rejected:false for unknown scene', () => {
      const result = service.rejectScene('unknown', 'bad');
      expect(result.rejected).toBe(false);
      expect(result.requeued).toBe(false);
    });

    it('requeues scene (status back to QUEUED, takes cleared)', () => {
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', takes: [{ id: 't1' }],
      });
      const result = service.rejectScene('s1', 'poor quality');
      expect(result.rejected).toBe(true);
      expect(result.requeued).toBe(true);
      expect(result.scene.status).toBe('QUEUED');
      expect(result.scene.takes).toEqual([]);
      expect(result.scene.feedback).toBe('poor quality');
    });

    it('emits scene:retry event', () => {
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', takes: [],
      });
      service.rejectScene('s1', 'feedback');
      expect(pipelineEngine._emit).toHaveBeenCalledWith('scene:retry', expect.objectContaining({
        sceneId: 's1',
        projectId: 'p1',
        feedback: 'feedback',
      }));
    });

    it('notifies BoardService on reject', () => {
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', takes: [],
      });
      service.rejectScene('s1');
      expect(boardService.buildBoardState).toHaveBeenCalledWith('p1');
      expect(boardService._pushToSubscribers).toHaveBeenCalled();
    });
  });

  describe('_onSceneComplete event handling', () => {
    it('sets scene status to AWAITING', () => {
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', takes: [{ id: 't1' }],
      });
      const scenes = service.getContactSheet('p1');
      expect(scenes[0].status).toBe('AWAITING');
    });

    it('auto-assigns scene index and name', () => {
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', takes: [],
      });
      const scenes = service.getContactSheet('p1');
      expect(scenes[0].index).toBe(1);
      expect(scenes[0].name).toBe('Scene 1');
    });

    it('uses sceneName from event if provided', () => {
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', sceneName: '开场', takes: [],
      });
      const scenes = service.getContactSheet('p1');
      expect(scenes[0].name).toBe('开场');
    });

    it('pushes approval:request via main window', () => {
      const wc = { isDestroyed: () => false, send: vi.fn() };
      getMainWindow.mockReturnValue({ webContents: wc });
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', takes: [{ id: 't1' }],
      });
      expect(wc.send).toHaveBeenCalledWith('approval:request', expect.objectContaining({
        type: 'contact_sheet',
        sceneId: 's1',
        projectId: 'p1',
      }));
    });

    it('pushes approval:request via BoardService subscribers', () => {
      const wc = { isDestroyed: () => false, send: vi.fn() };
      boardService._subscribers.add(wc);
      // Disable main window to isolate subscriber path
      getMainWindow.mockReturnValue(null);
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', takes: [],
      });
      expect(wc.send).toHaveBeenCalledWith('approval:request', expect.objectContaining({
        type: 'contact_sheet',
      }));
    });
  });

  describe('scene:fail event', () => {
    it('sets scene status to FAILED', () => {
      // First add a scene via complete
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', takes: [],
      });
      // Now emit fail
      pipelineEngine._emit('scene:fail', {
        sceneId: 's1', projectId: 'p1', error: 'timeout',
      });
      const scenes = service.getContactSheet('p1');
      expect(scenes[0].status).toBe('FAILED');
      expect(scenes[0].error).toBe('timeout');
    });
  });

  describe('startListening / stopListening', () => {
    it('registers event listeners on startListening', () => {
      expect(pipelineEngine.on).toHaveBeenCalledWith('scene:complete', expect.any(Function));
      expect(pipelineEngine.on).toHaveBeenCalledWith('scene:fail', expect.any(Function));
      expect(pipelineEngine.on).toHaveBeenCalledWith('pipeline:start', expect.any(Function));
    });

    it('is idempotent (calling twice does not double-register)', () => {
      const callCountBefore = pipelineEngine.on.mock.calls.length;
      service.startListening();
      expect(pipelineEngine.on.mock.calls.length).toBe(callCountBefore);
    });

    it('stopListening prevents further events', () => {
      service.stopListening();
      pipelineEngine._emit('scene:complete', {
        sceneId: 's1', projectId: 'p1', takes: [],
      });
      expect(service.getContactSheet('p1')).toEqual([]);
    });
  });

  describe('multiple projects isolation', () => {
    it('keeps scenes separate per project', () => {
      pipelineEngine._emit('scene:complete', { sceneId: 's1', projectId: 'p1', takes: [] });
      pipelineEngine._emit('scene:complete', { sceneId: 's2', projectId: 'p2', takes: [] });
      expect(service.getContactSheet('p1').length).toBe(1);
      expect(service.getContactSheet('p2').length).toBe(1);
      expect(service.getContactSheet('p1')[0].id).toBe('s1');
      expect(service.getContactSheet('p2')[0].id).toBe('s2');
    });

    it('approveScene finds scene across projects', () => {
      pipelineEngine._emit('scene:complete', { sceneId: 's1', projectId: 'p1', takes: [] });
      pipelineEngine._emit('scene:complete', { sceneId: 's2', projectId: 'p2', takes: [] });
      const result = service.approveScene('s2');
      expect(result.approved).toBe(true);
      expect(result.scene.projectId).toBe('p2');
    });
  });
});
