/**
 * E2E 环境预检。
 * 将 Vite 服务不可达和浏览器进程不可启动与业务断言失败分开报告。
 */

const http = require('node:http');
const https = require('node:https');

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_BROWSER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];
const preflightCache = new Map();

class E2EEnvironmentError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'E2EEnvironmentError';
    this.code = 'E2E_ENVIRONMENT_BLOCKED';
    this.stage = options.stage || 'unknown';
    this.url = options.url || null;
    this.details = options.details || null;
    if (options.cause) this.cause = options.cause;
  }
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new TypeError('E2E 预检 URL 不能为空');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('E2E 预检仅支持 HTTP(S) URL');
  }
  return url.toString().replace(/\/$/, '');
}

function probeHttp(url, options = {}) {
  const target = new URL(url);
  const transport = target.protocol === 'https:' ? https : http;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  return new Promise((resolve, reject) => {
    const request = transport.request(target, { method: 'GET' }, (response) => {
      response.resume();
      response.once('end', () => resolve({ status: response.statusCode || 0 }));
    });
    request.once('error', reject);
    request.setTimeout(timeout, () => {
      request.destroy(new Error(`HTTP 预检超时（${timeout}ms）`));
    });
    request.end();
  });
}

function getChromium(options) {
  if (options && options.chromiumImpl) return options.chromiumImpl;
  return require('playwright').chromium;
}

function cacheKeyFor(url, options) {
  if (options.cacheKey) return String(options.cacheKey);
  return url;
}

async function preflightE2EEnvironment(options = {}) {
  const url = normalizeUrl(options.url || process.env.TEST_URL || 'http://127.0.0.1:5174');
  const useCache = options.cache !== false;
  const cacheKey = cacheKeyFor(url, options);
  if (useCache && preflightCache.has(cacheKey)) return preflightCache.get(cacheKey);

  const task = (async () => {
    const httpProbe = options.httpProbe || probeHttp;
    let response;
    try {
      response = await httpProbe(url, { timeout: options.timeout ?? DEFAULT_TIMEOUT });
    } catch (cause) {
      throw new E2EEnvironmentError(
        `Vite 服务不可达：${url}（${cause.message || cause}）`,
        { stage: 'vite', url, cause },
      );
    }

    const status = Number(response && response.status);
    if (!Number.isInteger(status) || status < 200 || status >= 400) {
      throw new E2EEnvironmentError(
        `Vite 服务返回不可用状态：${status || '未知'}（${url}）`,
        { stage: 'vite', url, details: { status } },
      );
    }

    const chromiumImpl = getChromium(options);
    let browser;
    try {
      browser = await chromiumImpl.launch({
        headless: options.headless !== false,
        args: options.browserArgs || DEFAULT_BROWSER_ARGS,
      });
    } catch (cause) {
      throw new E2EEnvironmentError(
        `Chromium 无法启动：${cause.message || cause}`,
        { stage: 'chromium', url, cause },
      );
    }

    try {
      if (browser && typeof browser.close === 'function') await browser.close();
    } catch (cause) {
      throw new E2EEnvironmentError(
        `Chromium 预检清理失败：${cause.message || cause}`,
        { stage: 'chromium', url, cause },
      );
    }

    return { ok: true, url, status, stage: 'complete' };
  })();

  if (useCache) preflightCache.set(cacheKey, task);
  try {
    return await task;
  } catch (error) {
    if (useCache) preflightCache.delete(cacheKey);
    throw error;
  }
}

function resetPreflightCache() {
  preflightCache.clear();
}

module.exports = {
  DEFAULT_BROWSER_ARGS,
  E2EEnvironmentError,
  normalizeUrl,
  probeHttp,
  preflightE2EEnvironment,
  resetPreflightCache,
};
