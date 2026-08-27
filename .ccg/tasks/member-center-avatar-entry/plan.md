# 实施计划（M1-M4）

## M1 基础组件与 composable
- composables/useDropdownBehavior.js + test（外点/Esc 关闭、上下键、Tab）
- components/ProfileMenu.vue + test（头像触发器：未登录直登/已登录菜单/disabled）

## M2 会员中心页面
- views/MemberCenter.vue + test（空态/账号/版本/权益/配额/升级/Pro 标记/disabled）
- router/index.js 注册 /member-center

## M3 入口接线与数据透传
- layouts/YixiaoerSidebar.vue：头像区换 ProfileMenu + 更多菜单加会员中心项
- components/IdentityMenu.vue：已登录菜单加会员中心项 + goMemberCenter
- stores/identity.js：entitlement.quota 透传（normalizeState）
- locales zh/en：memberCenter.* 54 键成对

## M4 门禁与文档
- tests/visual-testing/views/all-views.visual.test.js 注册 /member-center 单视图门禁
- locale CJK 基线吸收行号漂移
- PRD v2.3.60 §2.3.3、CHANGELOG、learnings、quality-gates、review.md
