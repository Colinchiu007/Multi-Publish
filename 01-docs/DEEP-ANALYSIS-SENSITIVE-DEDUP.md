# DEEP-ANALYSIS-SENSITIVE-DEDUP — 敏感词检测与文本去重深度代码分析

> 日期：2026-09-08
> 目标工作区：`D:/Data/projects/mp-worktrees/mp-rewrite-engine-v2`
> 分析对象：`houbb/sensitive-word`（Java，6k★）+ `yanyiwu/simhash`（C++，1.2k★）+ `1e0ng/simhash`（Python，1k★）+ `simhash-js`（JS）+ `sensitive-words-dfa-filter`（Node）+ `gaohuifeng/sensitive-word-filter`（Node）
> 当前引擎：`packages/rewrite-engine/src/sensitive-filter.js`（v1，仅 2 示例词 + 线性 indexOf）
> 关联现状：`packages/shared-utils/src/sensitive-filter.js`（已含 DFA 基础版，见 §6.2）
> 用途：为 rewrite-engine v2 的敏感词检测与改写质量评估提供算法、词库分层、变体对抗、SimHash 指纹与移植方案

---

## 0. 结论速览（TL;DR）

- **DFA 匹配器是成熟、可移植、低复杂度的核心**。`houbb/sensitive-word` 的 DFA 树 + O(n) 单遍扫描可直接移植到 Node.js，纯 JS 无原生依赖，预计 200-300 行即可落地。**这是 rewrite-engine v2 敏感词检测的必选项（P0）。**
- **变体对抗（谐音/拆分/全半角/繁简/拼音）是 v1 与成熟方案的最大差距**。houbb 通过「字符归一化映射 + 忽略字符 + 重复词」三层实现；Node 生态 `sensitive-words-dfa-filter` 用「跳过字符缓存 + lenient 匹配」实现类似效果。两者思路可合并，复杂度中等（P1）。
- **词库分层**：houbb 内置 6W+ 词（源文件 18W+），分 5 大类标签（政治/毒品/色情/赌博/违法犯罪），支持黑白名单与动态热更新（单词增删无需全量重建）。**当前 v1 仅 2 个示例词，词库是最大短板，但词库本身不属算法移植，属运营数据工程（P0 配套）。**
- **SimHash 是改写质量评估的可行指纹方案**。64 位指纹 + 海明距离 <3 判重是行业标准。Node 实现复杂度低（Jenkins/MD5 hash + 加权求和 + 符号位），约 150 行。**中文需配合分词（jieba 系）或字符 n-gram，分词策略决定指纹质量（P1）。**
- **当前 v1 差距清单**：无 DFA、无词库、无变体、无热更新、无 SimHash、无相似度检测。**每一项都有成熟开源蓝本可直接移植。**

**推荐落地优先级**（见 §9）：
1. **P0**：DFA 匹配器移植（houbb 算法）+ 词库接入 + 热更新（单词增删）
2. **P0**：字符归一化（全角半角/大小写/繁简）+ 忽略字符（变体对抗基础）
3. **P1**：SimHash 64 位指纹 + 海明距离判重（改写质量评估）
4. **P1**：中文分词（jieba 系 Node 移植）接入 SimHash 加权
5. **P2**：谐音/拼音归一化 + 拆分词对抗（lenient 匹配）
6. **P2**：SimHashIndex 分桶索引（大规模判重）

---

## 1. DFA 自动机算法详解（houbb/sensitive-word）

### 1.1 算法原理

DFA（Deterministic Finite Automaton，确定性有限自动机）将敏感词集合构建成**前缀树（Trie）**，每个节点是「字符 → 子节点」的映射，词尾节点标记 `end=true`。匹配时**单遍扫描文本**，从每个位置尝试沿树向下走，O(n) 时间复杂度，与词库规模无关。

### 1.2 数据结构（`WordDataTreeNode.java`）

