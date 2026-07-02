const { BasePlatformAdapter } = require("../base-adapter");

class ZhihuAdapter extends BasePlatformAdapter {
  constructor() {
    super("zhihu");
    this.apiBase = "https://zhuanlan.zhihu.com";
    this.wwwBase = "https://www.zhihu.com";
  }

  getReferer() { return "https://zhuanlan.zhihu.com/write"; }
  getOrigin() { return "https://zhuanlan.zhihu.com"; }

  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, {
      "Content-Type": "application/json",
      "x-requested-with": "XMLHttpRequest",
      ...extra,
    });
  }

  // Zhihu doesn't need video upload for articles
  async uploadVideo() { return null; }
  async uploadCover() { return null; }

  buildPostData(taskData) {
    const post = {
      title: taskData.title || "",
      content: taskData.content || "",
    };
    if (taskData.tags && taskData.tags.length > 0) {
      post.topics = taskData.tags.map((t) => ({ name: typeof t === "string" ? t : t.name }));
    }
    return post;
  }

  async publish(cookie, postData, cancelToken) {
    const headers = this.getHeaders(cookie);
    // Step 1: Create draft
    const draftResp = await this.http.post(
      this.apiBase + "/api/articles/drafts",
      { title: postData.title, content: postData.content },
      { headers }
    );
    if (cancelToken && cancelToken.isCancelled) return { success: false, error: "Cancelled" };

    if (!draftResp.data || (!draftResp.data.id && !draftResp.data.article_id)) {
      const msg = draftResp.data?.error?.message || draftResp.data?.message || "Failed to create draft";
      return { success: false, error: msg, platform: "zhihu" };
    }

    const articleId = draftResp.data.article_id || draftResp.data.id;

    // Step 2: Add topics if provided
    if (postData.topics && postData.topics.length > 0) {
      try {
        await this.http.post(
          this.apiBase + "/api/articles/" + articleId + "/topics",
          { topics: postData.topics.map((t) => t.name) },
          { headers }
        );
      } catch (e) {
        // Non-fatal if topic add fails
      }
    }

    // Step 3: Publish
    const pubResp = await this.http.post(
      this.apiBase + "/api/v4/content/publish",
      {
        article_id: articleId,
        comment_permission: postData.commentPermission || "all",
        declare: postData.declare || "",
      },
      { headers }
    );

    if (pubResp.data?.success || pubResp.data?.id || pubResp.status === 200) {
      return { success: true, url: this.apiBase + "/p/" + articleId, platform: "zhihu", publishId: articleId };
    }

    // Fallback: draft was saved but publish endpoint response unexpected
    return { success: true, url: this.apiBase + "/p/" + articleId, platform: "zhihu", publishId: articleId, draft: true };
  }
}

module.exports = ZhihuAdapter;
