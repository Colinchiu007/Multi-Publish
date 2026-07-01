# 敏感词预检 — 技术方案

> **架构师**: PROJECT-003 | **日期**: 2026-06-13
> **参考**: 融媒宝 sensitivelibrary.txt 设计思路
> **词库**: 开源中文敏感词库 `sensitive-word-filter`

---

## 一、方案

### 方案 A：DFA 算法 + 开源词库

```javascript
// DFA (Deterministic Finite Automaton)
// 将敏感词构建成树形结构，一次遍历完成检测
```

| 维度 | 评分 |
|------|:----:|
| **性能** | ⭐⭐⭐⭐⭐（O(n) 时间复杂度） |
| **准确性** | ⭐⭐⭐⭐（无漏报） |
| **安装** | ⭐⭐⭐⭐⭐（纯 JS，无原生编译） |
| **推荐** | ✅ **采纳** |

---

## 二、集成方式

### 集成点

```
用户点击「发布」
    │
    ├─ 2. 调用 sensitiveFilter.check(content)
    │      ↓
    │  命中敏感词 → 弹窗提示用户修改
    │  无命中 → 继续发布
    │
    └─ 3. 正常发布流程
```

### UI 交互

- 命中敏感词时弹出 ElMessageBox，列出具体词和位置
- 允许用户修改后重新检查
- 也允许强制发布（跳过检查）

---

## 三、接口设计

```javascript
// packages/shared-utils/src/sensitive-filter.js

class SensitiveFilter {
  constructor(wordList) { ... }

  /** 检查文本是否含敏感词 */
  check(text) → { hasSensitive: boolean, words: string[], positions: [{word, index}] }

  /** 替换敏感词为 *** */
  replace(text, replacer='***') → string
}
```

## 四、验收

- [ ] 加载词库，构建 DFA 树
- [ ] 命中敏感词 → 返回具体词和位置
- [ ] 空文本不崩溃
- [ ] 正常文本无命中 → 正确返回
- [ ] 替换功能正常
- [ ] 支持增量添加敏感词
