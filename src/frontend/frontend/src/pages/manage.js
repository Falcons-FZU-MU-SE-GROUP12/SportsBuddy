/**
 * P-10 我的局
 * ---------------------------------------------------------------------------
 * 对应接口：GET /activities/mine → { organized, joined }
 *           DELETE /activities/{id}/join（取消报名）
 * 发起人在这里进入「管理活动」；报名者在这里进入「签到」。
 */

import { api } from '../api/index.js'
import { alert, appBar, button, empty, statusBadge, tabBar, tag } from '../shared/components.js'
import { esc, fmtShort, isLateCancelWindow } from '../shared/format.js'
import { ACT_STATUS, RULES, SKILL_TEXT } from '../shared/domain.js'
import { navigate } from '../router.js'
import { TABS, clearFlash, flash, sportIconOf, store } from '../store.js'
import { setShell } from '../shared/ui.js'

export function create() {
  const state = {
    tab: 'organized', // organized | joined
    organized: [],
    joined: [],
    loading: true,
    busy: false,
    error: '',
    sheet: null, // { type:'leave'|'cancel', id }
  }

  const rerender = () => setShell({ appBar: appBarOf(), body: view(), layers: layers() })

  async function load() {
    clearFlash()
    state.loading = true
    state.error = ''
    rerender()
    try {
      const res = await api.getMyActivities()
      state.organized = res.organized ?? []
      state.joined = res.joined ?? []
    } catch (err) {
      state.error = err?.message ?? '加载失败'
    } finally {
      state.loading = false
      rerender()
    }
  }

  async function leave(id) {
    state.busy = true
    state.error = ''
    rerender()
    try {
      const reg = await api.leaveActivity(id)
      state.sheet = null
      if (reg?.is_late_cancel) {
        flash('warn', `已取消报名。距离开始不足 ${RULES.LATE_CANCEL_HOURS} 小时，信用分被扣了 ${RULES.LATE_CANCEL_PENALTY} 分。`)
      } else {
        flash('ok', '已取消报名。')
      }
      await load()
    } catch (err) {
      state.error = err?.message ?? '取消失败'
      state.busy = false
      rerender()
    }
  }

  async function cancelActivity(id) {
    state.busy = true
    state.error = ''
    rerender()
    try {
      await api.cancelActivity(id)
      state.sheet = null
      flash('warn', '活动已取消，报名同学会被置为已取消。')
      await load()
    } catch (err) {
      state.error = err?.message ?? '取消失败'
      state.busy = false
      rerender()
    }
  }

  function appBarOf() {
    return appBar({
      title: '我的局',
      sub: `我发起 ${state.organized.length} · 我报名 ${state.joined.length}`,
      right: button('＋ 发起', { action: 'go-new', size: 'sm' }),
    })
  }

  /** 我发起的：一行浓缩信息 + 管理入口。 */
  function organizedRow(a) {
    const needAttendance = [ACT_STATUS.ONGOING, ACT_STATUS.FINISHED].includes(a.status)
    return `<article class="sm-card" style="padding:14px">
      <div class="sm-row" style="align-items:flex-start;gap:12px">
        <span class="sm-act__sport" aria-hidden="true" style="width:38px;height:38px;font-size:19px">${sportIconOf(a.sport)}</span>
        <div style="flex:1;min-width:0" role="button" tabindex="0" data-action="open-activity" data-id="${a.id}">
          <div style="font-size:15px;font-weight:640;line-height:1.35">${esc(a.title)}</div>
          <div class="sm-act__meta">
            <span>${esc(fmtShort(a.start_time))}</span>
            <span>·</span>
            <span>${esc(a.campus)} ${esc(a.location)}</span>
          </div>
        </div>
      </div>
      <div class="sm-act__tags">
        ${statusBadge(a.status)}
        ${tag(`${a.joined_count}/${a.capacity} 人`, a.slots_left > 0 ? 'ghost' : 'warn')}
        ${tag(SKILL_TEXT[a.skill_level] ?? a.skill_level)}
      </div>
      <div class="sm-row" style="margin-top:12px;flex-wrap:wrap">
        ${button(needAttendance ? '记录考勤' : '看签到码', { action: 'go-manage', variant: 'primary', size: 'sm', data: `data-id="${a.id}"` })}
        ${button('详情', { action: 'open-activity', size: 'sm', data: `data-id="${a.id}"` })}
        ${
          a.status !== ACT_STATUS.CANCELLED
            ? button('取消活动', { action: 'ask-cancel', variant: 'danger', size: 'sm', data: `data-id="${a.id}"` })
            : ''
        }
      </div>
    </article>`
  }

  /** 我报名的：显示自己的状态 + 签到 / 取消报名。 */
  function joinedRow(a) {
    const canCheckin = [ACT_STATUS.OPEN, ACT_STATUS.FULL, ACT_STATUS.ONGOING].includes(a.status)
    const late = isLateCancelWindow(a.start_time)
    return `<article class="sm-card" style="padding:14px">
      <div class="sm-row" style="align-items:flex-start;gap:12px">
        <span class="sm-act__sport" aria-hidden="true" style="width:38px;height:38px;font-size:19px">${sportIconOf(a.sport)}</span>
        <div style="flex:1;min-width:0" role="button" tabindex="0" data-action="open-activity" data-id="${a.id}">
          <div style="font-size:15px;font-weight:640;line-height:1.35">${esc(a.title)}</div>
          <div class="sm-act__meta">
            <span>${esc(fmtShort(a.start_time))}</span>
            <span>·</span>
            <span>${esc(a.location)}</span>
          </div>
        </div>
      </div>
      <div class="sm-act__tags">
        ${statusBadge(a.status)}
        ${tag(`发起人 ${a.organizer?.nickname ?? '—'}`, 'ghost')}
        ${late && a.status === ACT_STATUS.OPEN ? tag('临近开始', 'danger') : ''}
      </div>
      <div class="sm-row" style="margin-top:12px;flex-wrap:wrap">
        ${canCheckin ? button('去签到', { action: 'go-checkin', variant: 'primary', size: 'sm', data: `data-id="${a.id}"` }) : ''}
        ${a.status === ACT_STATUS.FINISHED ? button('评价伙伴', { action: 'go-review', size: 'sm', data: `data-id="${a.id}"` }) : ''}
        ${button('详情', { action: 'open-activity', size: 'sm', data: `data-id="${a.id}"` })}
        ${
          a.status === ACT_STATUS.OPEN || a.status === ACT_STATUS.FULL
            ? button('取消报名', { action: 'ask-leave', variant: 'danger', size: 'sm', data: `data-id="${a.id}"` })
            : ''
        }
      </div>
    </article>`
  }

  function view() {
    const list = state.tab === 'organized' ? state.organized : state.joined

    return `<main class="sm-main sm-stack">
      <div class="sm-switch" style="width:100%" role="group" aria-label="切换列表">
        <button type="button" style="flex:1" data-action="tab" data-value="organized"
          aria-pressed="${state.tab === 'organized'}">我发起的（${state.organized.length}）</button>
        <button type="button" style="flex:1" data-action="tab" data-value="joined"
          aria-pressed="${state.tab === 'joined'}">我报名的（${state.joined.length}）</button>
      </div>

      ${store.flash ? alert(store.flash.type, store.flash.text) : ''}
      ${state.error ? alert('error', state.error) : ''}

      ${
        state.loading
          ? `<div class="sm-stack">
               <div class="sm-skel" style="height:120px"></div>
               <div class="sm-skel" style="height:120px"></div>
             </div>`
          : list.length
            ? `<section class="sm-stack">${list
                .map((a) => (state.tab === 'organized' ? organizedRow(a) : joinedRow(a)))
                .join('')}</section>`
            : empty({
                icon: state.tab === 'organized' ? '🎯' : '🙋',
                title: state.tab === 'organized' ? '还没有发起过活动' : '还没有报名任何活动',
                desc:
                  state.tab === 'organized'
                    ? '发起一场，把时间地点说清楚，搭子自然会来。'
                    : '去「找局」看看，一句话就能匹配到合适的活动。',
                action: button(state.tab === 'organized' ? '＋ 发起活动' : '去找局', {
                  action: state.tab === 'organized' ? 'go-new' : 'go-discover',
                  variant: 'primary',
                }),
              })
      }

      ${tabBar('manage', TABS)}
    </main>`
  }

  function layers() {
    if (!state.sheet) return []
    const { type, id } = state.sheet
    const activity =
      [...state.organized, ...state.joined].find((a) => a.id === Number(id)) ?? null

    if (type === 'leave') {
      const late = isLateCancelWindow(activity?.start_time)
      return [
        `<div class="sm-sheet" data-action="close-layer"><div class="sm-sheet__panel">
          <div class="sm-sheet__head"><span class="sm-sheet__title">取消报名</span></div>
          ${esc(activity?.title ?? '')}
          <div style="margin-top:10px">
            ${
              late
                ? alert('error', `距离开始不足 ${RULES.LATE_CANCEL_HOURS} 小时，现在取消会扣 ${RULES.LATE_CANCEL_PENALTY} 分信用分。`)
                : alert('info', '现在取消不扣信用分。确认取消吗？')
            }
          </div>
          <div class="sm-row" style="margin-top:14px">
            ${button('再想想', { action: 'close-layer', block: true })}
            ${button(late ? '仍然取消' : '确认取消', { action: 'do-leave', variant: 'danger', block: true, data: `data-id="${id}"` })}
          </div>
        </div></div>`,
      ]
    }

    if (type === 'cancel') {
      return [
        `<div class="sm-sheet" data-action="close-layer"><div class="sm-sheet__panel">
          <div class="sm-sheet__head"><span class="sm-sheet__title">取消这场活动</span></div>
          ${alert('warn', '取消后所有已报名的同学都会被置为「已取消」，无法恢复。')}
          <div class="sm-row" style="margin-top:14px">
            ${button('再想想', { action: 'close-layer', block: true })}
            ${button('确认取消活动', { action: 'do-cancel', variant: 'danger', block: true, data: `data-id="${id}"` })}
          </div>
        </div></div>`,
      ]
    }

    return []
  }

  return {
    appBar: appBarOf,
    view,
    load,
    actions: {
      tab(ctx) {
        state.tab = ctx.data.value
        rerender()
      },
      'ask-leave'(ctx) {
        state.sheet = { type: 'leave', id: ctx.data.id }
        rerender()
      },
      'ask-cancel'(ctx) {
        state.sheet = { type: 'cancel', id: ctx.data.id }
        rerender()
      },
      'close-layer'() {
        state.sheet = null
        rerender()
      },
      'do-leave'(ctx) {
        return leave(Number(ctx.data.id))
      },
      'do-cancel'(ctx) {
        return cancelActivity(Number(ctx.data.id))
      },
      'go-manage'(ctx) {
        navigate('activity-manage', { id: ctx.data.id })
      },
      'go-checkin'(ctx) {
        navigate('checkin', { id: ctx.data.id })
      },
      'go-review'(ctx) {
        navigate('review', { activityId: ctx.data.id })
      },
      'open-activity'(ctx) {
        navigate('activity', { id: ctx.data.id })
      },
      'go-new'() {
        navigate('activity-new')
      },
      'go-discover'() {
        navigate('discover')
      },
      nav(ctx) {
        clearFlash()
        location.hash = ctx.data.href
      },
      back() {
        navigate('discover')
      },
    },
  }
}
