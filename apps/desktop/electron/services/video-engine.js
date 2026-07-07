// @ts-check
/**
 * VideoEngine — 视频处理工具引擎
 * 桥接 Python 视频处理/分析/增强/字幕/素材检索工具
 */

const path = require('path');
const fs = require('fs');

const PROCESS_TYPES = [
  'green-screen', 'reframe', 'trim', 'silence-remove',
  'bg-remove', 'face-enhance', 'upscale', 'color-grade',
  'lip-sync', 'talking-head',
];

const ANALYZE_TYPES = [
  'scene-detect', 'transcript', 'face-track', 'audio-energy',
];

const STOCK_SOURCES = [
  { id: 'pexels', name: 'Pexels', type: 'video+image' },
  { id: 'pixabay', name: 'Pixabay', type: 'video+image+audio' },
  { id: 'unsplash', name: 'Unsplash', type: 'image' },
  { id: 'videvo', name: 'Videvo', type: 'video' },
  { id: 'mixkit', name: 'Mixkit', type: 'video+audio' },
  { id: 'nasa', name: 'NASA', type: 'video+image' },
  { id: 'archive', name: 'Archive.org', type: 'video' },
  { id: 'coverr', name: 'Coverr', type: 'video' },
  { id: 'wikimedia', name: 'Wikimedia', type: 'image' },
  { id: 'pond5', name: 'Pond5 PD', type: 'video' },
];

class VideoEngine {
  constructor() {
    this._status = null;
  }

  /** 获取支持的处理类型列表 */
  listProcessTypes() {
    return [...PROCESS_TYPES];
  }

  /** 获取支持的分析类型列表 */
  listAnalyzeTypes() {
    return [...ANALYZE_TYPES];
  }

  /** 获取素材来源列表 */
  listStockSources() {
    return [...STOCK_SOURCES];
  }

  /** 获取引擎状态 */
  getStatus() {
    return {
      ffmpegAvailable: this._checkFfmpeg(),
      processTypes: PROCESS_TYPES,
      analyzeTypes: ANALYZE_TYPES,
    };
  }

  /** 检测 FFmpeg 可用性 */
  _checkFfmpeg() {
    try {
      const { spawnSync } = require('child_process');
      const result = spawnSync('ffmpeg', ['-version'], { timeout: 3000 });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  /** 音频混流 */
  async mixAudio({ narration, music, sfx }, outputPath, onProgress) {
    // 调用 Python 后端
    const bridge = this._getPythonBridge();
    if (bridge && bridge.isRunning()) {
      return bridge.requestBackend('POST', '/api/video/mix-audio', {
        narration, music, sfx, outputPath,
      }, 60000);
    }
    throw new Error('Python backend not available');
  }

  /** 视频处理 */
  async process(type, params, onProgress) {
    if (!PROCESS_TYPES.includes(type)) {
      throw new Error('Unsupported process type: ' + type);
    }
    const bridge = this._getPythonBridge();
    if (bridge && bridge.isRunning()) {
      return bridge.requestBackend('POST', '/api/video/process', {
        type, params,
      }, 300000);
    }
    throw new Error('Python backend not available');
  }

  /** 视频/音频分析 */
  async analyze(type, filePath) {
    if (!ANALYZE_TYPES.includes(type)) {
      throw new Error('Unsupported analyze type: ' + type);
    }
    const bridge = this._getPythonBridge();
    if (bridge && bridge.isRunning()) {
      return bridge.requestBackend('POST', '/api/video/analyze', {
        type, filePath,
      }, 120000);
    }
    throw new Error('Python backend not available');
  }

  /** 素材检索 */
  async searchStock(query, source, limit) {
    const bridge = this._getPythonBridge();
    if (bridge && bridge.isRunning()) {
      return bridge.requestBackend('POST', '/api/video/search-stock', {
        query, source, limit: limit || 10,
      }, 15000);
    }
    return { success: false, error: 'Python backend not available' };
  }

  /** 字幕生成 */
  async generateSubtitle(audioPath, language) {
    const bridge = this._getPythonBridge();
    if (bridge && bridge.isRunning()) {
      return bridge.requestBackend('POST', '/api/video/generate-subtitle', {
        audioPath, language: language || 'zh',
      }, 120000);
    }
    throw new Error('Python backend not available');
  }

  _getPythonBridge() {
    try { return require('./python-bridge'); } catch { return null; }
  }
}

module.exports = { VideoEngine };