```java
public class WordDataTreeNode {
    private boolean end;                              // 关键词结束标识
    private Map<Character, WordDataTreeNode> subNodeMap; // 子节点映射

    public WordDataTreeNode getSubNode(final Character c) { return subNodeMap.get(c); }
    public WordDataTreeNode addSubNode(Character c, WordDataTreeNode subNode) {
        if (this.subNodeMap == null) subNodeMap = new HashMap<>();
        subNodeMap.put(c, subNode); return this;
    }
    public void removeNode(final Character c) { subNodeMap.remove(c); }
    public void clearNode() { subNodeMap = null; }
}
```

**要点**：子节点用 `HashMap`（Node.js 对应普通对象 `{}` 或 `Map`），`subNodeMap` 惰性初始化（null 时创建），支持删除节点。

### 1.3 构建（`WordDataTree.addWord`）

```java
private void addWord(WordDataTreeNode newRoot, String word) {
    WordDataTreeNode tempNode = newRoot;
    for (int i = 0; i < word.length(); i++) {
        char c = word.charAt(i);
        WordDataTreeNode subNode = tempNode.getSubNode(c);
        if (subNode == null) {
            subNode = new WordDataTreeNode();
            tempNode.addSubNode(c, subNode);   // 无则创建
        }
        tempNode = subNode;                    // 下移
    }
    tempNode.end(true);                        // 词尾标记
}
```

### 1.4 匹配（`WordDataTree.doContains` + `WordCheckWord.getActualLength`）

匹配核心分两步：**树遍历**（判断前缀/命中） + **长度计算**（处理变体/忽略字符）。

**树遍历（`doContains`）**：

```java
protected WordContainsTypeEnum doContains(StringBuilder stringBuilder, InnerSensitiveWordContext innerContext) {
    WordDataTreeNode nowNode = root;
    for (int i = 0; i < stringBuilder.length(); i++) {
        nowNode = getNowMap(nowNode, i, stringBuilder, innerContext); // 含重复词处理
        if (nowNode == null) return NOT_FOUND;
    }
    if (nowNode.end()) return CONTAINS_END;   // 完整命中
    return CONTAINS_PREFIX;                   // 仅前缀
}
```

**长度计算（`WordCheckWord.getActualLength`）** —— 这是变体对抗的关键，从 beginIndex 逐字符走：

```java
for (int i = beginIndex; i < txt.length(); i++) {
    if (wordCharIgnore.ignore(i, txt, innerContext) && tempLen != 0) {
        tempLen++; skipLen++; continue;        // ① 忽略字符（特殊符号/空白）跳过
    }
    char mappingChar = getMappingChar(formatCharMapping, txt.charAt(i)); // ② 归一化映射
    stringBuilder.append(mappingChar);
    tempLen++;
    // ③ 同时查黑名单(deny)与白名单(allow)
    WordContainsTypeEnum allow = wordDataAllow.contains(stringBuilder, ...);
    WordContainsTypeEnum deny  = wordData.contains(stringBuilder, ...);
    if (deny == CONTAINS_END) maxBlack = tempLen;   // 记录最长命中
    if (allow == CONTAINS_END) maxWhite = tempLen;   // 白名单覆盖
    if (allow == NOT_FOUND && deny == NOT_FOUND) break; // 前缀都不匹配，剪枝
}
```

**关键设计**：
- **白名单（allow）/ 黑名单（deny）双树**：白名单命中可覆盖黑名单，实现「放行词」。
- **failFast 模式**：命中即返回，用于「只判断有无」的高吞吐场景（14W+ QPS 的关键）。
- **最长匹配 vs 最短匹配**：houbb 记录 `maxBlack`（最长命中），避免短词遮蔽长词。

### 1.5 伪代码（Node.js 移植版）

