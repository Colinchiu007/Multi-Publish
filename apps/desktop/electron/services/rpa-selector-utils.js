'use strict'
/**
 * RPA 选择器解析工具
 *
 * 原生 DOM querySelector 不支持 Playwright 风格的 :has-text("文本") / text=文本 选择器。
 * 这里生成一段自包含的 IIFE 代码，在渲染进程内执行：
 *   1. 先尝试 document.querySelector(selector)（兼容原生 CSS）
 *   2. 失败时按文本匹配查找：精确文本 + 可交互标签 > 精确文本叶子 > 包含文本可交互 > 包含文本
 * 返回匹配元素或 null。
 */
function buildResolveElementCode (sel) {
  const s = JSON.stringify(sel)
  const lines = [
    '(function(){',
    '  function _findByText(selector){',
    "    // Extract ALL :has-text(\"...\") patterns (not just the first one)",
    "    var hasTextRe = /:has-text\\(([\"'])([^\"']+)\\1\\)/g;",
    '    var hasTexts = [];',
    '    var hm;',
    '    while ((hm = hasTextRe.exec(selector)) !== null) {',
    '      if (hm[2] && hm[2].trim()) hasTexts.push(hm[2].trim());',
    '    }',
    "    var tm = selector.match(/^text=([^\\s]+)/);",
    '    if (tm && tm[1]) hasTexts.push(tm[1].trim());',
    '    if (hasTexts.length === 0) return null;',
    '    var all = [...document.querySelectorAll("button,a,span,div,li,label,p,em,strong,[role=button]")];',
    '    // Respect the tag/class constraints carried by the selector itself,',
    '    // so button:has-text(...) can never match a plain div tip.',
    '    var base = selector.split(":has-text")[0];',
    '    var tagM = base.match(/^([a-zA-Z][a-zA-Z0-9]*)/);',
    '    var wantTag = tagM ? tagM[1].toLowerCase() : null;',
    '    var classM, classRe = /\\.([a-zA-Z][a-zA-Z0-9_-]*)/g, wantClasses = [];',
    '    while ((classM = classRe.exec(base)) !== null) wantClasses.push(classM[1]);',
    '    function _matchesBase(el){',
    '      if (wantTag && el.tagName.toLowerCase() !== wantTag) return false;',
    '      var cn = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : (el.className || ""));',
    '      for (var c = 0; c < wantClasses.length; c++) { if (cn.indexOf(wantClasses[c]) === -1) return false; }',
    '      return true;',
    '    }',
    '    var scoped = all.filter(_matchesBase);',
    '    var pool = scoped.length > 0 ? scoped : all;',
    '    function _txt(el){ return String(el.innerText || el.textContent || "").trim(); }',
    '    function _interactive(el){ var l = el.tagName.toLowerCase(); return l === "button" || l === "a" || l === "li" || l === "label" || el.getAttribute("role") === "button"; }',
    '    function _visible(el){ try { return !!(el.offsetParent || el.getClientRects().length > 0); } catch (e) { return false; } }',
    '    function _pick(list){ for (var q = 0; q < list.length; q++) { if (_visible(list[q])) return list[q]; } return list.length ? list[0] : null; }',
    '    for (var ti = 0; ti < hasTexts.length; ti++) {',
    '      var text = hasTexts[ti];',
    '      var exactInteractive = [], exactLeaf = [], containsInteractive = [], containsAny = [];',
    '      for (var i = 0; i < pool.length; i++) {',
    '        var el = pool[i]; var t = _txt(el);',
    '        if (!t) continue;',
    '        if (t === text) { if (_interactive(el)) exactInteractive.push(el); else if (el.children.length === 0) exactLeaf.push(el); }',
    '        else if (t.indexOf(text) !== -1) { if (_interactive(el)) containsInteractive.push(el); else containsAny.push(el); }',
    '      }',
    '      // Exact text on an interactive element wins; otherwise tip copy such as',
    '      // "publish count" would steal the real publish button.',
    '      var hit = _pick(exactInteractive) || _pick(exactLeaf) || _pick(containsInteractive) || _pick(containsAny);',
    '      if (hit) return hit;',
    '    }',
    '    return null;',
    '  }',
    '  var _s = ' + s + ';',
    // ⚠️ 2026-09-30 外审更正（finding #1）：`_s` 是**完整选择器**（`JSON.stringify(sel)`），
    // **不是** `:has-text` 之前的部分。`document.querySelector("button:has-text(...)")` 会抛
    // SyntaxError（不支持的伪类）被下方 catch 吞掉，**旧代码本来就会落到 `_findByText`** ——
    // 即「含文本谓词则跳过 querySelector」对既有选择器是 **no-op**（等价、无害）。
    // 保留价值：① 显式化意图，不再依赖"抛错被吞"这一隐式路径；② 避免未来出现合法 CSS 里
    // 字面含 `:has-text(`（如 `[data-x=":has-text(foo)"]`）时被误跳过（当前无此配置，属潜在项）。
    // **注意**：头条发布行为的变化另有其因 —— 来自 `platform-selectors.js` 的候选收紧。
    '  var _hasTextPredicate = /:has-text\\(/.test(_s) || /^text=/.test(_s);',
    '  if (!_hasTextPredicate) {',
    '    try { var _el = document.querySelector(_s); if (_el) return _el; } catch(e) {}',
    '  }',
    '  return _findByText(_s);',
    '})()',
  ]
  return lines.join('\n')
}

module.exports = { buildResolveElementCode }

