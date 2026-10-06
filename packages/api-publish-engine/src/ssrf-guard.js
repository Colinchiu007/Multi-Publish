'use strict'
/**
 * SSRF 防护与出网 URL 校验（单一口径，供 webhook 与媒体拉取共用）
 *
 * 抽取自 webhook-manager.js 内联的私有网段黑名单。原先那段逻辑只服务
 * webhook，媒体拉取要复用时若再抄一份，屏蔽清单就会分叉——这是典型的
 * 同一类控制存在两份实现的老问题（参见 publish-api-capabilities.js
 * 里矩阵键名与路由方法名曾拼不上的事故）。故抽为独立模块，两处共用。
 *
 * 判定口径（与既有 webhook 行为**逐条一致**，不因抽取而改变任何一条）：
 *   1. 只接受 http/https；带 user:pass 的 URL 直接拒。
 *   2. 主机名小写化；IPv6 字面量去掉方括号。
 *   3. localhost 与 *.localhost 直接拒。
 *   4. IP 字面量命中私有/保留网段直接拒。
 *   5. 域名**不**在此处下判定——须由调用方解析后逐个校验解析结果
 *      （见 assertAllResolvedAddresses），否则「公网域名解析到 127.0.0.1」
 *      这类绕过会漏掉。5 是本模块最容易用错的地方，见文件末尾的告警。
 */
var net = require("net");
var dns = require("dns");

var BLOCKED_IPV4 = new net.BlockList();
var BLOCKED_IPV6 = new net.BlockList();
[
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
].forEach(function (entry) { BLOCKED_IPV4.addSubnet(entry[0], entry[1], "ipv4"); });
[
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96],
  ["64:ff9b:1::", 48], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7],
  ["fe80::", 10], ["ff00::", 8],
].forEach(function (entry) { BLOCKED_IPV6.addSubnet(entry[0], entry[1], "ipv6"); });

/** 主机名规范化：小写 + 去掉 IPv6 字面量的方括号。 */
function normalizeHostname (hostname) {
  var value = String(hostname || "").toLowerCase();
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

/**
 * 单个地址是否落在私有/保留网段。
 * **无法识别的地址一律判为阻塞**（fail-closed）：解析器给了我们看不懂的
 * 结果时，放行等于把决定权交给未知输入。
 */
function isBlockedAddress (address) {
  var family = net.isIP(address);
  if (!family) return true;
  return family === 4
    ? BLOCKED_IPV4.check(address, "ipv4")
    : BLOCKED_IPV6.check(address, "ipv6");
}

/**
 * 解析 URL 并做「不看 DNS」的那部分校验（协议 / 凭据 / localhost / IP 字面量）。
 *
 * ⚠️ 返回的 URL **尚未**证明其目标地址可出网。域名必须再经
 * assertAllResolvedAddresses 校验解析结果才能使用——只调本函数就发请求，
 * 等于给「公网域名 → 私网 IP」留了绕过口。
 *
 * @param {string} value
 * @param {{label?:string, maxLength?:number}} [opts] label 用于错误信息
 * @returns {URL}
 */
function parseOutboundUrl (value, opts) {
  opts = opts || {};
  var label = opts.label || "URL";
  var maxLength = opts.maxLength || 2048;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error(label + " must be a non-empty string within " + maxLength + " chars");
  }
  var parsed;
  // ⚠️ 文案须与抽取前**逐字**一致：既有调用方（webhook-manager 及其测试/下游）
  // 按 `Invalid webhook URL` 正则匹配 URL 解析失败这一支。抽取时把它改写成
  // 统一模板就会匹配失败——抽取共用逻辑顺带改文案 = 悄悄改了对外行为。
  // 故解析失败单独保留历史文案，其余分支才用统一模板。
  try {
    parsed = new URL(value);
  } catch (e) {
    throw new Error(opts.invalidUrlMessage || ("Invalid " + label));
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(label + " must be http:// or https:// without embedded credentials");
  }
  var host = normalizeHostname(parsed.hostname);
  var literalFamily = net.isIP(host);
  if (host === "localhost" || host.endsWith(".localhost") || (literalFamily && isBlockedAddress(host))) {
    throw new Error(label + " cannot point to internal/private network");
  }
  return parsed;
}

/**
 * 解析域名并逐个校验全部结果；只要**有一个**结果落在私有网段就整体拒绝
 * （不做「挑一个安全的结果用」——那会让攻击者靠 DNS 轮询择机）。
 *
 * @param {string} hostname 已规范化的主机名
 * @param {{lookup?:Function, label?:string}} [opts] lookup 可注入（测试用）
 */
async function assertAllResolvedAddresses (hostname, opts) {
  opts = opts || {};
  var label = opts.label || "URL host";
  var host = normalizeHostname(hostname);
  // IP 字面量已在 parseOutboundUrl 判过；这里只处理域名。
  if (net.isIP(host)) return;
  var lookup = typeof opts.lookup === "function" ? opts.lookup : dns.promises.lookup.bind(dns.promises);
  // DNS 解析失败必须同样 fail-closed：查不到目标 ≠ 目标安全。
  // 此前让 ENOTFOUND 原样冒泡，调用方拿不到「host 不可用」这层语义，
  // 只能靠 catch(e.message) 猜——不同的 DNS 库错误文案并不一致。
  var results;
  try {
    results = await lookup(host, { all: true, verbatim: true });
  } catch (e) {
    throw new Error(label + " could not be resolved (" + host + "): " + (e && e.code ? e.code : e.message));
  }
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(label + " could not be resolved (" + host + ")");
  }
  for (var i = 0; i < results.length; i++) {
    var entry = results[i];
    if (!entry || !entry.family || isBlockedAddress(entry.address)) {
      throw new Error(label + " resolves to internal/private network (" + host + ")");
    }
  }
}

/**
 * 完整的出网 URL 校验：静态部分 + DNS 解析结果。
 * @returns {Promise<URL>}
 */
async function assertOutboundUrl (value, opts) {
  var parsed = parseOutboundUrl(value, opts);
  await assertAllResolvedAddresses(parsed.hostname, opts);
  return parsed;
}

module.exports = {
  parseOutboundUrl,
  assertAllResolvedAddresses,
  assertOutboundUrl,
  isBlockedAddress,
  normalizeHostname,
  BLOCKED_IPV4,
  BLOCKED_IPV6,
};