```javascript
// 构建
function buildDFA(words) {
  const root = {};
  for (const w of words) {
    let node = root;
    for (const ch of w) { node = node[ch] || (node[ch] = {}); }
    node._end = true;
  }
  return root;
}

// 匹配：返回所有命中 [{word, index, length}]
function scan(text, root, { ignoreChar, normalizeChar, ignoreRepeat }) {
  const hits = [];
  for (let i = 0; i < text.length; i++) {
    let node = root, j = i, tempLen = 0, skipLen = 0, maxLen = 0;
    while (j < text.length) {
      const raw = text[j];
      if (ignoreChar(raw) && tempLen > 0) { tempLen++; skipLen++; j++; continue; }
      const ch = normalizeChar(raw);
      const next = node[ch] || (ignoreRepeat && j > i && ch === normalizeChar(text[j-1]) ? node : null);
      if (!next) break;                       // 前缀不匹配，剪枝
      node = next; tempLen++; j++;
      if (node._end) maxLen = tempLen;        // 记录最长命中
    }
    if (maxLen > 0) hits.push({ word: text.slice(i, i + maxLen - skipLen), index: i, length: maxLen - skipLen });
  }
  return hits;
}
```

### 1.6 复杂度评估

| 维度 | 说明 |
|------|------|
| 时间复杂度 | O(n)，单遍扫描，与词库规模无关 |
| 空间复杂度 | O(总词字符数)，前缀树节点数 |
| 构建复杂度 | O(总词字符数) |
| 热更新 | 单词增删 O(词长)，无需全量重建（见 §3.3） |
| 移植到 Node | **低**。纯对象/Map 即可，无原生依赖，200-300 行 |

---

## 2. 词库分层设计（houbb）

### 2.1 词库来源与规模

- `WordDenySystem.deny()` 合并三个资源：`sensitive_word_dict.txt`（中文）+ `sensitive_word_dict_en.txt`（英文）+ `sensitive_word_deny.txt`。
- README 声明：**收录 6W+ 词（源文件 18W+，经一次删减）**，持续优化。
- 词库文件为**每行一词**的纯文本，UTF-8。

### 2.2 分类标签（`WordTagType`）

```java
public enum WordTagType {
    ZHENGZHI("0", "政治"),
    DUPIN("1", "毒品"),
    SEQING("2", "色情"),
    DUBO("3", "赌博"),
    FANZUI("4", "违法犯罪"),
}
```

- 标签文件 `sensitive_word_tags.txt`，行格式：`单词 标签1,标签2`（空格分隔词与标签，逗号分隔多个标签）。
- `WordTagLines` 解析：`line.split(" ")` 取词，`split(",")` 取标签集合。
- 支持**一个词多标签**（如政治+违法）。

### 2.3 分层设计要点（对 v2 的启示）

| 层 | 说明 | v2 建议 |
|----|------|---------|
| 词库文件 | 每行一词，UTF-8 | 沿用，运营中心下发 |
| 分类标签 | 词→标签集合 | 建议扩展为：政治/色情/暴力/广告/诈骗/违法/赌博/毒品 |
| 白名单 | 放行词（allow） | 必须，避免误杀 |
| 黑名单 | 拦截词（deny） | 主词库 |
| 动态层 | 用户/运营自定义 | 与内置层分离，可热更新 |

---

## 3. 变体归一化算法（houbb）

### 3.1 三层归一化架构

houbb 的变体处理是**「字符归一化 + 忽略字符 + 重复词」**三层叠加，全部在匹配时实时完成（不预生成变体词）：

**① 字符归一化映射（`IWordFormat` + `formatCharMapping`）**

| 实现类 | 作用 |
|--------|------|
| `WordFormatIgnoreWidth` | 全角→半角（`InnerCharUtils.toHalfWidth`） |
| `WordFormatIgnoreCase` | 英文大小写统一（`toLowerCase`） |
| `WordFormatIgnoreNumStyle` | 数字形式统一（全角数字→半角等） |
| `WordFormatIgnoreEnglishStyle` | 英文常见形式（如 `go-vern-ment`→`government`） |
| `WordFormatIgnoreChineseStyle` | 中文繁简体互换 |
| `WordFormatIgnoreNumStyleC2C` | 数字字符映射 |

归一化通过 `formatCharMapping`（`Char2CharMap`，字符→字符映射）实现 O(1) 查表，`InnerWordFormatUtils.getMappingChar` 无映射时返回原字符。

**② 忽略字符（`ISensitiveWordCharIgnore`）**

