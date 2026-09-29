# 依赖漏洞公告响应 SOP（2026-09-28 undici / fast-uri 实录）

> 本文记录「新公告发布 → 依赖审计门禁全量变红」时的定位与修复路径，以及一个
> 本机复现时必须先知道的门禁缺陷。触发背景：2026-09-28 两条新公告发布后，
> 当天 4 条 open PR 的 `依赖漏洞审计` 全部变红。

## 1. 本次公告与判据

| GHSA | 包 | 严重度 | 修复版 | 引入链 |
| --- | --- | --- | --- | --- |
| GHSA-3wwx-pv8p-q78v | undici | moderate | >=7.29.1 | cheerio / jsdom |
| GHSA-qw65-cvwx-89v3 | fast-uri | high | >=3.1.7 | ajv（remotion-composer 经 `@remotion/bundler>webpack>terser-webpack-plugin>schema-utils>ajv-keywords>ajv`） |

两条都是**传递依赖**，且依赖方声明的范围（`^7.19.0` / `^3.0.1`）本身就覆盖修复版，
所以修复动作只改锁文件解析，不动任何 workspace 的 `dependencies`。

判据（升级前后各跑一次，看 GHSA id 是否归零）：

```bash
HTTPS_PROXY=http://127.0.0.1:7897 \
  pnpm audit --prod --json --registry=https://registry.npmjs.org \
  | grep -o 'GHSA-3wwx-pv8p-q78v\|GHSA-qw65-cvwx-89v3' | sort | uniq -c
```

必须显式 `--registry=https://registry.npmjs.org`：本机 pnpm 配置走
`registry.npmmirror.com`，该镜像**没有 audit 端点**，不加会直接报
`ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`。

## 2. pnpm 11：overrides 的唯一读取位置是 `pnpm-workspace.yaml`

实测把 `pnpm.overrides` 写进根 `package.json` 后，`pnpm install` 明确告警并**忽略**它：

```
[WARN] The "pnpm" field in package.json is no longer read by pnpm.
       The following keys were ignored: "pnpm.overrides".
```

因此安全下限写在 `pnpm-workspace.yaml`：

```yaml
overrides:
  undici: '>=7.29.1'
  fast-uri: '>=3.1.7'
```

写在这里而不是只改一次 `pnpm update`，是因为后者对本仓的 14 个 workspace **收敛不完全**：
`pnpm update fast-uri` 只把 `ajv@8.18.0` 那条链提到 3.1.8，`ajv@8.20.0` 的 snapshot
仍停在 3.1.3，审计照红。`overrides` 声明的是下限，后续 `pnpm install` 不会把它漂回去。

## 3. ⚠️ 本机跑 `scripts/check-dep-audit.js` 会得到假绿

`check-dep-audit.js` 在 `main()` 里对两个扫描器（npm / pip）做**联合可用性判定**：
只要任一个不可用，就打印 `SCANNER_UNAVAILABLE` 并 `return 0`，**另一个扫描器的结果
也不再评估**（见 `scripts/check-dep-audit.js` 的 `if (unavailable.length && !isUpdate)` 分支）。

本机通常没有 `pip-audit`，于是「本地跑过依赖审计门禁 ✅」这句话对 npm 侧完全无意义——
它连 `pnpm audit` 都没有判读。本仓 CI 有 `pip-audit`，所以 CI 的结论仍然可信。

- 现在起：验证依赖修复一律用第 1 节的 `pnpm audit --prod --json` 原始命令，不要以
  `node scripts/check-dep-audit.js` 的本机退出码为证据。
- 待修（另开 PR）：两个扫描域各自独立评估——缺失的那个不判、存在的那个照常判违规，
  而不是整体短路。

## 4. 响应顺序

1. 先确认红因是**新公告**而非基线漂移：`gh run view <id> --log-failed -R Colinchiu007/mulpub`
   里找 `NEW_ADVISORY:` 行（它会直接给出修复版本与 `roots`）。
2. 查依赖方声明范围是否覆盖修复版（`npm view <pkg>@<ver> dependencies --json`）。
   覆盖 → 只提锁文件/加 overrides；不覆盖 → 属真正的升级决策，须单独评估兼容性。
3. 有修复版可用时**优先升级**，不登记豁免。`scripts/dep-audit-baseline.json` 里
   `decision: no-fix-available` 只用于「上游确实没有修复版」的情形，且必须写 `note`
   说明该包是否真的在被调用（参照 `ecdsa` 那条的写法）。
4. 用第 1 节命令做前后对照，把两组数字写进 PR 描述。
