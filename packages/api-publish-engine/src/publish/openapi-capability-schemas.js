'use strict'
/**
 * OpenAPI 的能力面响应 schema（components.schemas）
 *
 * 为什么单独成文件：publish-api-server.js 已是 1500+ 行的巨型 _handle if 链，
 * 把 7 个 schema 定义塞进去会顶破逐文件行数门禁（该文件登记 1356 行、
 * 增长额度 200，上限 1556）。抽出后主机身回到额度内。
 *
 * 字段按各能力方法**实际返回**声明（见 src/publish/capabilities/*-capabilities.js），
 * 不是理想化的设计——此前响应只写「能力查询结果」，而实现一律附带 raw，属契约漂移。
 */

/** 平台原始返回：原样透传，供调用方做本模块未归一化的解析。 */
const PlatformRaw = {
  type: "object",
  additionalProperties: true,
  description: "平台接口的完整原始返回（原样透传，形状由平台决定，不保证稳定）",
};

const CapabilityBase = {
  type: "object",
  properties: {
    platform: { type: "string" },
    raw: { $ref: "#/components/schemas/PlatformRaw" },
  },
};

const UserInfoResult = {
  allOf: [
    { $ref: "#/components/schemas/CapabilityBase" },
    {
      type: "object",
      properties: {
        uid: { type: "string" },
        nickname: { type: "string" },
        avatar: { type: "string" },
        fans: { type: "number" },
      },
    },
  ],
};

const PermissionResult = {
  allOf: [
    { $ref: "#/components/schemas/CapabilityBase" },
    {
      type: "object",
      properties: {
        allowed: {
          type: "boolean",
          description: "是否允许发布。仅 status_code===0 等明确肯定分支为 true，其余一律 false（fail-closed）",
        },
        risk_blocked: { type: "boolean", description: "是否平台风控/验证拦截（不自动换号）" },
        unrecognized: { type: "boolean", description: "响应无法识别时为 true（仅抖音）；用于区分「平台明说不行」与「读不懂」" },
        reason: { type: "string" },
      },
    },
  ],
};

const ListItem = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    raw: { $ref: "#/components/schemas/PlatformRaw" },
  },
  additionalProperties: true,
};

const ListResult = {
  allOf: [
    { $ref: "#/components/schemas/CapabilityBase" },
    { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/ListItem" } } } },
  ],
};

const CapabilityResult = {
  description: "按 capability 择一：user-info → UserInfoResult，permission-check → PermissionResult，poi / drafts → ListResult",
  oneOf: [
    { $ref: "#/components/schemas/UserInfoResult" },
    { $ref: "#/components/schemas/PermissionResult" },
    { $ref: "#/components/schemas/ListResult" },
  ],
};

const CAPABILITY_SCHEMAS = {
  PlatformRaw,
  CapabilityBase,
  UserInfoResult,
  PermissionResult,
  ListItem,
  ListResult,
  CapabilityResult,
};

module.exports = { CAPABILITY_SCHEMAS };