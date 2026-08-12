/**
 * retry-middleware.js ? ?? / ?? / ?????
 *
 * ?? BasePlatformAdapter ? execute() ???
 *   retry: ???????????? 3 ???????
 *   circuit-breaker: ?????????????
 *   cache: GET ?????TTL ????
 */

// === ??? ===
var circuitStates = {};

function getCircuitState(key) {
  if (!circuitStates[key]) {
    circuitStates[key] = { failures: 0, lastFailure: 0, state: "closed" };
  }
  return circuitStates[key];
}

const CIRCUIT_THRESHOLD = 5;       // ????????
const CIRCUIT_RESET_MS = 30000;    // ????????

function isCircuitOpen(key, log) {
  var cs = getCircuitState(key);
  if (cs.state === "closed") return false;
  if (cs.state === "open") {
    if (Date.now() - cs.lastFailure > CIRCUIT_RESET_MS) {
      cs.state = "half-open";
      if (log && typeof log.info === "function") log.info("RetryMiddleware", "circuit half-open key=" + key);
      return false; // ??????
    }
    return true;
  }
  // half-open: ?????? recordSuccess/Failure ??????
  return false;
}

function recordSuccess(key, log) {
  var cs = getCircuitState(key);
  var wasOpen = cs.state === "open" || cs.state === "half-open";
  cs.failures = 0;
  cs.state = "closed";
  if (wasOpen && log && typeof log.info === "function") {
    log.info("RetryMiddleware", "circuit closed key=" + key);
  }
}

function recordFailure(key, log) {
  var cs = getCircuitState(key);
  cs.failures++;
  cs.lastFailure = Date.now();
  if (cs.failures >= CIRCUIT_THRESHOLD && cs.state !== "open") {
    cs.state = "open";
    if (log && typeof log.warn === "function") {
      log.warn("RetryMiddleware", "circuit opened key=" + key + " failures=" + cs.failures);
    }
  }
}

// === ?? ===
async function withRetry(fn, opts) {
  opts = opts || {};
  var maxRetries = opts.maxRetries || 3;
  var baseDelay = opts.baseDelay || 1000;
  var circuitKey = opts.circuitKey || "default";
  var log = opts.logger || null;

  if (isCircuitOpen(circuitKey, log)) {
    if (log && typeof log.warn === "function") {
      log.warn("RetryMiddleware", "circuit open rejected key=" + circuitKey);
    }
    /** @type {Error & {code?: string, status?: number}} */
    var err = new Error("Circuit breaker open for: " + circuitKey);
    err.code = "CIRCUIT_OPEN";
    throw err;
  }

  var lastErr;
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        var delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(function(r) { setTimeout(r, delay); });
      }
      var result = await fn();
      recordSuccess(circuitKey, log);
      return result;
    } catch (err) {
      lastErr = err;
      // ???????
      /** @type {Error & {code?: string, status?: number}} */
      if (err.code === 'CIRCUIT_OPEN') throw err;
      if (err.status === 401 || err.status === 403) throw err; // ???????
      if (err.status && err.status < 500 && err.status !== 429) throw err; // 4xx ?????????429 ?????
      recordFailure(circuitKey, log);
      if (attempt < maxRetries && log && typeof log.warn === "function") {
        log.warn("RetryMiddleware", "retry attempt=" + (attempt + 1) + "/" + (maxRetries + 1) + " key=" + circuitKey + " error=" + (err && err.message ? err.message : String(err)) + " delay=" + (baseDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// === ?? ===
var cacheStore = {};

function withCache(fn, opts) {
  opts = opts || {};
  var key = opts.cacheKey || "default";
  var ttl = opts.ttl || 60000; // ?? 60s

  var entry = cacheStore[key];
  if (entry && Date.now() - entry.ts < ttl) {
    return Promise.resolve(entry.data);
  }

  var val = fn();
  if (val && typeof val.then === "function") return val.then(function(result) {
    cacheStore[key] = { data: result, ts: Date.now() };
    return result;
  });
  cacheStore[key] = { data: val, ts: Date.now() };
  return val;
}

function clearCache(key) {
  if (key) {
    delete cacheStore[key];
  } else {
    cacheStore = {};
  }
}

function getCacheStats() {
  return { size: Object.keys(cacheStore).length, keys: Object.keys(cacheStore) };
}

// === ????? ===
async function withMiddleware(fn, opts) {
  opts = opts || {};
  var result;

  // ????? GET/?????
  if (opts.cacheable) {
    result = await withCache(fn, { cacheKey: opts.cacheKey, ttl: opts.cacheTtl });
  } else {
    result = await fn();
  }

  return result;
}

module.exports = {
  withRetry,
  withCache,
  withMiddleware,
  clearCache,
  getCacheStats,
  isCircuitOpen,
  getCircuitState,
  CIRCUIT_THRESHOLD,
  CIRCUIT_RESET_MS,
};
