/**
 * 可复用界面片段
 * ---------------------------------------------------------------------------
 * 每个函数只做一件事：拿到数据 → 返回一段 HTML 字符串。
 * 约定：
 *   · 需要交互的元素一律带 data-action="xxx" + data-* 参数，由 ui.js 统一事件委托；
 *   · 所有插值都过 esc()，用户昵称/说明里的特殊字符不会破坏页面；
 *   · 时间一律走 format.js，不在组件里直接 new Date(iso)。
 */

import {
  ACT_STATUS,
  ACT_STATUS_TEXT,
  ACT_STATUS_TONE,
  RULES,
  REG_STATUS_TEXT,
  REG_STATUS_TONE,
  SKILL_TEXT,
  skillText,
} from './domain.js'
import { clip, esc, feeText, fmtRelative, fmtShort, initial, parseServerTime } from './format.js'
import { href, sportIconOf } from '../store.js'

/* ============================ 基础块 ============================ */

export const brandMark = () => `<span class="sm-brand__mark" aria-hidden="true">🏸</span>`

export const icon = (name, size = 18) =>
  `<span aria-hidden="true" style="font-size:${size}px;line-height:1">${name}</span>`

/**
 * 顶部栏。
 * @param {{title?:string, sub?:string, back?:boolean, right?:string, brand?:boolean}} props
 */
export function appBar({ title, sub, back, right, brand } = {}) {
  const left = back
    ? `<button class="sm-backbtn" type="button" data-action="back" aria-label="返回">←</button>`
    : brand
      ? `<span class="sm-brand">${brandMark()}<span class="sm-brand__name">SportsBuddy</span></span>`
      : ''
  const center = title
    ? `<div style="min-width:0">
         <div class="sm-appbar__title">${esc(title)}</div>
         ${sub ? `<div class="sm-appbar__sub">${esc(sub)}</div>` : ''}
       </div>`
    : ''
  return `<header class="sm-appbar"><div class="sm-appbar__inner">
    ${left}
    ${center}
    <span class="sm-spacer"></span>
    ${right ?? ''}
  </div></header>`
}

export function card(inner, { title, hint, flat, brand, className = '', bodyClass = '' } = {}) {
  const cls = ['sm-card', flat && 'sm-card--flat', brand && 'sm-card--brand', className]
    .filter(Boolean)
    .join(' ')
  return `<section class="${cls}">
    ${title ? `<h3 class="sm-card__title">${title}</h3>` : ''}
    ${hint ? `<p class="sm-card__hint" style="margin:-6px 0 10px">${hint}</p>` : ''}
    <div class="${bodyClass}">${inner}</div>
  </section>`
}

export function tag(text, tone = '', extra = '') {
  return `<span class="sm-tag ${tone ? `sm-tag--${tone}` : ''}" ${extra}>${esc(text)}</span>`
}

export function alert(type, text, iconGlyph) {
  const glyph = iconGlyph ?? { error: '⚠️', ok: '✅', info: 'ℹ️', warn: '⏳' }[type] ?? 'ℹ️'
  return `<div class="sm-alert sm-alert--${type}" role="status">
    <span class="sm-alert__icon" aria-hidden="true">${glyph}</span>
    <span>${esc(text)}</span>
  </div>`
}

export function empty({ icon: g = '🗂️', title, desc, action } = {}) {
  return `<div class="sm-empty">
    <div class="sm-empty__icon" aria-hidden="true">${g}</div>
    <div class="sm-empty__title">${esc(title ?? '这里还没有内容')}</div>
    ${desc ? `<div class="sm-empty__desc">${desc}</div>` : ''}
    ${action ? `<div style="margin-top:14px">${action}</div>` : ''}
  </div>`
}

