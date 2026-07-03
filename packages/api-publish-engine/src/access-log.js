class AccessLogger {
  constructor(opts) {
    opts = opts || {};
    this._enabled = opts.enabled !== false;
    this._writeFn = opts.writeFn || function(line) { console.log(line); };
  }

  log(req, res, startTime) {
    if (!this._enabled) return;
    var duration = Date.now() - startTime;
    var line = "[" + new Date().toISOString() + "] " + req.method + " " + req.url + " " + res.statusCode + " " + duration + "ms";
    this._writeFn(line);
  }
}

module.exports = { AccessLogger };