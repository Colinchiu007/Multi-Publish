---
version: v1
name: shemei-guanjia-design-system
description: >-
  社媒管家设计体系——浅薰衣草紫为灵魂色，奶油白为基底，精致优雅、
  温暖艺术。面向个人自媒体的多平台发布工具，操作像手机 App 一样直觉愉悦。

memorable_thing: >-
  浅薰衣草紫的温暖设计，让内容发布变得愉悦。

target_user: 个人自媒体（博主、内容创作者）

colors:
  bg: "#f8f4ff"
  surface: "#ffffff"
  primary: "#7c5cbf"
  secondary: "#f472b6"
  text: "#1e1b4b"
  text_muted: "#7c7c9a"
  border: "#e0d8f0"
  border_light: "#f0ebff"
  success: "#34d399"
  warning: "#fbbf24"
  error: "#f87171"

typography:
  display:
    fontFamily: Satoshi
    fallback: "sans-serif"
    weights: [700, 900]
    source: Fontshare CDN
    chinese: "斯宋 / Noto Serif SC"
    chinese_weights: [600, 700]
    chinese_source: Google Fonts
  body:
    fontFamily: "DM Sans"
    fallback: "sans-serif"
    weights: [400, 500, 600]
    source: Google Fonts
    chinese: "阿里巴巴普惠体"
    chinese_weights: [400, 500, 600]
    chinese_source: "官网免费下载"
  mono:
    fontFamily: "JetBrains Mono"
    fallback: monospace
    weights: [400, 500]
    source: Google Fonts

  scale:
    hero: 48px
    h1: 32px
    h2: 24px
    h3: 20px
    h4: 18px
    body: 15px
    small: 13px
    caption: 12px

spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

border_radius:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  pill: 9999px

layout:
  approach: sidebar-content
  sidebar_width: 240px
  nav_height: 56px
  max_content_width: 1200px
  grid_columns: 12

motion:
  approach: minimal-intentional
  durations:
    hover: 150ms
    transition: 300ms
    fade: 200ms
  easing: ease-out

decoration:
  level: intentional
  details:
    - subtle grain texture overlay (opacity 0.02)
    - soft shadow for elevated cards
    - smooth hover transition on interactive elements

chinese_note: >-
  中文字体配合标题用思源宋体拉出精致感，内容用普惠体保持清晰可读。
  Satoshi + 思源宋体在标题层的对比是设计的灵魂，建立“时尚+艺术”的视觉质感。
