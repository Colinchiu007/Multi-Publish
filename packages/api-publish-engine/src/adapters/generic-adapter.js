const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");
const platformConfigs = require("./platform-configs");

/**
 * GenericPlatformAdapter - config-driven adapter for simple publish platforms.
 * Created during Phase 1.3 refactoring to eliminate ~20 boilerplate adapters.
 */
class GenericPlatformAdapter extends BasePlatformAdapter {
  constructor(name, config) {
    super(name);
    this.apiBase = config.apiBase;
    this._referer = config.referer;
    this._origin = config.origin;
    this._contentType = config.contentType;
    this._publishPath = config.publishPath;
  }

  getReferer() { return this._referer; }
  getOrigin() { return this._origin; }

  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, { "Content-Type": this._contentType, ...extra });
  }

  async uploadVideo(td, cookie) {
    const r = await upload({ ...td, platform: this.name }, cookie);
    return r?.video || null;
  }

  async uploadCover(td, cookie) {
    const r = await upload({ ...td, platform: this.name }, cookie);
    return r?.cover || null;
  }

  buildPostData(t) {
    return { title: t.title || "", content: t.content || "", tags: t.tags || [] };
  }

  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post(this.apiBase + this._publishPath, postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0 || resp.data?.success)
      return { success: true, platform: this.name, publishId: resp.data?.data?.id || resp.data?.data?.post_id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: this.name };
  }
}

/**
 * Create a generic adapter instance for the given platform.
 */
function createAdapter(name) {
  const config = platformConfigs[name];
  if (!config) return null;
  return new GenericPlatformAdapter(name, config);
}

module.exports = { GenericPlatformAdapter, createAdapter };
