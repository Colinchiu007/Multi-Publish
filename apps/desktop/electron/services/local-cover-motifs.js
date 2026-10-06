// @ts-check
/**
 * local-cover-motifs.js — 封面纹样渲染器（16 种）
 *
 * 从 local-cover-generator.js 拆出（check-max-lines 门禁 limit=500）：
 * 纹样是**纯渲染函数**，与主题数据和合成逻辑解耦。
 *
 * 统一签名：(w, h, c, seed, y0) => svgFragment
 * 约定：所有纹样只在安全区 [y0, h] 内自适应布局。y0 由合成层按文字块底边算出，
 * 配合 <clipPath> 裁剪，确保装饰**永远不会横穿标题**。
 */
'use strict'

/**
 * 纹样：全部在安全区 [y0, h] 内自适应布局。
 * 约定：只允许在文字块下方绘制，且以低不透明度呈现，保证标题始终是视觉主体。
 * @param {number} w @param {number} h @param {string} c 描边/填充色
 * @param {number} seed @param {number} y0 安全区上边界
 * @returns {string} SVG 片段
 */
const motifs = {
  circuit (w, h, c, seed, y0) {
    const bh = h - y0, n = 7
    let s = `<g stroke="${c}" stroke-width="2" fill="none">`
    for (let i = 0; i < n; i++) {
      const y = (y0 + (bh / n) * i).toFixed(0)
      const x = (((seed >> (i % 12)) & 255) / 255) * w * 0.7 + w * 0.15
      s += `<path d="M0 ${y} H${x.toFixed(0)} l ${(w * 0.05).toFixed(0)} ${(bh / n).toFixed(0)} H${w}"/>`
      s += `<circle cx="${x.toFixed(0)}" cy="${y}" r="5" fill="${c}" stroke="none"/>`
    }
    return s + '</g>'
  },
  chart (w, h, c, seed, y0) {
    const bh = h - y0
    let s = ''
    for (let i = 0; i < 7; i++) {
      const barH = bh * (0.25 + (((seed >> i) & 31) / 31) * 0.6)
      const bx = w * 0.06 + i * (w * 0.13)
      s += `<rect x="${bx.toFixed(0)}" y="${(h - barH).toFixed(0)}" width="${(w * 0.085).toFixed(0)}" height="${barH.toFixed(0)}" fill="${c}" opacity="0.55" rx="5"/>`
    }
    s += `<polyline points="${(w * 0.06).toFixed(0)},${(y0 + bh * 0.2).toFixed(0)} ${(w * 0.32).toFixed(0)},${(y0 + bh * 0.55).toFixed(0)} ${(w * 0.55).toFixed(0)},${(y0 + bh * 0.4).toFixed(0)} ${(w * 0.78).toFixed(0)},${(y0 + bh * 0.78).toFixed(0)} ${(w * 0.96).toFixed(0)},${(y0 + bh * 0.6).toFixed(0)}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
    return s
  },
  steam (w, h, c, seed, y0) {
    const bh = h - y0
    let s = `<g fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round">`
    for (let i = 0; i < 3; i++) {
      const x = (w * (0.32 + i * 0.18)).toFixed(0)
      s += `<path d="M${x} ${(y0 + bh * 0.5).toFixed(0)} q -20 -${(bh * 0.12).toFixed(0)} 0 -${(bh * 0.24).toFixed(0)} q 20 -${(bh * 0.12).toFixed(0)} 0 -${(bh * 0.24).toFixed(0)}"/>`
    }
    s += '</g>'
    s += `<path d="M${(w * 0.18).toFixed(0)} ${(y0 + bh * 0.62).toFixed(0)} h${(w * 0.64).toFixed(0)} l -${(w * 0.05).toFixed(0)} ${(bh * 0.34).toFixed(0)} h -${(w * 0.54).toFixed(0)} z" fill="${c}" fill-opacity="0.5"/>`
    return s
  },
  mountains (w, h, c, seed, y0) {
    const bh = h - y0
    let s = `<circle cx="${(w * 0.8).toFixed(0)}" cy="${(y0 + bh * 0.16).toFixed(0)}" r="${(w * 0.09).toFixed(0)}" fill="${c}" opacity="0.6"/>`
    s += `<g fill="${c}" opacity="0.45"><path d="M0 ${h} L${(w * 0.28).toFixed(0)} ${(y0 + bh * 0.34).toFixed(0)} L${(w * 0.56).toFixed(0)} ${h} Z"/>`
    s += `<path d="M${(w * 0.32).toFixed(0)} ${h} L${(w * 0.66).toFixed(0)} ${(y0 + bh * 0.5).toFixed(0)} L${w} ${h} Z"/></g>`
    return s
  },
  pulse (w, h, c, seed, y0) {
    const bh = h - y0, y = (y0 + bh * 0.4).toFixed(0)
    return `<polyline points="0,${y} ${(w * 0.28).toFixed(0)},${y} ${(w * 0.35).toFixed(0)},${(y0 + bh * 0.12).toFixed(0)} ${(w * 0.45).toFixed(0)},${(y0 + bh * 0.78).toFixed(0)} ${(w * 0.53).toFixed(0)},${y} ${w},${y}" fill="none" stroke="${c}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>`
  },
  checklist (w, h, c, seed, y0) {
    const bh = h - y0, n = 4, sz = Math.min(w * 0.07, (bh / n) * 0.42)
    let s = `<g fill="none" stroke="${c}" stroke-width="4">`
    for (let i = 0; i < n; i++) {
      const y = y0 + bh * (0.15 + i * (0.8 / n)), x = w * 0.1
      s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${sz.toFixed(0)}" height="${sz.toFixed(0)}" rx="${(sz * 0.22).toFixed(0)}"/>`
      s += `<path d="M${(x + sz * 0.2).toFixed(0)} ${(y + sz * 0.52).toFixed(0)} l ${(sz * 0.2).toFixed(0)} ${(sz * 0.22).toFixed(0)} l ${(sz * 0.36).toFixed(0)} -${(sz * 0.44).toFixed(0)}" stroke-linecap="round" stroke-linejoin="round"/>`
      s += `<line x1="${(x + sz * 1.5).toFixed(0)}" y1="${(y + sz * 0.5).toFixed(0)}" x2="${(w * 0.9).toFixed(0)}" y2="${(y + sz * 0.5).toFixed(0)}" stroke-linecap="round"/>`
    }
    return s + '</g>'
  },
  book (w, h, c, seed, y0) {
    const bh = h - y0, n = 6
    let s = `<g stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round">`
    for (let i = 0; i < n; i++) {
      const y = (y0 + bh * (0.12 + i * (0.8 / n))).toFixed(0)
      const inset = (i % 3) * w * 0.05
      s += `<line x1="${(w * 0.1 + inset).toFixed(0)}" y1="${y}" x2="${(w * 0.9 - inset).toFixed(0)}" y2="${y}"/>`
    }
    s += `<line x1="${(w * 0.5).toFixed(0)}" y1="${(y0 + bh * 0.1).toFixed(0)}" x2="${(w * 0.5).toFixed(0)}" y2="${(y0 + bh * 0.9).toFixed(0)}"/></g>`
    return s
  },
  pixel (w, h, c, seed, y0) {
    let s = ''
    for (let i = 0; i < 46; i++) {
      const bx = (((seed >> (i % 16)) & 255) / 255) * w * 0.96
      const by = y0 + (((seed >> ((i + 3) % 16)) & 255) / 255) * (h - y0) * 0.94
      const sz = w * 0.022 + (((seed >> i) & 7) / 7) * (w * 0.05)
      s += `<rect x="${bx.toFixed(0)}" y="${by.toFixed(0)}" width="${sz.toFixed(0)}" height="${sz.toFixed(0)}" fill="${c}" opacity="0.7" rx="${(sz * 0.16).toFixed(0)}"/>`
    }
    return s
  },
  spotlight (w, h, c, seed, y0) {
    const bh = h - y0
    let s = `<polygon points="${(w * 0.42).toFixed(0)},${(y0 + bh * 0.1).toFixed(0)} ${(w * 0.58).toFixed(0)},${(y0 + bh * 0.1).toFixed(0)} ${(w * 0.95).toFixed(0)},${h} ${(w * 0.05).toFixed(0)},${h}" fill="${c}" opacity="0.45"/>`
    s += `<g fill="none" stroke="${c}" stroke-width="3" opacity="0.5">`
    for (let i = 0; i < 4; i++) {
      s += `<rect x="${(w * 0.04 + i * w * 0.24).toFixed(0)}" y="${(y0 + bh * 0.06).toFixed(0)}" width="${(w * 0.2).toFixed(0)}" height="${(bh * 0.88).toFixed(0)}" stroke-dasharray="12 10" rx="8"/>`
    }
    return s + '</g>'
  },
  paw (w, h, c, seed, y0) {
    const bh = h - y0, cx = w * 0.7, cy = y0 + bh * 0.34, r = Math.min(w * 0.1, bh * 0.22)
    let s = `<g fill="${c}"><ellipse cx="${cx.toFixed(0)}" cy="${(cy + r * 0.5).toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r * 0.8).toFixed(0)}"/>`
    for (let i = 0; i < 4; i++) {
      const a = (-140 + i * 40) * Math.PI / 180
      s += `<ellipse cx="${(cx + Math.cos(a) * r * 1.5).toFixed(0)}" cy="${(cy + Math.sin(a) * r * 1.5).toFixed(0)}" rx="${(r * 0.34).toFixed(0)}" ry="${(r * 0.44).toFixed(0)}"/>`
    }
    return s + '</g>'
  },
  road (w, h, c, seed, y0) {
    const bh = h - y0, ty = y0 + bh * 0.15
    let s = `<polygon points="${(w * 0.43).toFixed(0)},${ty.toFixed(0)} ${(w * 0.57).toFixed(0)},${ty.toFixed(0)} ${w},${h} 0,${h}" fill="${c}" opacity="0.3"/>`
    s += `<line x1="${(w * 0.5).toFixed(0)}" y1="${ty.toFixed(0)}" x2="${(w * 0.5).toFixed(0)}" y2="${h}" stroke="${c}" stroke-width="9" stroke-dasharray="28 24" opacity="0.55"/>`
    return s
  },
  ribbon (w, h, c, seed, y0) {
    const bh = h - y0
    let s = `<g fill="none" stroke="${c}" stroke-linecap="round">`
    for (let i = 0; i < 3; i++) {
      const y = y0 + bh * (0.2 + i * 0.28)
      s += `<path d="M-20 ${y.toFixed(0)} q ${(w * 0.26).toFixed(0)} -${(bh * 0.16).toFixed(0)} ${(w * 0.52).toFixed(0)} 0 t ${(w * 0.52).toFixed(0)} 0" stroke-width="${(16 - i * 4).toFixed(0)}" opacity="${(0.75 - i * 0.15).toFixed(2)}"/>`
    }
    return s + '</g>'
  },
  hearts (w, h, c, seed, y0) {
    let s = ''
    for (let i = 0; i < 10; i++) {
      const cx = (((seed >> (i % 12)) & 255) / 255) * w * 0.94
      const cy = y0 + (((seed >> ((i + 5) % 12)) & 255) / 255) * (h - y0) * 0.9
      const r = w * (0.025 + (i % 3) * 0.02)
      s += `<path transform="translate(${(cx - r).toFixed(0)},${(cy - r).toFixed(0)}) scale(${(r / 16).toFixed(3)})" fill="${c}" opacity="0.65" d="M16 30 C 0 18, -6 4, 4 -2 C 10 -6, 15 -1, 16 3 C 17 -1, 22 -6, 28 -2 C 38 4, 32 18, 16 30 Z"/>`
    }
    return s
  },
  arch (w, h, c, seed, y0) {
    const bh = h - y0
    let s = `<g fill="none" stroke="${c}" stroke-width="4">`
    for (let i = 0; i < 3; i++) {
      const inset = w * (0.06 + i * 0.13)
      const top = y0 + bh * (0.12 + i * 0.1)
      const aw = (w - inset * 2) / 2
      s += `<path d="M${inset.toFixed(0)} ${h} V${(top + aw).toFixed(0)} a ${aw.toFixed(0)} ${aw.toFixed(0)} 0 0 1 ${(w - inset * 2).toFixed(0)} 0 V${h}"/>`
    }
    return s + '</g>'
  },
  steps (w, h, c, seed, y0) {
    const bh = h - y0, n = 5, sw = w * 0.15, sh = (bh * 0.82) / n
    let s = `<g fill="${c}">`
    for (let i = 0; i < n; i++) {
      const x = w * 0.06 + i * sw * 1.12, y = h - (i + 1) * sh
      s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${sw.toFixed(0)}" height="${sh.toFixed(0)}" rx="7"/>`
    }
    return s + '</g>'
  },
  dots (w, h, c, seed, y0) {
    let s = `<g fill="${c}">`
    for (let i = 0; i < 56; i++) {
      const cx = ((seed >> (i % 16)) & 255) / 255 * w
      const cy = y0 + ((seed >> ((i + 2) % 16)) & 255) / 255 * (h - y0) * 0.95
      const r = 3 + (((seed >> i) & 7) / 7) * (w * 0.011)
      s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(1)}"/>`
    }
    return s + '</g>'
  },
}

module.exports = { motifs }