export function button(label, { action, variant = '', block, size, disabled, type = 'button', data = '', id } = {}) {
  // variant: '' | primary | accent | ghost | danger | fab
  if (variant === 'fab') {
    return `<button class="sm-fab" type="button"
      ${action ? `data-action="${action}"` : ''} ${id ? `id="${id}"` : ''}
      ${disabled ? 'disabled' : ''} ${data} aria-label="${esc(String(label).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '') || '新建')}">${label}</button>`
  }
  const cls = ['sm-btn', variant && `sm-btn--${variant}`, block && 'sm-btn--block', size && 'sm-btn--sm']
    .filter(Boolean)
    .join(' ')
  return `<button class="${cls}" type="${type}"
    ${action ? `data-action="${action}"` : ''} ${id ? `id="${id}"` : ''}
    ${disabled ? 'disabled' : ''} ${data}>${label}</button>`
}

export function field({ label, control, hint, optional }) {
  return `<label class="sm-field">
    <span class="sm-label">${esc(label)}${optional ? ` <span class="sm-label__opt">（可选）</span>` : ''}</span>
    ${control}
    ${hint ? `<span class="sm-card__hint" style="display:block;margin-top:5px">${hint}</span>` : ''}
  </label>`
}

export const input = ({ name, type = 'text', value = '', placeholder = '', attrs = '' }) =>
  `<input class="sm-input" name="${name}" type="${type}" value="${esc(value)}"
     placeholder="${esc(placeholder)}" ${attrs} />`

export const textarea = ({ name, value = '', placeholder = '', rows = 3 }) =>
  `<textarea class="sm-textarea" name="${name}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`

export const select = ({ name, value, options }) =>
  `<select class="sm-select" name="${name}">${options
    .map(
      (o) =>
        `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`
    )
    .join('')}</select>`

export const switchGroup = ({ name, value, options }) =>
  `<div class="sm-switch" role="group" data-switch="${name}">${options
    .map(
      (o) =>
        `<button type="button" data-action="switch" data-name="${name}" data-value="${esc(o.value)}"
           aria-pressed="${String(o.value) === String(value)}">${esc(o.label)}</button>`
    )
    .join('')}</div>`

/** 横向筛选 chip 组。 */
export const chipRow = ({ name, value, options, mini }) =>
  `<div class="sm-filters" role="group" data-chips="${name}">${options
    .map(
      (o) =>
        `<button type="button" class="sm-chip ${mini ? 'sm-chip--mini' : ''}"
           data-action="filter" data-name="${name}" data-value="${esc(o.value)}"
           aria-pressed="${String(o.value) === String(value)}">${esc(o.label)}</button>`
    )
    .join('')}</div>`

/* ============================ 业务块 ============================ */

/** 名额进度条。 */
export function seatsBar(activity) {
  const total = Math.max(1, Number(activity.capacity) || 1)
  const joined = Number(activity.joined_count) || 0
  const pct = Math.min(100, Math.round((joined / total) * 100))
  const full = activity.slots_left <= 0
  return `<div class="sm-seats">
    <div class="sm-seats__bar"><div class="sm-seats__fill ${full ? 'sm-seats__fill--full' : ''}" style="width:${pct}%"></div></div>
    <div class="sm-seats__txt">
      <span>已报名 <b>${joined}/${total}</b></span>
      <span>${full ? '名额已满' : `还差 <b>${activity.slots_left}</b> 人`}</span>
    </div>
  </div>`
}

/** 水平徽标（带颜色）。 */
export function levelBadge(skill) {
  const tone =
    skill === 'beginner' ? 'ok' : skill === 'intermediate' ? 'info' : skill === 'advanced' ? 'brand' : ''
  return tag(skillText(skill), tone)
}

/** 状态徽标。 */
export const statusBadge = (status) =>
  tag(ACT_STATUS_TEXT[status] ?? status, ACT_STATUS_TONE[status] ?? '')

/**
 * 活动卡片。
 * @param {object} a 活动（列表模型）
 * @param {{score?:number, reasons?:object, compact?:boolean, action?:string}} opts
 */
