/**
 * 请求层（唯一出口）
 * ---------------------------------------------------------------------------
 * 所有网络请求都必须经过 http()，它统一负责四件事：
 *   1. 拼 query —— 中文参数必须过 URLSearchParams，否则后端会直接失败；
 *   2. 带 token —— 从 localStorage 读，401 时自动清除（登录过期不用页面判断）；
 *   3. 归一化错误 —— 后端约定 detail 永远是字符串，直接拿来当 err.message 展示；
 *   4. 交给 mock 中转 —— 离线/纯前端演示时由 mock 提供数据（见 mock.js）。
 *
 * 页面里【不要】自己写 fetch。
 */

import { mockFetch } from './mock.js'

/** localStorage 里存 token 的键。 */
export const TOKEN_KEY = 'sportsbuddy.token'

/**
 * 后端地址解析顺序：
 *   1. 构建时注入的 window.__SPORTSBUDDY_CONFIG__.apiBaseUrl
 *   2. 当前站点同源（配合反向代理）
 *   3. 本地后端
 */
function resolveBaseUrl() {
  const injected = typeof window !== 'undefined' ? window.__SPORTSBUDDY_CONFIG__?.apiBaseUrl : null
  if (injected) return String(injected).replace(/\/+$/, '')
  return 'http://127.0.0.1:8000'
}

export const BASE_URL = resolveBaseUrl()

/** 是否使用内置离线数据。默认开，保证"打开就能看"。 */
export const USE_MOCK =
  (typeof window !== 'undefined' ? window.__SPORTSBUDDY_CONFIG__?.useMock : null) ?? true

/* ---------------- token ---------------- */

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* 隐私模式下写不了，忽略 */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* 同上 */
    }
  },
  has() {
    return Boolean(this.get())
  },
}

/* ---------------- 错误 ---------------- */

/**
 * 统一错误类型。err.message 就是后端返回的中文提示，可以直接显示给用户。
 */
export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
  /** 登录态问题（需要回登录页）。 */
  get isAuthError() {
    return this.status === 401
  }
  /** 权限/规则不通过（信用分不足、签到码错、超范围）。 */
  get isForbidden() {
    return this.status === 403
  }
  /** 冲突（重复报名、已满员、已开始）。 */
  get isConflict() {
    return this.status === 409
  }
}

/* ---------------- 请求 ---------------- */

function buildUrl(path, query) {
  let url = `${BASE_URL}${path}`
  if (query && typeof query === 'object') {
    const usable = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
    )
    const qs = new URLSearchParams(usable).toString()
    if (qs) url += `?${qs}`
  }
  return url
}

/**
 * 底层请求。
 * @param {string} path 形如 '/activities/1'
 * @param {{method?:string, body?:any, query?:object, auth?:boolean}} options
 */
export async function http(path, { method = 'GET', body, query, auth = true } = {}) {
  const url = buildUrl(path, query)
  const headers = { 'Content-Type': 'application/json' }
  const token = tokenStore.get()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  const init = {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }

  let res
  if (USE_MOCK) {
    res = await mockFetch(url, init)
  } else {
    try {
      res = await fetch(url, init)
    } catch (networkError) {
      // 网络层失败：后端没起来、断网、或云上免费实例正在冷启动
      throw new ApiError(
        '连接不上服务器：后端可能没启动，或云实例正在唤醒（首次约 30~60 秒），请稍后重试。',
        0,
        networkError
      )
    }
  }

  if (res.status === 204) return null

  const text = await res.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!res.ok) {
    const detail =
      payload && typeof payload === 'object' && typeof payload.detail === 'string'
        ? payload.detail
        : `请求失败（HTTP ${res.status}）`
    if (res.status === 401) tokenStore.clear()
    throw new ApiError(detail, res.status, payload)
  }

  return payload
}
