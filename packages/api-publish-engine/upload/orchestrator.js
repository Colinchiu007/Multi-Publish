const CosP = require("./providers/cos-provider");
const OssP = require("./providers/oss-provider");
const HttpP = require("./providers/http-provider");
const cos = new CosP();
const oss = new OssP();
const http = new HttpP();
const MAP = {
  xiaohongshu: cos, tencent_video: cos,
  zhihu: oss, dewu: oss, yidianhao: oss,
  douyin: http, kuaishou: http, baijiahao: http,
  bilibili: http, weibo: http, toutiao: http,
  wechat_mp: http, aiqiyi: http, dayu: http,
  qiehao: http, souhu: http, wangyi: http,
  tengxun_shipin: http, weishi: http, souhu_shipin: http,
  pipixia: http, meipai: http, acfun: http,
  chejiahao: http, yichehao: http, meiyou: http,
  xhs_shangjia: http, xigua: http, duoduo: http
};
function getUploadProvider(p) { return MAP[p] || null; }
async function upload(td, cookie) {
  const p = getUploadProvider(td.platform);
  if (!p) return null;
  const v = td.filePath ? await p.uploadVideo(td, cookie) : null;
  let c = null;
  if (td.coverPath) c = await p.uploadCover(td, cookie);
  return { video: v, cover: c };
}
module.exports = { getUploadProvider, upload, platformMap: MAP };