export function activityCard(a, opts = {}) {
  const reasons = opts.reasons ?? null
  const reasonTags = reasons
    ? [
        reasons.sport && tag('项目匹配', 'ok'),
        reasons.skill && tag('水平合适', 'ok'),
        reasons.campus && tag('同校区', 'ok'),
        reasons.time && tag('时间合适', 'ok'),
        reasons.distance_km != null && tag(`距离 ${reasons.distance_km} km`, 'ghost'),
        reasons.slots_left > 0 && tag(`还有 ${reasons.slots_left} 位`, 'ghost'),
      ]
        .filter(Boolean)
        .join('')
    : ''

  const canJoin = a.status === ACT_STATUS.OPEN && a.slots_left > 0

  return `<article class="sm-act" data-action="open-activity" data-id="${a.id}" role="button" tabindex="0">
    <div class="sm-act__head">
      <span class="sm-act__sport" aria-hidden="true">${sportIconOf(a.sport)}</span>
      <div style="flex:1;min-width:0">
        <div class="sm-act__title">${esc(a.title)}</div>
        <div class="sm-act__meta">
          <span>${esc(fmtShort(a.start_time))}</span>
          <span>·</span>
          <span>${esc(a.campus)} ${esc(clip(a.location, 14))}</span>
        </div>
      </div>
      ${opts.score != null ? `<span class="sm-score">${opts.score} 分</span>` : ''}
    </div>

    <div class="sm-act__tags">
      ${tag(a.sport, 'brand')}
      ${levelBadge(a.skill_level)}
      ${statusBadge(a.status)}
      ${tag(feeText(a.fee), a.fee > 0 ? 'ghost' : 'ok')}
      ${a.gender_limit && a.gender_limit !== 'any' ? tag(a.gender_limit === 'female' ? '限女生' : '限男生', 'warn') : ''}
    </div>

    ${reasonTags ? `<div class="sm-reason">${reasonTags}</div>` : ''}

    ${opts.compact ? '' : seatsBar(a)}

    <div class="sm-act__foot">
      <span class="sm-act__org">
        <span class="sm-avatar" aria-hidden="true">${esc(initial(a.organizer?.nickname))}</span>
        <b>${esc(a.organizer?.nickname ?? '—')}</b>
        <span>信用 ${a.organizer?.reliability_score ?? '—'}</span>
      </span>
      <span style="display:flex;gap:8px">
        ${opts.action ?? ''}
        ${
          canJoin
            ? button('报名', { action: 'join', variant: 'primary', size: 'sm', data: `data-id="${a.id}"` })
            : button(a.slots_left <= 0 ? '已满员' : ACT_STATUS_TEXT[a.status] ?? '不可报名', {
                size: 'sm',
                disabled: true,
              })
        }
      </span>
    </div>
  </article>`
}

export function activitySkeleton() {
  return `<div class="sm-act" aria-hidden="true">
    <div class="sm-act__head">
      <span class="sm-skel" style="width:42px;height:42px;border-radius:12px"></span>
      <div style="flex:1">
        <div class="sm-skel" style="height:15px;width:70%"></div>
        <div class="sm-skel" style="height:11px;width:45%;margin-top:8px"></div>
      </div>
    </div>
    <div class="sm-skel" style="height:26px;margin-top:12px"></div>
    <div class="sm-skel" style="height:6px;margin-top:12px"></div>
  </div>`
}

/** 信用分卡片：环形进度 + 三项统计。 */
export function creditCard(me) {
  const score = Number(me?.reliability_score ?? 0)
  const low = score < RULES.MIN_CREDIT
  const color = low ? 'var(--danger)' : score >= 90 ? 'var(--accent)' : 'var(--brand)'
  const r = 32
  const c = 2 * Math.PI * r
  const dash = (Math.min(100, Math.max(0, score)) / 100) * c
  return `<section class="sm-card sm-credit">
    <div class="sm-credit__ring" role="img" aria-label="信用分 ${score} 分">
      <svg width="78" height="78" viewBox="0 0 78 78" style="position:absolute;inset:0">
        <circle cx="39" cy="39" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="7"></circle>
        <circle cx="39" cy="39" r="${r}" fill="none" stroke="${color}" stroke-width="7"
          stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 39 39)"></circle>
      </svg>
      <span>
        <span class="sm-credit__num" style="color:${color}">${score}</span>
        <span class="sm-credit__unit">信用分</span>
      </span>
    </div>
    <div class="sm-credit__stats">
      <div class="sm-stat"><div class="sm-stat__num">${me?.completed_count ?? 0}</div><div class="sm-stat__label">完成次数</div></div>
      <div class="sm-stat"><div class="sm-stat__num" style="color:${me?.no_show_count ? 'var(--danger)' : 'inherit'}">${me?.no_show_count ?? 0}</div><div class="sm-stat__label">爽约次数</div></div>
      <div class="sm-stat"><div class="sm-stat__num">${me?.review_average ?? '—'}</div><div class="sm-stat__label">评价均分</div></div>
    </div>
  </section>
  ${
    low
      ? `<div style="margin-top:10px">${alert('error', `信用分低于 ${RULES.MIN_CREDIT} 分，暂时无法报名新活动。按时签到、别爽约就能慢慢恢复。`)}</div>`
      : ''
  }`
}

