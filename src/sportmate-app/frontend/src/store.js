/**
 * 全局状态仓库
 * ---------------------------------------------------------------------------
 * 刻意做成"纯数据 + 纯函数"，不引用 document：
 *   · 浏览器里由 app.js 渲染；
 *   · 原型生成脚本 / Node 环境下也能直接 import 拿数据渲染静态页。
 * 只放跨页面共享的状态（登录态、字典、路由）；页面内的临时状态放页面自己身上。
 */

import { api, tokenStore } from './api/index.js'

export const store = {
  /** 当前用户（未登录为 null） */
  me: null,
  /** 运动项目字典 */
  sports: [],
  /** 路由：{ name, params } */
  route: { name: 'discover', params: {} },
  /** 顶部反馈条 */
  flash: null, // { type: 'ok'|'error'|'info'|'warn', text: string }
  /** 一次性 toast（自动消失） */
  toast: null,
  /** 是否已经从云端拿到过 /health（用于"正在唤醒服务器"提示） */
  serverAwake: false,
  /** 演示模式：是否使用离线数据 */
  mock: true,
}

/** 用给定数据登录（原型/测试里也用它伪造登录态）。 */
export function setSession(user) {
  store.me = user
}

export function clearSession() {
  store.me = null
}

/** 从本地 token 恢复登录态。返回是否成功。 */
export async function restoreSession() {
  if (!tokenStore.has()) return false
  try {
    store.me = await api.getMe()
    return true
  } catch {
    tokenStore.clear()
    store.me = null
    return false
  }
}

/** 拉取运动字典（只需一次）。 */
export async function loadSports() {
  if (store.sports.length) return store.sports
  try {
    store.sports = await api.getSports()
  } catch {
    store.sports = []
  }
  return store.sports
}

export const sportIconOf = (name) =>
  store.sports.find((s) => s.name === name)?.icon ?? '🤸'

export function flash(type, text) {
  store.flash = text ? { type, text } : null
}

export function clearFlash() {
  store.flash = null
}

/* ---------------- 路由表 ---------------- */

/** 底部标签栏对应的 4 个主页面。 */
export const TABS = [
  { name: 'discover', label: '找局', icon: '🔍' },
  { name: 'activities', label: '活动', icon: '📋' },
  { name: 'manage', label: '我的局', icon: '🎯' },
  { name: 'me', label: '我的', icon: '👤' },
]

/** 所有路由。auth: true 表示需要登录。 */
export const ROUTES = {
  discover: { title: '找局', auth: false, tab: 'discover' },
  activities: { title: '活动列表', auth: false, tab: 'activities' },
  activity: { title: '活动详情', auth: false, back: true },
  'activity-new': { title: '发起活动', auth: true, back: true },
  "activity-manage": { title: '管理活动', auth: true, back: true },
  checkin: { title: '签到', auth: true, back: true },
  review: { title: '评价同场伙伴', auth: true, back: true },
  user: { title: '个人主页', auth: false, back: true },
  manage: { title: '我的局', auth: true, tab: 'manage' },
  me: { title: '我的', auth: false, tab: 'me' },
  login: { title: '登录 / 注册', auth: false, bare: true },
}

/** 解析 hash（如 "#/activity/101"）为 { name, params }。 */
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '')
  if (!raw) return { name: 'discover', params: {} }
  const [name, ...rest] = raw.split('/')
  if (!ROUTES[name]) return { name: 'discover', params: {} }
  const params = {}
  if (rest[0]) {
    if (name === 'user') params.id = rest[0]
    else if (name === 'review') params.id = rest[1] ?? rest[0]
    else params.id = rest[0]
  }
  return { name, params }
}

/** 生成 hash 地址。 */
export function href(name, params = {}) {
  if (name === 'review') return `#/review/${params.activityId}/${params.userId ?? ''}`
  return params.id != null ? `#/${name}/${params.id}` : `#/${name}`
}
