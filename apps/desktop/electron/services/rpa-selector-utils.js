'use strict'
/**
 * RPA 选择器解析工具
 *
 * 原生 DOM querySelector 不支持 Playwright 风格的 :has-text("文本") / text=文本 选择器。
 * 这里生成一段自包含的 IIFE 代码，在渲染进程内执行：
 *   1. 先尝试 document.querySelector(selector)（兼容原生 CSS）
 *   2. 失败时按文本匹配查找 button/a/span/div 等元素
 * 返回匹配元素或 null。
 */
function buildResolveElementCode (sel) {
  const s = JSON.stringify(sel)
  const lines = [
    '(function(){',
    '  function _findByText(selector){',
    "    var m = selector.match(/:has-text\\(([\"'])([^\"']+)\\1\\)/) || selector.match(/^text=([^\\s]+)/);",
    '    if (!m) return null;',
    '    var text = (m[2] || m[1] || "").trim();',
    '    if (!text) return null;',
    '    var all = document.querySelectorAll("button,a,span,div,li,label,p,em,strong");',
    '    for (var i=0;i<all.length;i++){',
    '      var el = all[i]; var t = (el.innerText||"").trim();',
    '      if (!t || t.indexOf(text)===-1) continue;',
    '      var low = el.tagName.toLowerCase();',
    '      if (low==="button"||low==="a"||low==="li"||low==="span"||low==="label"||low==="em"||low==="strong"||el.children.length===0) return el;',
    '    }',
    '    for (var j=0;j<all.length;j++){ var e2=all[j]; if((e2.innerText||"").trim()===text) return e2; }',
    '    return null;',
    '  }',
    '  var _s = ' + s + ';',
    '  try { var _el = document.querySelector(_s); if (_el) return _el; } catch(e) {}',
    '  return _findByText(_s);',
    '})()',
  ]
  return lines.join('\n')
}

module.exports = { buildResolveElementCode }
