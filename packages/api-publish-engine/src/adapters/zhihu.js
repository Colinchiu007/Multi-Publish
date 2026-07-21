const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");

const ZHIHU_DECLARATION_TYPES = {
  1: "spoiler",
  2: "medical_advice",
  3: "fictional_creation",
  4: "contain_finance",
  5: "ai_creation",
};

function normalizeDeclaration(value) {
  const declaration = Number(value);
  return Number.isInteger(declaration) && declaration >= 0 && declaration <= 5 ? declaration : 0;
}

function buildCreationStatement(value) {
  const declaration = normalizeDeclaration(value);
  return declaration === 0
    ? { disclaimer_status: "close", disclaimer_type: "none" }
    : { disclaimer_status: "open", disclaimer_type: ZHIHU_DECLARATION_TYPES[declaration] };
}

class ZhihuAdapter extends BasePlatformAdapter {
  constructor() { super("zhihu"); this.apiBase = "https://zhuanlan.zhihu.com"; this.wwwBase = "https://www.zhihu.com"; }
  getReferer() { return "https://zhuanlan.zhihu.com/write"; }
  getOrigin() { return "https://zhuanlan.zhihu.com"; }
  getHeaders(cookie, extra) { return super.getHeaders(cookie, { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest", ...extra }); }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "zhihu"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "zhihu"}, cookie); return r?.cover || null; }
  buildPostData(td) {
    const post = {
      title: td.title || "",
      content: td.content || "",
      commentPermission: "anyone",
      declare: normalizeDeclaration(td.declare),
    };
    if (td.tags && td.tags.length > 0) post.topics = td.tags.map(t => ({ name: typeof t === "string" ? t : t.name }));
    return post;
  }
  async publish(cookie, pd, ct) {
    const h = this.getHeaders(cookie);
    const dr = await this.http.post(this.apiBase + "/api/articles/drafts", { title: pd.title, content: pd.content }, { headers: h });
    if (ct && ct.isCancelled) return { success: false, error: "Cancelled" };
    if (!dr.data || (!dr.data.id && !dr.data.article_id)) { const msg = dr.data?.error?.message || dr.data?.message || "Failed to create draft"; return { success: false, error: msg, platform: "zhihu" }; }
    const aid = dr.data.article_id || dr.data.id;
    if (pd.topics && pd.topics.length > 0) { try { await this.http.post(this.apiBase + "/api/articles/" + aid + "/topics", { topics: pd.topics.map(t => t.name) }, { headers: h }); } catch(e) { console.warn('[zhihu] topics 提交失败:', e.message); } }
    const commentPermission = "anyone";
    const creationStatement = buildCreationStatement(pd.declare);
    const businessParams = {
      commentPermission,
      ...creationStatement,
    };
    const publishPayload = {
      article_id: aid,
      comment_permission: commentPermission,
      declare: normalizeDeclaration(pd.declare),
      commentsPermission: { comment_permission: commentPermission },
      creationStatement,
      extra_info: { pc_business_params: JSON.stringify(businessParams) },
    };
    const pr = await this.http.post(this.wwwBase + "/api/v4/content/publish", publishPayload, { headers: h });
    if (pr.data?.success || pr.data?.id || pr.status === 200) return { success: true, url: this.apiBase + "/p/" + aid, platform: "zhihu", publishId: aid };
    return { success: true, url: this.apiBase + "/p/" + aid, platform: "zhihu", publishId: aid, draft: true };
  }
}
module.exports = ZhihuAdapter;
