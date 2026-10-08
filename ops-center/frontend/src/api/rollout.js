// @ts-check
/**
 * rollout.js — 配置生效看板 API（只读）
 *
 * 端点：GET /api/v1/runtime/rollout（require_admin，Cookie 会话鉴权）
 * 契约真源：ops-center/backend/services/resilience_service.py rollout_summary()
 *
 * version 传 undefined/null 时不下发该参数 → 后端自动取最新配置版本。
 */
import { createApiClient } from './http'

const api = createApiClient()

/**
 * @param {{ version?: number|null }} [params]
 * @returns {Promise<{version: number, total: number, acked: number, stale: number,
 *   degraded: number, ack_rate: number, block_rates: Record<string, number>,
 *   clients: Array<object>}>}
 */
export async function fetchRollout(params = {}) {
  const version = params.version
  const query = (typeof version === 'number' && Number.isFinite(version)) ? { version } : undefined
  const resp = await api.get('/runtime/rollout', { params: query })
  return resp.data
}
