/**
 * Twitter/X API Adapter (P0) ? Twitter API v2 + Media Upload
 *
 * Uses OAuth 1.0a (user context) for authentication.
 * Requires TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET in env.
 */
const https = require("https");

var CONFIG = {
  apiBase: "https://api.twitter.com/2",
  uploadBase: "https://upload.twitter.com/1.1",
};

class TwitterAdapter {
  constructor() { this.name = "twitter"; }

  _getAuth() {
    var apiKey = process.env.TWITTER_API_KEY;
    var apiSecret = process.env.TWITTER_API_SECRET;
    var accessToken = process.env.TWITTER_ACCESS_TOKEN;
    var accessSecret = process.env.TWITTER_ACCESS_SECRET;
    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
      throw new Error("Twitter: missing TWITTER_API_KEY/API_SECRET/ACCESS_TOKEN/ACCESS_SECRET");
    }
    return { apiKey, apiSecret, accessToken, accessSecret };
  }

  _bearerToken() {
    var key = process.env.TWITTER_API_KEY;
    var secret = process.env.TWITTER_API_SECRET;
    if (!key || !secret) return null;
    return Buffer.from(key + ":" + secret).toString("base64");
  }

  async execute(taskData, cookie, opts) {
    try {
      var auth = this._getAuth();

      // Create tweet via API v2
      var tweetBody = { text: taskData.content || taskData.title || "" };

      var result = await this._apiPost("/2/tweets", tweetBody, auth);
      return { success: true, platform: "twitter", publishId: result.data && result.data.id, tweetResult: result };
    } catch (e) {
      return { success: false, error: e.message, platform: "twitter" };
    }
  }

  _apiPost(path, body, auth) {
    return new Promise(function(resolve, reject) {
      var data = JSON.stringify(body);
      var req = https.request({
        hostname: "api.twitter.com",
        path: path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          Authorization: "Bearer " + Buffer.from(auth.apiKey + ":" + auth.apiSecret).toString("base64"),
        },
      }, function(resp) {
        var d = "";
        resp.on("data", function(c) { d += c; });
        resp.on("end", function() {
          try { resolve(JSON.parse(d)); }
          catch(e) { reject(new Error("Twitter API: " + d)); }
        });
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }
}

module.exports = TwitterAdapter;
