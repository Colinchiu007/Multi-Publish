// @ts-check
/**
 * RenderEngine — Electron 主进程模块
 * 管理 Remotion 子进程：启动、进度解析、取消
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { CompositionManager } = require('./composition-manager');

const COMPOSER_DIR = path.join(__dirname, '..', '..', '..', '..', 'packages', 'remotion-composer');

const MEDIA_PROFILES = {
  'youtube-landscape': { width: 1920, height: 1080, fps: 30 },
  'youtube-4k': { width: 3840, height: 2160, fps: 30 },
  'youtube-shorts': { width: 1080, height: 1920, fps: 30 },
  'tiktok': { width: 1080, height: 1920, fps: 30 },
  'instagram-reels': { width: 1080, height: 1920, fps: 30 },
  'wechat': { width: 1080, height: 1920, fps: 30 },
  'bilibili': { width: 1920, height: 1080, fps: 30 },
  'xiaohongshu': { width: 1080, height: 1440, fps: 30 },
  'generic-hd': { width: 1920, height: 1080, fps: 30 },
};

class RenderEngine {
  constructor() {
    this._currentProcess = null;
    this._canceled = false;
    this._compositionManager = new CompositionManager();
  }

  getStatus() {
    const composerExists = fs.existsSync(path.join(COMPOSER_DIR, 'package.json'));
    // 检查根目录 node_modules（workspace hoisting）或本地 node_modules
    const rootNodeModulesExist = fs.existsSync(path.join(COMPOSER_DIR, '..', '..', '..', 'node_modules', 'remotion'));
    const localNodeModulesExist = fs.existsSync(path.join(COMPOSER_DIR, 'node_modules'));
    const nodeModulesExist = rootNodeModulesExist || localNodeModulesExist;
    return { ready: composerExists && nodeModulesExist, composerExists, nodeModulesExist, composerDir: COMPOSER_DIR };
  }

  async installDeps(onProgress) {
    return new Promise((resolve) => {
      const child = spawn('npm', ['install'], { cwd: COMPOSER_DIR, shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      // 安全修复：保存到 _currentProcess 使 cancel() 能 kill（原未保存导致 installDeps 挂起时无法取消）
      this._currentProcess = child
      // 5 分钟超时保护（防止 npm install 挂起导致 Promise 永久 pending）
      const installTimer = setTimeout(() => {
        try { child.kill() } catch (_) { /* ignore */ }
        resolve({ success: false, error: 'npm install timed out (5min)' })
      }, 5 * 60 * 1000)
      // R28 修复：unref 让定时器不阻止进程退出
      if (installTimer && installTimer.unref) installTimer.unref()
      child.stdout.on('data', (d) => { if (onProgress) onProgress(d.toString()); });
      child.stderr.on('data', (d) => { if (onProgress) onProgress(d.toString()); });
      child.on('close', (code) => { clearTimeout(installTimer); resolve(code === 0 ? { success: true } : { success: false, error: `npm install exited with code ${code}` }); });
      child.on('error', (err) => { clearTimeout(installTimer); resolve({ success: false, error: err.message }); });
    });
  }

  /** 获取 Composition 列表 */
  listCompositions() {
    return this._compositionManager.listCompositions();
  }

  /** 获取单个 Composition 详情 */
  getComposition(id) {
    return this._compositionManager.getComposition(id);
  }

  /** 校验 props */
  validateProps(compositionId, props) {
    return this._compositionManager.validateProps(compositionId, props);
  }

  render(props, options = {}) {
    return new Promise((resolve) => {
      const { composition = 'Explainer', outputPath = path.join(os.tmpdir(), `remotion_${Date.now()}.mp4`), onProgress = () => {}, profile } = options;

      if (!props || !Array.isArray(props.cuts) || props.cuts.length === 0) { resolve({ success: false, error: 'Props must contain cuts array' }); return; }
      for (const [i, cut] of props.cuts.entries()) {
        if (!cut.id) { resolve({ success: false, error: `cuts[${i}].id missing` }); return; }
        if (typeof cut.in_seconds !== 'number' || cut.in_seconds < 0) { resolve({ success: false, error: `cuts[${i}].in_seconds invalid` }); return; }
        if (typeof cut.out_seconds !== 'number' || cut.out_seconds <= cut.in_seconds) { resolve({ success: false, error: `cuts[${i}].out_seconds > in_seconds` }); return; }
      }

      this._canceled = false;

      // 写 props 到临时 JSON
      const propsPath = path.join(os.tmpdir(), `.remotion_props_${Date.now()}.json`);
      fs.writeFileSync(propsPath, JSON.stringify(props), 'utf-8');

      const cmd = ['npx', 'remotion', 'render', 'src/index.tsx', composition, outputPath, `--props=${propsPath}`];
      if (profile && MEDIA_PROFILES[profile]) { const p = MEDIA_PROFILES[profile]; cmd.push('--width', String(p.width), '--height', String(p.height), '--fps', String(p.fps)); }

      const child = spawn(cmd[0], cmd.slice(1), {
        cwd: COMPOSER_DIR,
        shell: true,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this._currentProcess = child;

      // eslint-disable-next-line no-unused-vars
      let stdout = '';

      child.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;

        // 解析进度: "Rendered frame 45/900"
        const match = text.match(/Rendered frame (\d+)\/(\d+)/);
        if (match) {
          const done = parseInt(match[1], 10);
          const total = parseInt(match[2], 10);
          // 边界修复：total=0 时除零得 Infinity，Math.round(Infinity)=Infinity 会破坏进度条 UI
          const percent = total > 0 ? Math.round((done / total) * 100) : 0;
          onProgress(percent, '渲染中');
        }

        // 解析渲染阶段
        if (text.includes('Computed')) {
          onProgress(0, '计算中');
        } else if (text.includes('Starting')) {
          onProgress(0, '启动渲染');
        } else if (text.includes('Encoding')) {
          onProgress(99, '编码中');
        }
      });

      child.stderr.on('data', (data) => {
        // Remotion 可能在 stderr 输出进度
        const text = data.toString();
        const match = text.match(/Rendered frame (\d+)\/(\d+)/);
        if (match) {
          const done = parseInt(match[1], 10);
          const total = parseInt(match[2], 10);
          // 边界修复：total=0 时除零得 Infinity，传播到 onProgress 破坏 UI
          const percent = total > 0 ? Math.round((done / total) * 100) : 0;
          onProgress(percent, '渲染中');
        }
      });

      child.on('close', (code) => {
        this._currentProcess = null;
        this._cleanup(propsPath);

        if (this._canceled) {
          resolve({ success: false, error: '渲染已取消' });
          return;
        }

        if (code !== 0) {
          resolve({ success: false, error: `渲染进程退出码: ${code}` });
          return;
        }

        if (!fs.existsSync(outputPath)) {
          resolve({ success: false, error: '渲染完成但未找到输出文件' });
          return;
        }

        resolve({ success: true, outputPath });
      });

      child.on('error', (err) => {
        this._currentProcess = null;
        this._cleanup(propsPath);
        resolve({ success: false, error: `启动渲染失败: ${err.message}` });
      });
    });
  }

  /** 取消当前渲染 */
  cancel() {
    if (this._currentProcess) {
      this._canceled = true;
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(this._currentProcess.pid), '/F', '/T']);
      } else {
        this._currentProcess.kill('SIGTERM');
      }
      this._currentProcess = null;
    }
  }

  _cleanup(propsPath) {
    try { fs.unlinkSync(propsPath); } catch { /* ignore */ }
  }
}

module.exports = RenderEngine
