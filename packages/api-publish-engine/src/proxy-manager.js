// 代理管理 (提取自蚁小二 createProxyAgent)
const { HttpsProxyAgent } = require("https-proxy-agent");
const { HttpProxyAgent } = require("http-proxy-agent");

function createProxyAgent(proxyConfig) {
  if (!proxyConfig || !proxyConfig.host || !proxyConfig.port) return null;
  const auth = (proxyConfig.username && proxyConfig.password)
    ? proxyConfig.username + ":" + proxyConfig.password + "@"
    : "";
  const protocol = proxyConfig.protocol || "http";
  const proxyUrl = protocol + "://" + auth + proxyConfig.host + ":" + proxyConfig.port;
  return {
    httpAgent: new HttpProxyAgent(proxyUrl),
    httpsAgent: new HttpsProxyAgent(proxyUrl),
  };
}

module.exports = { createProxyAgent };