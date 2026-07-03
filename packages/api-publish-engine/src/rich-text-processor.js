// 富文本处理器 — 话题/@好友占位符替换 (提取自蚁小二 RichTextProcessor)

class RichTextProcessor {
  process(html) {
    const segments = [];
    let idx = 0;
    let match;
    const re = /(#([^#]+)#|@([\\u4e00-\\u9fa5\\w]+))/g;

    while ((match = re.exec(html)) !== null) {
      if (match.index > idx) {
        segments.push({ type: "text", text: html.slice(idx, match.index) });
      }
      if (match[2]) {
        segments.push({ type: "topic", text: match[0], name: match[2] });
      } else if (match[3]) {
        segments.push({ type: "mention", text: match[0], name: match[3] });
      }
      idx = match.index + match[0].length;
    }
    if (idx < html.length) {
      segments.push({ type: "text", text: html.slice(idx) });
    }

    // Build platform-specific format
    const topicOutput = segments
      .filter(s => s.type === "topic")
      .map((s, i) => ({ id: i, name: s.name, text: s.text }));

    return { segments, topics: topicOutput };
  }
}

module.exports = { RichTextProcessor };