import os
os.chdir(r"D:\Data\projects\Multi-Publish")

content = open("PRD.md", "r", encoding="utf-8").read()

# 1. Update header date
content = content.replace("最后更新: 2026-06-27", "最后更新: 2026-07-05")
content = content.replace("当前版本: v1.3.0（Instagram + Facebook 海外平台扩展）", "当前版本: v1.4.0（代码质量基建：ESLint/Prettier）")

# 2. Add ESLint to non-functional requirements
content = content.replace(
    "|| 跨平台 | Windows + Linux（macOS 待支持） | ✅ |\n|| 自动构建",
    "|| 跨平台 | Windows + Linux（macOS 待支持） | ✅ |\n|| 代码规范 | ESLint v9 flat config + Prettier，0 errors / 0 warnings | ✅ Phase C3 |\n|| 自动构建"
)

# 3. Add ESLint to CI/CD
content = content.replace(
    "| 自动更新 | electron-updater + GitHub Release | ✅（待首次 Release） |",
    "| ESLint 检查 | GitHub Actions quality-gate PR 门禁，ESLint 0 errors | ✅ Phase C3 |\n| 自动更新 | electron-updater + GitHub Release | ✅（待首次 Release） |"
)

# 4. Add Phase C to Roadmap
content = content.replace(
    "| **V1.0 发布** | 首版 Release、运营启动 | ⏳ 待进行 |\n| V1.1 格式适配",
    "| **Phase C（代码质量）** | ESLint v9 flat config + Prettier，201 个问题修复 | ✅ Phase C3 |\n| **V1.0 发布** | 首版 Release、运营启动 | ⏳ 待进行 |\n| V1.1 格式适配"
)

open("PRD.md", "w", encoding="utf-8").write(content)
print("PRD.md done")

# 5. Update CHANGELOG
cl = open("CHANGELOG.md", "r", encoding="utf-8").read()
entry = "## [v1.4.0] - 2026-07-05\n\n### Added\n\n- ESLint v9 flat config（eslint.config.mjs）\n- Prettier 代码格式化配置\n- shared-utils 类型声明补充\n\n### Fixed\n\n- 修复 201 个 ESLint 问题（0 errors / 0 warnings）\n- rpa-view-manager.js 重复声明和编码清理\n- store.js 注释吞并代码行 bug 修复\n- 各文件未使用变量移除或 eslint-disable 标注\n\n---\n\n"
if entry not in cl:
    cl = cl.replace("## [v1.0.2]", entry + "## [v1.0.2]")
    open("CHANGELOG.md", "w", encoding="utf-8").write(cl)
    print("CHANGELOG.md done")
else:
    print("CHANGELOG.md already has v1.4.0")