/** 一句话找局输入区。 */
export function nlpBox({ value = '', examples = [] } = {}) {
  return `<section class="sm-nlp">
    <div class="sm-nlp__label">${icon('✨')} 一句话找局 · 自动识别项目 / 校区 / 水平</div>
    <div class="sm-nlp__row">
      <input class="sm-nlp__input" name="sentence" value="${esc(value)}"
        placeholder="今晚想在旗山校区打篮球，新手可以吗" aria-label="用一句话描述你想找的活动" />
      ${button('找局', { action: 'match', variant: 'primary' })}
    </div>
    <div class="sm-nlp__chips">
      ${examples
        .map(
          (e) =>
            `<button type="button" class="sm-nlp__chip" data-action="use-example" data-text="${esc(e)}">${esc(e)}</button>`
        )
        .join('')}
    </div>
  </section>`
}

/** 参与者一行（详情页 / 考勤勾选）。 */
export function memberRow(p, { checkbox = false, checked = false, action } = {}) {
  return `<div class="sm-member" data-user="${p.user_id}">
    ${
      checkbox
        ? `<input type="checkbox" name="attended" value="${p.user_id}" ${checked ? 'checked' : ''}
             style="width:18px;height:18px;accent-color:var(--brand)" aria-label="标记 ${esc(p.nickname)} 到场" />`
        : `<span class="sm-avatar" aria-hidden="true">${esc(initial(p.nickname))}</span>`
    }
    <div class="sm-member__body">
      <div class="sm-member__name">${esc(p.nickname)}</div>
      <div class="sm-member__sub">
        ${esc(SKILL_TEXT[p.skill_level] ?? p.skill_level)} · 信用分 ${p.reliability_score}
        ${p.note ? ` · ${esc(clip(p.note, 18))}` : ''}
      </div>
    </div>
    ${tag(REG_STATUS_TEXT[p.status] ?? p.status, REG_STATUS_TONE[p.status] ?? '')}
    ${action ?? ''}
  </div>`
}

/** 详情页的"事实"行。 */
export const fact = (k, v) =>
  `<div class="sm-fact"><span class="sm-fact__k">${esc(k)}</span><span class="sm-fact__v">${v}</span></div>`

/** 签到码展示（4 位数字分格）。 */
export function codeCells(code) {
  const s = String(code ?? '').padEnd(RULES.CODE_LENGTH, ' ')
  return `<div class="sm-code">${[...s]
    .map((ch) => `<span class="sm-code__cell">${esc(ch.trim() || '·')}</span>`)
    .join('')}</div>`
}

/** 底部标签栏。 */
export function tabBar(active, tabs) {
  return `<nav class="sm-tabbar" aria-label="主导航"><div class="sm-tabbar__inner">
    ${tabs
      .map(
        (t) => `<button class="sm-tab" type="button" data-action="nav" data-href="#/${t.name}"
        ${active === t.name ? 'aria-current="page"' : ''}>
        <span class="sm-tab__icon" aria-hidden="true">${t.icon}</span>
        <span>${esc(t.label)}</span>
      </button>`
      )
      .join('')}
  </div></nav>`
}

/** 相对时间 + 绝对时间的组合，避免"3 小时后到底是几点"的歧义。 */
export const timeCell = (iso) => {
  const d = parseServerTime(iso)
  if (!d) return '—'
  return `${fmtRelative(iso)} <span style="color:var(--ink-3)">（${fmtShort(iso)}）</span>`
}

export { feeText }
