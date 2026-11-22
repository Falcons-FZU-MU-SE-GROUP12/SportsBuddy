/**
 * 评价数据补全（mock 与真实后端的差异修补）
 * ---------------------------------------------------------------------------
 * mock 数据里每条评价都带 reviewer: { id, nickname }，
 * 而真实后端 GET /users/{id}/reviews 返回的 ReviewOut 只有 reviewer_id，
 * 没有嵌套的用户对象。个人主页要显示"谁给的评价"，所以这里按 reviewer_id
 * 批量补一次 GET /users/{id}。
 *
 * 约定：
 * - 已经带 reviewer 的数据（mock）原样返回，不发请求；
 * - 同一用户在一次会话里只查一次，评价列表里出现多次也只请求一次；
 * - 补不到就降级为 null，由页面显示"匿名同学"，不能让整页加载失败。
 */

import { api } from './index.js'

/** reviewer_id -> 用户资料（或 null 表示补不到） */
const cache = new Map()

export async function withReviewers(reviews) {
  const list = Array.isArray(reviews) ? reviews : []
  const missing = [
    ...new Set(
      list
        .filter((r) => r && !r.reviewer && r.reviewer_id != null)
        .map((r) => r.reviewer_id)
    ),
  ].filter((id) => !cache.has(id))

  await Promise.all(
    missing.map(async (id) => {
      try {
        cache.set(id, await api.getUser(id))
      } catch {
        cache.set(id, null)
      }
    })
  )

  return list.map((r) =>
    r && !r.reviewer && r.reviewer_id != null ? { ...r, reviewer: cache.get(r.reviewer_id) ?? null } : r
  )
}

/** 退出登录/切换账号时清掉缓存，避免串号。 */
export function clearReviewerCache() {
  cache.clear()
}
