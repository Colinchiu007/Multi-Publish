/**
 * TikTok API Adapter (P0) ? TikTok Business API / Content Posting
 *
 * Requires TIKTOK_ACCESS_TOKEN in env.
 * Uses TikTok Business API for video posting and content publishing.
 */
const https = require("https");

class TikTokAdapter {
  constructor() { this.name = "tiktok"; }

  _getToken() {
    var token = process.env.TIKTOK_ACCESS_TOKEN;
    if (!token) throw new Error("TikTok: missing TIKTOK_ACCESS_TOKEN");
    return token;
  }

  async execute(taskData, cookie, opts) {
    try {
      var token = this._getToken();

      // Initialize upload
      var initRes = await this._apiPost("/video/init/", {
        access_token: token,
        upload_type: "FILE_UPLOAD",
        source_info: { source: "FILE_UPLOAD", video_size: taskData.videoSize || 0 },
      });

      var uploadUrl = initRes && initRes.data && initRes.data.upload_url;
      if (!uploadUrl) {
        return { success: true, platform: "tiktok", publishInit: initRes };
      }

      // Publish
      // TikTok 是无标题平台（openspec/changes/publish-capability-registry）：
      // DOM 上传页只有 caption（2200 含话题），发布页填写的标题必须作为
      // description 首行插入，否则标题被丢弃。
      var composedDescription = [taskData.title, taskData.content]
        .map(function (part) { return typeof part === "string" ? part.trim() : ""; })
        .filter(function (part) { return part.length > 0; })
        .join("\n");
      var publishRes = await this._apiPost("/video/publish/", {
        access_token: token,
        post_info: {
          title: taskData.title || "",
          description: composedDescription,
          privacy_level: taskData.privacy || "PUBLIC",
        },
      });

      return { success: true, platform: "tiktok", publishId: publishRes && publishRes.data && publishRes.data.publish_id };
    } catch (e) {
      return { success: false, error: e.message, platform: "tiktok" };
    }
  }

  _apiPost(path, body) {
    return new Promise(function(resolve, reject) {
      var data = JSON.stringify(body);
      var req = https.request({
        hostname: "open.tiktokapis.com",
        path: "/v2" + path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      }, function(resp) {
        var d = "";
        resp.on("data", function(c) { d += c; });
        resp.on("end", function() {
          try { resolve(JSON.parse(d)); }
          catch(e) { reject(new Error("TikTok API: " + d)); }
        });
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }
}

module.exports = TikTokAdapter;
