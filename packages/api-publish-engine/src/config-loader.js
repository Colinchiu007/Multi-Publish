/**
 * config-loader.js — 配置加载器
 * 支持 JSON 配置文件 + 环境变量 + CLI 参数三层覆盖
 * 优先级: CLI args > 环境变量 > 配置文件 > 默认值
 */
const fs = require("fs");
const path = require("path");

// 默认配置
var DEFAULTS = {
  port: 3000,
  dryRun: false,
  apiKey: null,
  maxRpm: null,
  enableSchedule: false,
  auditLogFile: null,
  scheduleFile: null,
  planFile: null,
  accessLog: true,
  scheduleCheckInterval: 10000
};

// 环境变量映射: { configKey: envVarName }
var ENV_MAP = {
  port: "PORT",
  dryRun: "DRY_RUN",
  apiKey: "API_KEY",
  maxRpm: "MAX_RPM",
  enableSchedule: "ENABLE_SCHEDULE"
};

/**
 * 按优先级合并配置
 * @param {object} defaults - 默认值
 * @param {object} env - 环境变量值
 * @param {object} cli - CLI 参数值
 * @param {object} [configFile] - 配置文件值
 * @returns {object} 合并后的配置
 */
function mergeConfigs(defaults, env, cli, configFile) {
  var result = {};
  // 先应用默认值
  copyOwnProps(result, defaults || {});
  // 配置文件覆盖
  if (configFile) copyOwnProps(result, configFile);
  // 环境变量覆盖
  if (env) copyOwnProps(result, env);
  // CLI 参数覆盖（最高优先级）
  if (cli) copyOwnProps(result, cli);
  return result;
}

function copyOwnProps(target, source) {
  for (var key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      target[key] = source[key];
    }
  }
}

/**
 * 读取 JSON 配置文件
 * @param {string} filePath - 配置文件路径
 * @returns {object|null} 解析后的配置对象，失败返回 null
 */
function readConfigFile(filePath) {
  if (!filePath) return null;
  try {
    var resolved = path.resolve(filePath);
    var raw = fs.readFileSync(resolved, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * 读取环境变量配置
 * @returns {object} 环境变量中的配置项
 */
function readEnv() {
  var result = {};
  for (var key in ENV_MAP) {
    var val = process.env[ENV_MAP[key]];
    if (val !== undefined) {
      // 类型转换
      if (val === "true") result[key] = true;
      else if (val === "false") result[key] = false;
      else if (/^\d+$/.test(val)) result[key] = parseInt(val, 10);
      else result[key] = val;
    }
  }
  return result;
}

/**
 * 解析 CLI 参数（简易版，支持 --key value 格式）
 * @param {string[]} [argv] - 命令行参数数组
 * @returns {object} 解析后的配置项
 */
function parseCLI(argv) {
  argv = argv || process.argv.slice(2);
  var result = {};
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === "--config" && i + 1 < argv.length) {
      result.config = argv[i + 1];
      i++;
      continue;
    }
    if (argv[i] === "--port" && i + 1 < argv.length) {
      result.port = parseInt(argv[i + 1], 10) || 3000;
      i++;
    } else if (argv[i] === "--dry-run") {
      result.dryRun = true;
    } else if (argv[i] === "--api-key" && i + 1 < argv.length) {
      result.apiKey = argv[i + 1];
      i++;
    } else if (argv[i] === "--max-rpm" && i + 1 < argv.length) {
      result.maxRpm = parseInt(argv[i + 1], 10) || null;
      i++;
    } else if (argv[i] === "--enable-schedule") {
      result.enableSchedule = true;
    }
  }
  return result;
}

/**
 * 加载配置（完整流程）
 * @param {object} [opts] - 选项
 * @param {string} [opts.configFile] - 配置文件路径
 * @param {object} [opts.cliArgs] - CLI 参数对象（替代自动解析）
 * @param {boolean} [opts.readEnv] - 是否读取环境变量
 * @returns {object} 最终配置
 */
function loadConfig(opts) {
  opts = opts || {};

  // 1. 确定配置文件路径
  var configPath = opts.configFile || null;
  if (!configPath && opts.cliArgs && opts.cliArgs.config) {
    configPath = opts.cliArgs.config;
  }

  // 2. 读取配置文件
  var configFromFile = readConfigFile(configPath);

  // 3. 读取环境变量
  var envConfig = opts.readEnv ? readEnv() : {};

  // 4. 读取 CLI 参数
  var cliConfig = opts.cliArgs || {};

  // 5. 按优先级合并
  return mergeConfigs(DEFAULTS, envConfig, cliConfig, configFromFile);
}

module.exports = { loadConfig, mergeConfigs, readConfigFile, readEnv, parseCLI, DEFAULTS };