`SpecialCharSensitiveWordCharIgnore`：匹配过程中跳过特殊符号/空白，实现「插字对抗」（如 `发^^轮`、`go-vern-ment`）。注意 houbb 的忽略**只在已匹配到字符后**生效（`tempLen != 0`），避免开头跳过导致误判。

**③ 重复词（`ignoreRepeat`，`getNowMap`）**

```java
if (context.ignoreRepeat() && index > 0) {
    char preMappingChar = stringBuilder.charAt(index-1);
    if (preMappingChar == mappingChar) {
        currentMap = nowNode;   // 重复字符沿用当前节点，实现「叠字对抗」
    }
}
```

处理 `发发发轮轮功` 这类叠字变体。

### 3.2 谐音/拼音/火星文处理

houbb 的 README 提及「汉字转拼音」能力，但核心匹配器**不内置拼音/谐音展开**——它依赖词库中**预收录变体词**（如词库中直接有 `ｆａｌｕｎｄａｆａ`、`发^^轮`、`go-vern-ment` 这类变体条目）。这是「词库对抗」而非「算法对抗」策略。

**对 v2 的启示**：谐音/火星文对抗有两种路径——
1. **词库预收录**（houbb 路线）：运营在词库中直接加变体词，算法零成本，但词库膨胀、覆盖有限。
2. **算法归一化**（Node 生态路线，见 §3.3）：拼音/谐音映射表 + 归一化，覆盖广但实现复杂、有误判风险。

**建议 v2 采用「词库预收录为主 + 全半角/大小写/繁简算法归一化为辅」**，拼音/谐音作为 P2 可选。

### 3.3 热更新（`WordDataTree` 动态增删）

```java
public synchronized void doAddWord(Collection<String> collection) {
    for (String word : collection) addWord(this.root, word);   // 增量，O(词长)
}
public synchronized void doRemoveWord(Collection<String> collection) {
    for (String word : collection) removeWord(this.root, word); // 增量，O(词长)
}
```

- **单词增删无需全量重建**（`addWord`/`removeWord` 直接在现有树上操作）。
- `removeWord` 处理三种情况：尾字符无子节点则删节点、有子节点则只清 `end` 标记、中间节点按需清理。
- `initWordData` 全量重建时用**新根节点构建完成后原子替换**（`this.root = newRoot`），避免构建中途被并发读到半成品。
- 方法 `synchronized` 保证线程安全（Node.js 单线程天然安全，但需注意事件循环内的同步性）。

---

## 4. SimHash 算法详解

### 4.1 算法原理

SimHash（Charikar, 2002）将文本映射为**定长指纹（通常 64 位）**，相似文本的指纹海明距离小。核心思想：**每个 token 哈希后按位加权求和，符号位决定最终指纹位**。

### 4.2 指纹生成（`yanyiwu/simhash` C++ 实现）

```cpp
bool make(const string& text, size_t topN, uint64_t& v64) const {
    // ① 分词 + 加权（jieba extractor，TF-IDF 权重）
    vector<pair<string,double>> wordweights;
    extract(text, wordweights, topN);
    // ② 每个词哈希（jenkins hash）
    vector<double> weights(BITS_LENGTH, 0.0);   // 64 位权重累加器
    for (auto& hw : wordweights) {
        uint64_t h = _hasher(hw.first.c_str(), hw.first.size(), 0);
        for (int j = 0; j < 64; j++) {
            // 该位为 1 加权重，为 0 减权重
            weights[j] += ((u64_1 << j) & h) ? hw.second : -hw.second;
        }
    }
    // ③ 符号位 → 指纹
    v64 = 0;
    for (int j = 0; j < 64; j++) if (weights[j] > 0.0) v64 |= (u64_1 << j);
    return true;
}
```

### 4.3 海明距离与判重阈值

```cpp
static bool isEqual(uint64_t lhs, uint64_t rhs, unsigned short n = 3) {
    return __builtin_popcountll(lhs ^ rhs) <= n;  // 海明距离 ≤ 3 判重
}
```

