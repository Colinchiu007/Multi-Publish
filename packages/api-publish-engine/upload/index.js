module.exports = {
  getUploadProvider: require("./orchestrator").getUploadProvider,
  upload: require("./orchestrator").upload,
  getAcquirer: require("./token-acquirer").getAcquirer,
  getCachedToken: require("./token-acquirer").getCachedToken,
  clearTokenCache: require("./token-acquirer").clearCache,
  CosProvider: require("./providers/cos-provider"),
  OssProvider: require("./providers/oss-provider"),
  HttpProvider: require("./providers/http-provider")
};
