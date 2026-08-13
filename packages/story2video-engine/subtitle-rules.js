'use strict'
// subtitle-rules.json 单源 JS 入口：供 Electron 主进程（CJS）与 node10 解析直接 require；
// TS/ESM 侧仍从 ./src/subtitle-rules.json 加载（同字节）。
// @ts-ignore -- CJS JSON require；tsconfig.check 未开 resolveJsonModule（运行时 Node 原生支持）
module.exports = require('./src/subtitle-rules.json')