- **判重阈值：海明距离 < 3（即 ≤ 2）或 ≤ 3**，是行业标准（Google 论文建议）。
- 海明距离 = 两指纹异或后统计 1 的个数（popcount）。

### 4.4 分词与加权策略（`1e0ng/simhash` Python 版补充）

```python
def _tokenize(self, content):
    content = content.lower()
    content = ''.join(re.findall(self.reg, content))  # reg 默认 [\w\u4e00-\u9fcc]+
    return self._slide(content)                        # 字符 n-gram 滑动窗口

def _slide(self, content, width=4):
    return [content[i:i+width] for i in range(max(len(content)-width+1, 1))]  # 4-gram
```

- **Python 版默认用字符 4-gram 滑动窗口**（无需分词器），`reg` 过滤非词字符。
- **C++ 版用 jieba 分词 + TF-IDF 权重**（`extractor.Extract`）。
- **加权策略对比**：
  - 字符 n-gram：无需分词器，实现简单，但对中文语义敏感度低。
  - jieba 分词 + TF-IDF：语义更准，但依赖分词器（Node 需 jieba 移植）。

### 4.5 伪代码（Node.js 移植版）

```javascript
// Jenkins/MD5 哈希 → 64 位
function hash64(token) { /* MD5 取前 8 字节 或 Jenkins lookup3 */ }

// SimHash 指纹
function simhash(tokens, weights) {  // tokens: string[], weights: number[]
  const BITS = 64;
  const acc = new Float64Array(BITS);
  for (let i = 0; i < tokens.length; i++) {
    const h = BigInt('0x' + hash64(tokens[i]).slice(0, 16));
    const w = weights ? weights[i] : 1;
    for (let b = 0; b < BITS; b++) {
      acc[b] += ((h >> BigInt(b)) & 1n) ? w : -w;
    }
  }
  let fp = 0n;
  for (let b = 0; b < BITS; b++) if (acc[b] > 0) fp |= (1n << BigInt(b));
  return fp;
}

// 海明距离
function hammingDistance(a, b) {
  let x = a ^ b, cnt = 0;
  while (x) { cnt++; x &= x - 1; }  // popcount
  return cnt;
}

// 判重：hammingDistance(fp1, fp2) <= 2
```

### 4.6 大规模判重：SimhashIndex 分桶（`1e0ng/simhash`）

```python
@property
def offsets(self):
    return [self.f // (self.k + 1) * i for i in range(self.k + 1)]  # 64/(2+1)=21 → [0,21,42]

def get_keys(self, simhash):
    for i, offset in enumerate(self.offsets):
        m = 2 ** (self.f - offset) - 1
        c = simhash.value >> offset & m
        yield '%x:%x' % (c, i)   # 每段 21 位 → 3 个桶键
```

- **原理**：将 64 位指纹按 `f/(k+1)` 位切分成 k+1 段，每段作为桶键。海明距离 ≤ k 的两个指纹**至少有一段完全相同**，只需在相同桶内比较。
- **效果**：避免全量两两比较，O(n) 建索引 + O(桶内) 查询，适合大规模判重。

---

## 5. Node.js 生态成熟方案

### 5.1 `sensitive-words-dfa-filter`（Node，Trie + 变体对抗）

npm：`sensitive-words-dfa-filter`，repo `stultuss/sensitive-words-filter`。**这是 Node 生态中变体对抗最成熟的实现**。

核心特性：
- **Trie 树**（`WordNode { children, isEnd, lenient }`）。
- **跳过字符缓存**（`_isSkipCache`）：预加载符号、CJK 部首、数字、大小写字母、全角字符、空白，匹配时跳过 → 插字对抗。
- **lenient 匹配**（`MAX_LENIENT_SKIP_CHARS = 3`）：英文词内最多跳过 3 个字符（如 `go-vern-ment`）。
- **wordBoundary 选项**：英文词边界校验，避免误伤（如 `ass` 不匹配 `class`）。
- **diff + starAt 数组**：用差分数组高效标记替换区间，避免重复扫描。

