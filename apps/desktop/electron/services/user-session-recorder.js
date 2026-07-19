'use strict';

const fs = require('fs');
const path = require('path');

class SessionRecorder {
  constructor() {
    this._enabled = process.env.BACKLOT_RECORD_SESSION === 'true';
    this._sessionsDir = path.join(__dirname, '../../tests/sessions');
    this._currentSession = null;
    this._filePath = null;
    this._startTime = 0;
  }

  startRecording(label) {
    if (!this._enabled) return null;
    if (!fs.existsSync(this._sessionsDir)) {
      fs.mkdirSync(this._sessionsDir, { recursive: true });
    }
    const timestamp = Date.now();
    this._filePath = path.join(this._sessionsDir, `${timestamp}-${label || 'unnamed'}.jsonl`);
    this._currentSession = {
      id: `${timestamp}`,
      label,
      filePath: this._filePath,
      eventCount: 0
    };
    this._startTime = Date.now();
    return this._currentSession;
  }

  recordCall(channel, args, result) {
    if (!this._enabled || !this._currentSession) return;
    const safeArgs = this._sanitizeArgs(args);
    const entry = {
      channel,
      args: safeArgs,
      result: this._sanitizeArgs(result),
      timestamp: Date.now() - this._startTime
    };
    fs.appendFileSync(this._filePath, JSON.stringify(entry) + '\n');
    this._currentSession.eventCount++;
  }

  stopRecording() {
    if (!this._enabled || !this._currentSession) return;
    this._filePath = null;
    this._currentSession = null;
  }

  getSession(sessionId) {
    const filePath = path.join(this._sessionsDir, `${sessionId}`);
    if (!fs.existsSync(filePath)) return null;
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    const events = lines.map(line => JSON.parse(line));
    return {
      id: sessionId,
      events
    };
  }

  replaySession(sessionFile, ipcMock) {
    const fullPath = path.isAbsolute(sessionFile) ? sessionFile : path.join(this._sessionsDir, sessionFile);
    if (!fs.existsSync(fullPath)) return { passed: 0, failed: 0, total: 0, error: 'File not found' };
    const lines = fs.readFileSync(fullPath, 'utf-8').split('\n').filter(Boolean);
    let passed = 0, failed = 0;
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        const result = ipcMock.invoke(event.channel, event.args);
        const expected = event.result;
        if (JSON.stringify(result) === JSON.stringify(expected)) passed++;
        else failed++;
      } catch (e) {
        failed++;
      }
    }
    return { passed, failed, total: lines.length };
  }

  _sanitizeArgs(obj) {
    if (Buffer.isBuffer(obj)) return `[Buffer: ${obj.length} bytes]`;
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this._sanitizeArgs(value);
      }
      return sanitized;
    }
    return obj;
  }
}

module.exports = { SessionRecorder };
