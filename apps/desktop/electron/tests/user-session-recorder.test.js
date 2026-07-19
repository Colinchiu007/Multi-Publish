// @ts-nocheck
// 
// 
// 
/**
 * SessionRecorder 单元测试 — Backlot 用户会话录制与回放
 *
 * 测试覆盖：
 *   - BACKLOT_RECORD_SESSION=false 时 startRecording 返回 null
 *   - recordCall 写入 JSONL 行
 *   - 多事件录制后 JSONL 文件包含正确行数
 *   - getSession 读取正确
 *   - replaySession 回放验证
 *   - 大型 Buffer 参数截断
 *   - 多会话隔离
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const fs = require('fs');
const path = require('path');
const os = require('os');

let tempDir;
let recorder;
let SessionRecorder;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-recorder-test-'));
  delete require.cache[require.resolve('../services/user-session-recorder')];
  const mod = require('../services/user-session-recorder');
  SessionRecorder = mod.SessionRecorder;
  process.env.BACKLOT_RECORD_SESSION = 'true';
  recorder = new SessionRecorder();
  recorder._sessionsDir = tempDir;
});

afterEach(() => {
  const cleanupErrors = [];
  try {
    recorder.stopRecording();
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(error);
  }
  delete require.cache[require.resolve('../services/user-session-recorder')];
  delete process.env.BACKLOT_RECORD_SESSION;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'SessionRecorder 测试资源清理失败');
  }
});

describe('SessionRecorder — Backlot 用户会话录制与回放', () => {
  describe('BACKLOT_RECORD_SESSION 开关', () => {
    it('BACKLOT_RECORD_SESSION=false 时 startRecording 返回 null', () => {
      process.env.BACKLOT_RECORD_SESSION = 'false';
      const r = new SessionRecorder();
      r._sessionsDir = tempDir;
      const result = r.startRecording('test-session');
      expect(result).toBeNull();
    });

    it('BACKLOT_RECORD_SESSION=true 时 startRecording 返回会话对象', () => {
      const result = recorder.startRecording('test-session');
      expect(result).not.toBeNull();
      expect(result.id).toBeTruthy();
      expect(result.label).toBe('test-session');
      expect(result.filePath).toContain('.jsonl');
      expect(result.eventCount).toBe(0);
    });

    it('默认状态（env 未设置）时 startRecording 返回 null', () => {
      delete process.env.BACKLOT_RECORD_SESSION;
      const r = new SessionRecorder();
      r._sessionsDir = tempDir;
      const result = r.startRecording('test-session');
      expect(result).toBeNull();
    });
  });

  describe('recordCall 写入 JSONL', () => {
    it('录制时 recordCall 写入 JSONL 行', () => {
      recorder.startRecording('test-session');
      recorder.recordCall('channel:test', { foo: 'bar' }, { success: true });

      const session = recorder._currentSession;
      const content = fs.readFileSync(session.filePath, 'utf-8');
      expect(content).toContain('channel:test');
      expect(content).toContain('"foo":"bar"');
      expect(content).toContain('"success":true');
    });

    it('未开始录制时 recordCall 不写入', () => {
      recorder.recordCall('channel:test', { foo: 'bar' }, { success: true });
      const files = fs.readdirSync(tempDir);
      expect(files).toHaveLength(0);
    });

    it('session 为 null 时 recordCall 不报错', () => {
      expect(() => {
        recorder.recordCall('channel:test', { foo: 'bar' }, { success: true });
      }).not.toThrow();
    });

    it('stopRecording 后 recordCall 不写入', () => {
      recorder.startRecording('test-session');
      recorder.recordCall('channel:before', { n: 1 }, { ok: true });
      recorder.stopRecording();
      recorder.recordCall('channel:after', { n: 2 }, { ok: true });
      const files = fs.readdirSync(tempDir);
      expect(files).toHaveLength(1);
      const content = fs.readFileSync(path.join(tempDir, files[0]), 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
      expect(content).toContain('channel:before');
      expect(content).not.toContain('channel:after');
    });
  });

  describe('多事件录制', () => {
    it('多事件录制后 JSONL 文件包含正确行数', () => {
      recorder.startRecording('multi-event');
      recorder.recordCall('ch:1', { n: 1 }, { ok: true });
      recorder.recordCall('ch:2', { n: 2 }, { ok: true });
      recorder.recordCall('ch:3', { n: 3 }, { ok: false });

      const session = recorder._currentSession;
      const content = fs.readFileSync(session.filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      expect(lines).toHaveLength(3);
      expect(session.eventCount).toBe(3);
    });

    it('事件按写入顺序排列', () => {
      recorder.startRecording('order');
      recorder.recordCall('ch:1', { seq: 1 }, 'a');
      recorder.recordCall('ch:2', { seq: 2 }, 'b');
      recorder.recordCall('ch:3', { seq: 3 }, 'c');

      const session = recorder._currentSession;
      const content = fs.readFileSync(session.filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const events = lines.map(l => JSON.parse(l));
      expect(events[0].channel).toBe('ch:1');
      expect(events[1].channel).toBe('ch:2');
      expect(events[2].channel).toBe('ch:3');
      expect(events[2].args.seq).toBe(3);
    });
  });

  describe('getSession 读取', () => {
    it('getSession 读取录制内容', () => {
      recorder.startRecording('get-session');
      recorder.recordCall('ch:1', { x: 1 }, { y: 2 });

      const session = recorder._currentSession;
      const fileName = path.basename(session.filePath);
      const result = recorder.getSession(fileName);
      expect(result).not.toBeNull();
      expect(result.id).toBe(fileName);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].channel).toBe('ch:1');
      expect(result.events[0].args.x).toBe(1);
      expect(result.events[0].result.y).toBe(2);
    });

    it('getSession 返回多事件列表', () => {
      recorder.startRecording('multi-get');
      recorder.recordCall('ch:1', { n: 1 }, 'ok');
      recorder.recordCall('ch:2', { n: 2 }, 'ok');

      const session = recorder._currentSession;
      const fileName = path.basename(session.filePath);
      const result = recorder.getSession(fileName);
      expect(result.events).toHaveLength(2);
    });

    it('getSession 文件不存在时返回 null', () => {
      const result = recorder.getSession('nonexistent-file.jsonl');
      expect(result).toBeNull();
    });
  });

  describe('replaySession 回放', () => {
    it('replaySession 回放全部通过', () => {
      recorder.startRecording('replay-test');
      recorder.recordCall('ch:1', { a: 1 }, { result: 2 });
      recorder.recordCall('ch:2', { b: 2 }, { result: 4 });

      const ipcMock = {
        invoke: vi.fn((channel, ...args) => {
          if (channel === 'ch:1') return { result: 2 };
          if (channel === 'ch:2') return { result: 4 };
          return null;
        }),
      };

      const session = recorder._currentSession;
      const fileName = path.basename(session.filePath);
      const result = recorder.replaySession(fileName, ipcMock);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(2);
    });

    it('replaySession 记录不匹配时计入失败', () => {
      recorder.startRecording('replay-fail');
      recorder.recordCall('ch:1', { a: 1 }, { result: 2 });
      recorder.recordCall('ch:2', { b: 2 }, { result: 4 });

      const ipcMock = {
        invoke: vi.fn(() => ({ result: 999 })),
      };

      const session = recorder._currentSession;
      const fileName = path.basename(session.filePath);
      const result = recorder.replaySession(fileName, ipcMock);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.total).toBe(2);
    });

    it('replaySession 文件不存在时返回 error', () => {
      const ipcMock = { invoke: vi.fn() };
      const result = recorder.replaySession('nonexistent.jsonl', ipcMock);
      expect(result.error).toBe('File not found');
      expect(result.total).toBe(0);
    });

    it('replaySession ipcMock 抛错时计入失败', () => {
      recorder.startRecording('replay-error');
      recorder.recordCall('ch:1', { a: 1 }, { result: 2 });

      const ipcMock = {
        invoke: vi.fn(() => { throw new Error('mock error'); }),
      };

      const session = recorder._currentSession;
      const fileName = path.basename(session.filePath);
      const result = recorder.replaySession(fileName, ipcMock);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.total).toBe(1);
    });

    it('replaySession 支持绝对路径', () => {
      recorder.startRecording('replay-abs');
      recorder.recordCall('ch:1', { a: 1 }, { result: 2 });

      const ipcMock = {
        invoke: vi.fn(() => ({ result: 2 })),
      };

      const session = recorder._currentSession;
      const result = recorder.replaySession(session.filePath, ipcMock);
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  describe('Buffer 参数截断', () => {
    it('大型 Buffer 参数被截断为描述字符串', () => {
      recorder.startRecording('buffer-test');
      const bigBuffer = Buffer.alloc(1024 * 1024, 'A');
      recorder.recordCall('ch:buffer', { data: bigBuffer }, { ok: true });

      const session = recorder._currentSession;
      const content = fs.readFileSync(session.filePath, 'utf-8');
      expect(content).toContain('[Buffer: 1048576 bytes]');
      expect(content).not.toContain('AAAAAAAAA');
    });

    it('嵌套对象中的 Buffer 被递归截断', () => {
      recorder.startRecording('nested-buffer');
      const smallBuf = Buffer.from('hello');
      recorder.recordCall('ch:nested', { meta: { raw: smallBuf } }, { ok: true });

      const session = recorder._currentSession;
      const content = fs.readFileSync(session.filePath, 'utf-8');
      const parsed = JSON.parse(content.split('\n').filter(Boolean)[0]);
      expect(parsed.args.meta.raw).toBe('[Buffer: 5 bytes]');
    });

    it('Buffer 作为直接参数被截断', () => {
      recorder.startRecording('direct-buffer');
      const buf = Buffer.from('test');
      recorder.recordCall('ch:direct', buf, { ok: true });

      const session = recorder._currentSession;
      const content = fs.readFileSync(session.filePath, 'utf-8');
      const parsed = JSON.parse(content.split('\n').filter(Boolean)[0]);
      expect(parsed.args).toBe('[Buffer: 4 bytes]');
    });
  });

  describe('多会话隔离', () => {
    it('多会话隔离 — 各自独立文件', () => {
      const r1 = new SessionRecorder();
      r1._sessionsDir = tempDir;
      const r2 = new SessionRecorder();
      r2._sessionsDir = tempDir;

      r1.startRecording('session-a');
      r2.startRecording('session-b');

      r1.recordCall('ch:a1', { msg: 'from-a' }, { ok: true });
      r2.recordCall('ch:b1', { msg: 'from-b' }, { ok: true });
      r1.recordCall('ch:a2', { msg: 'from-a-2' }, { ok: true });

      const files = fs.readdirSync(tempDir);
      expect(files).toHaveLength(2);

      const fileA = files.find(f => f.includes('session-a'));
      const fileB = files.find(f => f.includes('session-b'));
      expect(fileA).toBeTruthy();
      expect(fileB).toBeTruthy();

      const contentA = fs.readFileSync(path.join(tempDir, fileA), 'utf-8');
      const contentB = fs.readFileSync(path.join(tempDir, fileB), 'utf-8');
      expect(contentA).toContain('ch:a1');
      expect(contentA).toContain('ch:a2');
      expect(contentA).not.toContain('ch:b1');
      expect(contentB).toContain('ch:b1');
      expect(contentB).not.toContain('ch:a1');
      expect(contentB).not.toContain('ch:a2');
    });

    it('多会话隔离 — 各自 eventCount 独立', () => {
      const r1 = new SessionRecorder();
      r1._sessionsDir = tempDir;
      const r2 = new SessionRecorder();
      r2._sessionsDir = tempDir;

      r1.startRecording('iso-a');
      r2.startRecording('iso-b');

      r1.recordCall('ch:1', { n: 1 }, { ok: true });
      r1.recordCall('ch:2', { n: 2 }, { ok: true });
      r2.recordCall('ch:1', { n: 1 }, { ok: true });

      expect(r1._currentSession.eventCount).toBe(2);
      expect(r2._currentSession.eventCount).toBe(1);

      r1.stopRecording();
      r2.stopRecording();
    });
  });

  describe('stopRecording', () => {
    it('stopRecording 清空文件路径和当前会话', () => {
      recorder.startRecording('stop-test');
      expect(recorder._currentSession).not.toBeNull();
      expect(recorder._filePath).not.toBeNull();
      recorder.stopRecording();
      expect(recorder._currentSession).toBeNull();
      expect(recorder._filePath).toBeNull();
    });

    it('未录制时 stopRecording 不报错', () => {
      expect(() => recorder.stopRecording()).not.toThrow();
    });
  });
});