```javascript
// 跳过字符判断（核心变体对抗）
_isSkip(char, allowAlphaNumeric) {
  if (!this._isSkipCache.has(char)) return false;
  if (allowAlphaNumeric) return true;
  const code = char.charCodeAt(0);
  const isAlphaNumeric = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  return !isAlphaNumeric;  // 非字母数字的跳过字符才跳过
}
```

**对 v2 的价值**：跳过字符缓存 + lenient 匹配 + 词边界，是 houbb 之外的另一套变体对抗实现，**可直接借鉴合并**。

### 5.2 `simhash-js`（Node，Jenkins + 32 位 SimHash）

npm：`simhash-js`，repo `xblanc33/simhash-js`。

- **Jenkins lookup3 hash**（`Jenkins.js`）：32/64 位。
- **SimHash**（`SimHash.js`）：默认 4-shingle 分词 + 128 特征，生成 **32 位**指纹。
- **Comparator**：海明距离（SWAR popcount）+ Jaccard 相似度。

```javascript
function combineShingles(shingles) {
  shingles.sort(hashComparator);
  if (shingles.length > this.maxFeatures) shingles = shingles.splice(this.maxFeatures);
  var simhash = 0x0, mask = 0x1;
  for (var pos = 0; pos < 32; pos++) {
    var weight = 0;
    for (var i in shingles) weight += (!(~shingle & mask) == 1) ? 1 : -1;
    if (weight > 0) simhash |= mask;
    mask <<= 1;
  }
  return simhash;
}
```

**局限**：32 位指纹精度不足（行业标准是 64 位），且用字符 shingle 而非分词。**建议 v2 参考其 Jenkins hash + 加权求和框架，但升级为 64 位 + 中文分词。**

### 5.3 `gaohuifeng/sensitive-word-filter`（Node，简单 Trie）

npm：`sensitive-word-filter`（70★）。**最简单的 Node DFA 实现**，词库 1W+。

```javascript
function filter(s, cb) {
  var parent = map;
  for (var i = 0; i < s.length; i++) {
    if (s[i] == '*') continue;
    var found = false, skip = 0, sWord = '';
    for (var j = i; j < s.length; j++) {
      if (!parent[s[j]]) { found = false; skip = j - i; parent = map; break; }
      sWord += s[j];
      if (parent[s[j]].isEnd) { found = true; skip = j - i; break; }
      parent = parent[s[j]];
    }
    if (skip > 1) i += skip - 1;
    if (!found) continue;
    var reg = new RegExp(sWord, 'g');
    s = s.replace(reg, '*'.repeat(skip + 1));
  }
  return s;
}
```

**局限**：无变体对抗、无白名单、无热更新、无分类。**价值在于证明 Node 原生 Trie 可行 + 提供 1W+ 词库参考。**

### 5.4 Node 生态对比小结

| 项目 | 算法 | 变体 | 热更新 | 分类 | 成熟度 |
|------|------|------|--------|------|--------|
| sensitive-words-dfa-filter | Trie | ✅ 强（跳过+lenient+边界） | 全量 init | ❌ | 中 |
| simhash-js | 32位 SimHash | — | — | — | 中（精度不足） |
| gaohuifeng/sensitive-word-filter | Trie | ❌ | ❌ | ❌ | 低 |
| houbb/sensitive-word（Java） | DFA | ✅ 强（归一化+忽略+重复） | ✅ 单词增删 | ✅ 5类 | 高 |

---

## 6. 与当前引擎的逐项对比

### 6.1 `packages/rewrite-engine/src/sensitive-filter.js`（v1，任务指定对象）

```javascript
// 内置词库：仅 2 个示例词
const BUILTIN_SENSITIVE_WORDS = ['敏感词示例1', '敏感词示例2']

// 检测：线性 indexOf 遍历
detect(text) {
  for (const word of this._wordList) {
    let idx = text.indexOf(word)   // O(n*m)，词库越大越慢
    while (idx !== -1) { hits.push(...); idx = text.indexOf(word, idx + 1) }
  }
}

// 过滤：正则替换
filter(text) {
  for (const word of this._wordList) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\$&')
    result = result.replace(new RegExp(escaped, 'g'), this._replacement)
  }
}
```

