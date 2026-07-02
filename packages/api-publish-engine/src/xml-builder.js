/**
 * 视频号 XML 内容构建器 (提取自蚁小二 FinderXmlBuilder)
 */
class FinderXmlBuilder {
  buildContent(content) {
    const parts = ["<finder>", "  <version>1</version>"];
    const segs = this._parse(content);
    parts.push("  <valuecount>" + segs.length + "</valuecount>");
    const ats = [];
    segs.forEach((s, i) => {
      if (s.t === "topic") {
        parts.push("  <value" + i + " raw=\"" + this._esc(JSON.stringify(s.r)) + "\"><![CDATA[" + s.text + "]]></value" + i + ">");
      } else {
        parts.push("  <value" + i + "><![CDATA[" + this._esc(s.text) + "]]></value" + i + ">");
        if (s.t === "mention") ats.push(i);
      }
    });
    if (ats.length) parts.push("  <style><at>" + ats.join(",") + "</at></style>");
    parts.push("</finder>");
    return parts.join("\\n");
  }
  _parse(html) {
    const segs = [];
    const re = /(#([^#]+)#|@([\\u4e00-\\u9fa5\\w]+))/g;
    let idx = 0, m;
    while ((m = re.exec(html)) !== null) {
      if (m.index > idx) segs.push({ t: "text", text: html.slice(idx, m.index) });
      segs.push({ t: m[2] ? "topic" : "mention", text: m[0], r: m[2] ? { name: m[2] } : null });
      idx = m.index + m[0].length;
    }
    if (idx < html.length) segs.push({ t: "text", text: html.slice(idx) });
    return segs;
  }
  _esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;"); }
}
module.exports = { FinderXmlBuilder };