/**
 * 接口清单（19 个，与《前端对接文档》第七节一一对应）
 * ---------------------------------------------------------------------------
 * 页面只调用这里的方法，不直接碰 http()。这样接口一旦变化，只需要改这一个文件。
 * 每个方法都标注了：需要登录吗 / 对应后端路径 / 有什么坑。
 */

import { http, tokenStore } from './http.js'

export { ApiError, tokenStore, BASE_URL, USE_MOCK } from './http.js'

export const api = {
  /* ==================== 一、认证（4 个） ==================== */

  /**
   * 注册。POST /auth/register —— 不需要登录，成功后 token 自动保存。
   * 字段约束（前端要先校验，否则会收到 422）：
   *   username 3~32 位，只允许字母/数字/下划线；password 6~64 位；nickname 1~32 位。
   */
  register(payload) {
    const { username, password, nickname, campus, skill_level, favorite_sports, phone } = payload
    return http('/auth/register', {
      method: 'POST',
      auth: false,
      body: { username, password, nickname, campus, skill_level, favorite_sports, phone },
    })
  },

  /** 登录。POST /auth/login —— token 有效期 30 天，401 表示过期。 */
  login(username, password) {
    return http('/auth/login', { method: 'POST', auth: false, body: { username, password } })
  },

  /**
   * 退出登录。POST /auth/logout —— 204 无响应体，服务端吊销 token。
   * 无论服务端吊销成功与否，本地 token 都必须清掉（否则界面会卡在"已登录"）。
   */
  async logout() {
    try {
      await http('/auth/logout', { method: 'POST' })
    } finally {
      tokenStore.clear()
    }
  },

  /** 我的资料。GET /me —— 含 reliability_score（信用分）与评价汇总。 */
  getMe() {
    return http('/me')
  },

  /** 修改资料。PATCH /me —— 只传要改的字段。 */
  updateMe(patch) {
    return http('/me', { method: 'PATCH', body: patch })
  },

  /* ==================== 二、基础数据（2 个） ==================== */

  /** 运动项目字典。GET /sports —— 下拉框数据源，返回 [{id,name,icon,default_capacity}]。 */
  getSports() {
    return http('/sports', { auth: false })
  },

  /** 健康检查。GET /health —— 可用于预热云上实例，避免首屏卡 30~60 秒。 */
  getHealth() {
    return http('/health', { auth: false })
  },

  /* ==================== 三、用户（2 个） ==================== */

  /** 他人公开资料。GET /users/{id} —— 允许匿名。 */
  getUser(userId) {
    return http(`/users/${userId}`, { auth: false })
  },

  /** 某人收到的评价。GET /users/{id}/reviews */
  getUserReviews(userId) {
    return http(`/users/${userId}/reviews`, { auth: false })
  },

  /* ==================== 四、活动（4 个） ==================== */

  /**
   * 发起活动。POST /activities
   * ⚠️ 坑：返回的是精简模型，**不含 checkin_code**。要显示签到码必须再调 getActivity(id)。
   */
  createActivity(payload) {
    return http('/activities', { method: 'POST', body: payload })
  },

  /**
   * 活动列表。GET /activities
   * @param {object} filters { sport, campus, skill_level, status, date_from, date_to,
   *                           only_available, limit, offset }
   * 允许匿名；中文参数由 http() 里的 URLSearchParams 自动编码。
   */
  getActivities(filters = {}) {
    return http('/activities', { query: filters, auth: false })
  },

  /** 我发起的 / 我报名的。GET /activities/mine → { organized: [], joined: [] } */
  getMyActivities() {
    return http('/activities/mine')
  },

  /**
   * 活动详情。GET /activities/{id}
   * @param {boolean} withAuth 带 token 且当前用户是发起人时，返回里才有 checkin_code。
   *   判断"是否显示签到码"用 detail.checkin_code != null，不要比较 organizer.id。
   */
  getActivity(id, withAuth = true) {
    return http(`/activities/${id}`, { auth: withAuth })
  },

  /** 修改活动。PATCH /activities/{id} —— 仅发起人。 */
  updateActivity(id, patch) {
    return http(`/activities/${id}`, { method: 'PATCH', body: patch })
  },

  /** 取消活动。POST /activities/{id}/cancel —— 仅发起人，报名者会被置为 cancelled。 */
  cancelActivity(id) {
    return http(`/activities/${id}/cancel`, { method: 'POST' })
  },

  /* ==================== 五、报名（2 个） ==================== */

  /**
   * 报名。POST /activities/{id}/join
   * 可能的状态码：403 信用分低于 60 / 409 已报名或已满员 / 400 已开始或已取消。
   */
  joinActivity(id, note = '') {
    return http(`/activities/${id}/join`, { method: 'POST', body: { note } })
  },

  /**
   * 取消报名。DELETE /activities/{id}/join
   * ⚠️ 返回里 is_late_cancel === true 表示"开始前 2 小时内取消"，会扣 5 分信用分，
   *    界面应在此之前给出二次确认。
   */
  leaveActivity(id) {
    return http(`/activities/${id}/join`, { method: 'DELETE' })
  },

  /* ==================== 六、签到（1 个路径，两种方式） ==================== */

  /** 用 4 位签到码签到。POST /activities/{id}/checkin —— 码错返回 403。 */
  checkinWithCode(id, code) {
    return http(`/activities/${id}/checkin`, { method: 'POST', body: { code: String(code).trim() } })
  },

  /**
   * 用定位签到。POST /activities/{id}/checkin —— 超出 300 米返回 403。
   * 前提：必须 HTTPS 或 localhost，否则浏览器直接拒绝定位。
   */
  checkinWithLocation(id, latitude, longitude) {
    return http(`/activities/${id}/checkin`, { method: 'POST', body: { latitude, longitude } })
  },

  /* ==================== 七、考勤（1 个） ==================== */

  /**
   * 记录考勤。POST /activities/{id}/attendance —— 仅发起人。
   * 传【到场者】的 user_id 数组，其余报名者自动记为爽约并扣分。
   * 返回 score_changes = { "用户id": 分数变化 }。
   */
  recordAttendance(id, attendedUserIds) {
    return http(`/activities/${id}/attendance`, { method: 'POST', body: attendedUserIds })
  },

  /* ==================== 八、评价（1 个） ==================== */

  /** 评价同场伙伴。POST /activities/{id}/reviews —— 仅"已确认到场"者可评。 */
  createReview(activityId, { reviewee_id, score, tags = [], comment = '' }) {
    return http(`/activities/${activityId}/reviews`, {
      method: 'POST',
      body: { reviewee_id, score, tags, comment },
    })
  },

  /* ==================== 九、匹配（2 个） ==================== */

  /**
   * 结构化匹配。GET /match
   * @param {object} query { sport, campus, skill_level, available_from, available_to,
   *                         latitude, longitude, max_distance_km, limit }
   * 返回 { query, count, items: [{ activity, score, reason }] }
   * reason 直接可渲染"为什么推荐给你"的标签。
   */
  match(query = {}) {
    return http('/match', { query })
  },

  /** 一句话找局。GET /match/parse?q=... */
  matchBySentence(q, limit = 10) {
    return http('/match/parse', { query: { q, limit } })
  },
}

/* ---------------- 附：浏览器定位封装 ---------------- */

/**
 * 取当前坐标，失败时抛出可读中文错误（供定位签到使用）。
 * 注意：非 HTTPS 且非 localhost 时浏览器会直接拒绝。
 */
export function getCurrentPosition({ timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('你的浏览器不支持定位，请改用签到码签到。'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        const map = {
          1: '定位权限被拒绝。请在浏览器地址栏左侧允许定位，或改用签到码签到。',
          2: '暂时拿不到定位（信号弱）。请改用签到码签到。',
          3: '定位超时。请改用签到码签到。',
        }
        reject(new Error(map[err.code] ?? '定位失败，请改用签到码签到。'))
      },
      { timeout, enableHighAccuracy: true }
    )
  })
}

export default api