### 6.2 `packages/shared-utils/src/sensitive-filter.js`（已含 DFA 基础版）

**重要**：仓库中已存在一个更成熟的 DFA 实现（`shared-utils`），内置约 30+ 词（政治/色情/违法/诈骗/广告分类），含 `check`/`replace`/`addWords`/`createWithBuiltin`。**但它是「最短匹配 + break」实现，存在缺陷**：

```javascript
if (node._end) {
  foundWords.add(matchedWord)
  foundPositions.push({ word: matchedWord, index: i, length: matchLen })
  break  // ⚠️ 最短匹配即 break，长词会被短词遮蔽
}
```

- **缺陷 1**：`break` 导致**最短匹配**，若词库同时有「法轮」和「法轮功」，只报「法轮」。
- **缺陷 2**：`addWords` 全量重建 DFA（`this._buildDFA()`），无单词增量。
- **缺陷 3**：无变体归一化、无白名单、无忽略字符。

### 6.3 逐项差距对比表

| 能力 | v1 rewrite-engine | shared-utils DFA | houbb | 差距 |
|------|:---:|:---:|:---:|------|
| 匹配算法 | 线性 indexOf | Trie（最短匹配） | DFA（最长匹配） | **需升级为最长匹配 DFA** |
| 词库规模 | 2 示例词 | ~30 词 | 6W+ | **词库严重不足** |
| 词库分层 | ❌ | 注释分类 | 5 类标签 | **需标签体系** |
| 变体对抗 | ❌ | ❌ | 归一化+忽略+重复 | **需归一化层** |
| 白名单 | ❌ | ❌ | ✅ | **需白名单** |
| 热更新 | 全量 updateWordList | 全量重建 | 单词增删 | **需增量增删** |
| 分类返回 | ❌ | ❌ | 标签 | **需标签返回** |
| SimHash | ❌ | ❌ | —（无） | **需新增** |
| 相似度检测 | ❌ | ❌ | —（无） | **需新增** |

---

## 7. 推荐实现方案（优先级排序）

### P0-1：DFA 匹配器移植（最长匹配 + 白名单 + 增量热更新）

- **蓝本**：houbb `WordDataTree` + `WordCheckWord`。
- **要点**：记录 `maxLen`（最长命中）而非 break；双树（allow/deny）；`addWord`/`removeWord` 增量操作；全量重建用新根原子替换。
- **落地**：重写 `packages/rewrite-engine/src/sensitive-filter.js`，或统一收敛到 `shared-utils` 的 DFA 实现并修复最短匹配缺陷。
- **复杂度**：低，200-300 行。

### P0-2：字符归一化 + 忽略字符

- **蓝本**：houbb `IWordFormat` 系列 + `SpecialCharSensitiveWordCharIgnore`。
- **要点**：全角→半角、大小写、繁简、数字形式映射表（`Char2CharMap` → Node `Map`）；忽略符号/空白（仅匹配中跳过）。
- **复杂度**：低-中，映射表是主要工作量。

### P0-3：词库接入 + 运营中心同步

- **蓝本**：houbb 词库文件格式（每行一词）+ 分类标签文件。
- **要点**：内置 6W+ 词库（可复用 houbb/gaohuifeng 词库，注意合规筛选）；运营中心下发增量词；白名单管理。
- **复杂度**：数据工程，非算法。

### P1-1：SimHash 64 位指纹 + 海明距离判重

- **蓝本**：yanyiwu/simhash（64 位）+ 1e0ng/simhash（加权求和）。
- **要点**：64 位指纹；`hammingDistance <= 2` 判重；接入改写引擎输出评估。
- **复杂度**：低，约 150 行。

### P1-2：中文分词接入 SimHash 加权

- **蓝本**：yanyiwu/simhash 的 jieba + TF-IDF。
- **要点**：Node 端选 jieba 移植（如 `nodejieba`）或字符 n-gram 兜底；TF-IDF 权重。
- **复杂度**：中，依赖分词器选型。

