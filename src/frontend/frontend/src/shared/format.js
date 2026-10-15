/**
 * 通用工具：时区处理 / 格式化 / 文本与 DOM 辅助
 * ---------------------------------------------------------------------------
 * 这里最要紧的是【时区】。后端所有时间都是"不带时区偏移的 ISO 串，代表 UTC"：
 *     "2026-10-12T06:14:07.169800"   实际是北京时间 14:14
 * 直接 new Date(iso) 会被浏览器当成本地时间，在中国会少显示 8 小时。
 * 所以本项目【只允许】通过本文件的 parseServerTime / fmtDateTime 处理时间。
 */

/* ============================ 1. 时区 ============================ */

/**
 * 把后端时间串解析成正确的 Date。
 * @param {string} iso 形如 "2026-10-12T06:14:07.169800"，也可能已经带 Z 或 +08:00
 * @returns {Date|null}
 */
export function parseServerTime(iso) {
  if (!iso) return null
  const s = String(iso).trim()
  if (!s) return null
  // 已经带时区信息（Z 或 ±HH:MM）就直接用；否则补 Z 表示 UTC。
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)
  const d = new Date(hasZone ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 本地时区偏移文本，例如 "GMT+8" —— 用于在界面上消除歧义。 */
export function localZoneLabel() {
  const off = -new Date().getTimezoneOffset() / 60
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return `GMT${sign}${Number.isInteger(abs) ? abs : abs.toFixed(1)}`
}

const pad = (n) => String(n).padStart(2, '0')
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** "10-12 周一 14:14" —— 列表里最常用的紧凑格式（本地时间）。 */
export function fmtShort(iso) {
  const d = parseServerTime(iso)
  if (!d) return '—'
  return `${d.getMonth() + 1}-${d.getDate()} ${WD[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "2026-10-12 14:14" —— 详情页用的完整格式（本地时间）。 */
export function fmtDateTime(iso) {
  const d = parseServerTime(iso)
  if (!d) return '—'
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/** 只要时间部分 "14:14"。 */
export function fmtClock(iso) {
  const d = parseServerTime(iso)
  if (!d) return '—'
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "14:14 - 16:14" 的时间段。 */
export function fmtRange(startIso, endIso) {
  const a = parseServerTime(startIso)
  const b = parseServerTime(endIso)
  if (!a || !b) return '—'
  const sameDay = a.toDateString() === b.toDateString()
  return sameDay
    ? `${fmtShort(startIso)} - ${fmtClock(endIso)}`
    : `${fmtShort(startIso)} - ${fmtShort(endIso)}`
}

/** 相对时间："3 小时后 / 昨天 / 12 分钟前"。 */
export function fmtRelative(iso, now = Date.now()) {
  const d = parseServerTime(iso)
  if (!d) return '—'
  const diff = d.getTime() - now
  const abs = Math.abs(diff)
  const min = Math.round(abs / 60000)
  const hour = Math.round(abs / 3600000)
  const day = Math.round(abs / 86400000)
  if (min < 1) return '刚刚'
  if (min < 60) return diff > 0 ? `${min} 分钟后` : `${min} 分钟前`
  if (hour < 24) return diff > 0 ? `${hour} 小时后` : `${hour} 小时前`
  if (day <= 7) return diff > 0 ? `${day} 天后` : `${day} 天前`
  return fmtShort(iso)
}

/**
 * 把用户在 <input type="datetime-local"> 里选的【本地时间】转成后端要的 UTC 串。
 * @param {string} localValue 形如 "2026-10-12T14:00"
 */
export function localInputToUtc(localValue) {
  if (!localValue) return null
  const d = new Date(localValue)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** 判断活动是否已经开始（用于"不能报名/已结束"等界面状态）。 */
export function hasStarted(startIso, now = Date.now()) {
  const d = parseServerTime(startIso)
  return d ? d.getTime() <= now : false
}

/** 距离开始不足 2 小时 —— 此时取消报名会扣信用分（后端 is_late_cancel）。 */
export function isLateCancelWindow(startIso, now = Date.now()) {
  const d = parseServerTime(startIso)
  if (!d) return false
  const diff = d.getTime() - now
  return diff > 0 && diff < 2 * 3600 * 1000
}

/* ============================ 2. 数值与文本 ============================ */

/** 费用：后端单位是"分"。 */
export function feeText(fen) {
  const n = Number(fen) || 0
  if (n <= 0) return '免费'
  return `¥${(n / 100).toFixed(n % 100 === 0 ? 0 : 2)}/人`
}

/** 元 → 分（提交表单时用）。 */
export function yuanToFen(yuan) {
  return Math.round((Number(yuan) || 0) * 100)
}

/** 1124 → "1,124" */
export function num(n) {
  return Number(n || 0).toLocaleString('zh-CN')
}

/** 截断长文本 */
export function clip(text, len = 60) {
  const s = String(text ?? '')
  return s.length > len ? `${s.slice(0, len - 1)}…` : s
}

/** 取昵称首字，做头像占位。 */
export function initial(name) {
  const s = String(name ?? '').trim()
  return s ? s[0].toUpperCase() : '?'
}

/** 简单防抖，避免输入框每次按键都重渲染。 */
export function debounce(fn, wait = 220) {
  let t = null
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}

/* ============================ 3. DOM 辅助 ============================ */

/**
 * 拼 HTML 时对用户内容做转义，防止昵称/说明里的尖括号把页面搞坏。
 */
export function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

/** 只保留白名单协议，挡住 javascript: 之类的伪链接。 */
export function safeUrl(url) {
  const s = String(url ?? '').trim()
  return /^(https?:\/\/|\/)/i.test(s) ? s : '#'
}

let seq = 0
/** 生成稳定唯一 id（用于 label/for、aria 关联）。 */
export function uid(prefix = 'id') {
  seq += 1
  return `${prefix}-${seq}`
}