### P2-1：谐音/拼音归一化 + 拆分词对抗

- **蓝本**：sensitive-words-dfa-filter 的 lenient 匹配 + houbb 词库预收录。
- **要点**：拼音映射表、谐音映射；lenient 跳过（≤3 字符）；词边界校验。
- **复杂度**：中-高，误判风险需测试覆盖。

### P2-2：SimhashIndex 分桶索引

- **蓝本**：1e0ng/simhash `SimhashIndex`。
- **要点**：64 位按 `f/(k+1)` 切段分桶，桶内比较。
- **复杂度**：中，大规模判重才需要。

---

## 8. Node.js 移植评估

### 8.1 复杂度总评

| 模块 | 蓝本 | 移植复杂度 | 预估行数 | 原生依赖 |
|------|------|:---:|:---:|:---:|
| DFA 匹配器 | houbb | 低 | 200-300 | 无 |
| 字符归一化 | houbb | 低-中 | 150-250 | 无 |
| 变体对抗 | sensitive-words-dfa-filter | 中 | 150-250 | 无 |
| SimHash | yanyiwu/1e0ng | 低 | 100-150 | 无 |
| 中文分词 | jieba 系 | 中 | 依赖选型 | nodejieba（原生）或纯 JS |
| SimhashIndex | 1e0ng | 中 | 100-150 | 无 |

### 8.2 关键移植点

1. **HashMap → 普通对象/Map**：houbb 用 `HashMap<Character, Node>`，Node 用 `{}` 或 `Map` 直接对应。注意 `Map` 对任意 key（含 `_end` 等特殊字符）更安全。
2. **`synchronized` → 单线程**：Node 单线程天然安全，但需注意**事件循环内同步构建**，避免异步插入导致半构建态被读到。
3. **`char` 处理**：JS 的 `charCodeAt`/`codePointAt` 需处理**代理对**（emoji/生僻字），houbb 的 `char` 是 UTF-16 code unit，JS 需用 `codePointAt` + 遍历 `for...of` 保持一致。
4. **64 位整数**：JS `Number` 精度不足，SimHash 指纹需用 **BigInt** 或拆两个 32 位。
5. **正则替换 → 差分数组**：v1 用正则逐个替换，sensitive-words-dfa-filter 用 `diff + starAt` 差分数组一次标记，**性能更优且避免重叠替换问题**，建议采用。

### 8.3 风险与建议

- **词库合规**：houbb/gaohuifeng 词库含大量政治/色情词，直接引入需**合规筛选与分级**，建议运营中心管理。
- **误判控制**：变体对抗（尤其 lenient 匹配）有误判风险，需**词边界 + 白名单 + 测试覆盖**。
- **统一收敛**：当前 `rewrite-engine` 和 `shared-utils` 各有一个 sensitive-filter，**建议收敛为单一实现**（修复 shared-utils 的最短匹配缺陷），避免双实现漂移。

---

## 9. 落地路线图

```
P0（敏感词检测基础）
  ├─ DFA 最长匹配 + 白名单 + 增量热更新
  ├─ 字符归一化（全角半角/大小写/繁简）+ 忽略字符
  └─ 词库接入 + 分类标签 + 运营中心同步
P1（改写质量评估）
  ├─ SimHash 64 位指纹 + 海明距离判重
  └─ 中文分词（jieba 系）+ TF-IDF 加权
P2（进阶对抗）
  ├─ 谐音/拼音归一化 + 拆分词 lenient 对抗
  └─ SimhashIndex 分桶索引（大规模判重）
```

**核心结论**：DFA 与 SimHash 都是**成熟、可移植、纯 JS 可落地**的算法，Node.js 生态已有可借鉴实现。rewrite-engine v2 的敏感词检测应**以 houbb 算法为蓝本重写 DFA（修复 shared-utils 最短匹配缺陷）**，改写质量评估**以 yanyiwu/1e0ng 为蓝本实现 64 位 SimHash + 海明距离判重**。词库与变体对抗是主要工作量，算法本身移植成本低。
