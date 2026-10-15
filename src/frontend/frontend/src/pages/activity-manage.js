/**
 * P-06 管理活动（发起人视角）
 * ---------------------------------------------------------------------------
 * 对应接口：GET /activities/{id}、POST /activities/{id}/attendance、
 *           POST /activities/{id}/cancel、PATCH /activities/{id}（编辑另开页面）
 *
 * 这一页专门解决发起人的三件事：把签到码念出去、看谁来了、收尾记考勤。
 */

import { api } from '../api/index.js'
import { alert, appBar, button, codeCells, empty, memberRow, statusBadge, tag } from '../shared/components.js'
import { esc, fmtRange, fmtRelative } from '../shared/format.js'
import { ACT_STATUS, REG_STATUS, RULES, SKILL_TEXT } from '../shared/domain.js'
import { navigate } from '../router.js'
import { clearFlash, flash, store } from '../store.js'
import { setShell } from '../shared/ui.js'

export function create(params = {}) {
  const id = Number(params.id)
  const state = {
    detail: null,
    loading: true,
    busy: false,
    error: '',
    attended: [],
    submitted: false,
  }

  const rerender = () => setShell({ appBar: appBarOf(), body: view() })

  async function load() {
    clearFlash()
    state.loading = true
    state.error = ''
    rerender()
    try {
      const d = await api.getActivity(id, true)
      if (d.checkin_code == null) {
        // 不是发起人 → 后端不会返回签到码，直接不给看这一页
        state.error = '只有活动发起人可以进入管理页。'
        state.detail = null
      } else {
        state.detail = d
        state.attended = d.participants
          .filter((p) => ['checked_in', 'attended'].includes(p.status))
          .map((p) => p.user_id)
        state.submitted = d.status === ACT_STATUS.FINISHED
      }
    } catch (err) {
      state.error = err?.message ?? '加载失败'
      state.detail = null
    } finally {
      state.loading = false
      rerender()
    }
  }

  async function submitAttendance() {
    state.busy = true
    state.error = ''
    rerender()
    try {
      const res = await api.recordAttendance(id, state.attended.map(Number))
      const changes = res?.score_changes ?? {}
      const detailTxt = Object.entries(changes)
        .map(([uid, delta]) => {
          const p = state.detail?.participants.find((x) => String(x.user_id) === String(uid))
          return `${p?.nickname ?? `用户${uid}`} ${delta > 0 ? '+' : ''}${delta}`
        })
        .join('、')
      flash(
        'ok',
        `考勤已提交：到场 ${res.attended?.length ?? 0} 人，爽约 ${res.no_show?.length ?? 0} 人` +
          (detailTxt ? `（${detailTxt}）` : '。')
      )
      await load()
    } catch (err) {
      state.error = err?.message ?? '提交失败'
      state.busy = false
      rerender()
    }
  }

  async function cancelActivity() {
    state.busy = true
    state.error = ''
    rerender()
    try {
      await api.cancelActivity(id)
      flash('warn', '活动已取消。')
      await load()
    } catch (err) {
      state.error = err?.message ?? '取消失败'
      state.busy = false
      rerender()
    }
  }

  function appBarOf() {
    return appBar({ title: '管理活动', back: true })
  }

  function view() {
    if (state.loading) {
      return `<main class="sm-main sm-stack">
        <div class="sm-skel" style="height:110px"></div>
        <div class="sm-skel" style="height:220px"></div>
      </main>`
    }
    if (!state.detail) {
      return `<main class="sm-main sm-stack">
        ${alert('error', state.error || '活动不存在。')}
        ${button('返回我的局', { action: 'go-manage', variant: 'primary', block: true })}
      </main>`
    }

    const d = state.detail
    const participants = d.participants ?? []
    const checkedIn = participants.filter((p) => ['checked_in', 'attended'].includes(p.status))
    const registered = participants.filter((p) => p.status === REG_STATUS.REGISTERED)
    const canAttendance = ![ACT_STATUS.OPEN, ACT_STATUS.CANCELLED].includes(d.status)

    return `<main class="sm-main sm-stack">
      ${store.flash ? alert(store.flash.type, store.flash.text) : ''}
      ${state.error ? alert('error', state.error) : ''}

      <section class="sm-card">
        <div class="sm-row sm-row--wrap" style="margin-bottom:6px">
          ${statusBadge(d.status)}
          ${tag(d.sport, 'brand')}
          ${tag(SKILL_TEXT[d.skill_level] ?? d.skill_level)}
        </div>
        <h2 style="font-size:17px;font-weight:680;letter-spacing:-0.01em">${esc(d.title)}</h2>
        <p class="sm-card__hint" style="margin-top:4px">
          ${esc(fmtRange(d.start_time, d.end_time))} · ${esc(d.campus)} ${esc(d.location)} ·
          ${esc(fmtRelative(d.start_time))}
        </p>
        <div class="sm-row" style="margin-top:12px;flex-wrap:wrap">
          ${button('查看详情页', { action: 'go-detail', size: 'sm' })}
          ${button('编辑活动', { action: 'go-edit', size: 'sm' })}
          ${d.status !== ACT_STATUS.CANCELLED ? button('取消活动', { action: 'cancel', variant: 'danger', size: 'sm' }) : ''}
        </div>
      </section>

      <section class="sm-card sm-card--brand">
        <h3 class="sm-card__title">签到码</h3>
        ${codeCells(d.checkin_code)}
        <p class="sm-card__hint" style="margin-top:8px">
          念给到场的人，他们自己在手机上输入即可签到。定位签到需要你在发布时标记过场地坐标。
        </p>
      </section>

      <section class="sm-card">
        <div class="sm-row sm-row--between">
          <h3 class="sm-card__title" style="margin:0">到场情况</h3>
          <span class="sm-card__hint">已签到 ${checkedIn.length} · 待签到 ${registered.length}</span>
        </div>

        ${
          participants.length
            ? `<div style="margin-top:6px">
                 ${participants.map((p) => memberRow(p, { checkbox: true, checked: state.attended.includes(p.user_id) })).join('')}
               </div>`
            : `<p class="sm-card__hint" style="margin-top:8px">还没有人报名。把活动分享到班级群会更快凑齐人。</p>`
        }

        ${
          canAttendance
            ? `<div class="sm-row" style="margin-top:14px;flex-wrap:wrap">
                 <button class="sm-btn sm-btn--sm sm-btn--ghost" type="button" data-action="check-all">全选到场</button>
                 <button class="sm-btn sm-btn--sm sm-btn--ghost" type="button" data-action="check-none">全不选</button>
                 <span class="sm-spacer"></span>
                 <button class="sm-btn sm-btn--primary" type="button" data-action="attendance" ${state.busy ? 'disabled' : ''}>
                   ${state.busy ? '提交中…' : state.submitted ? '重新提交考勤' : `确认考勤（${state.attended.length} 人到场）`}
                 </button>
               </div>
               <p class="sm-card__hint" style="margin-top:8px">
                 未勾选的人会被记为爽约并扣 15 分信用分。
               </p>`
            : `<div style="margin-top:12px">${alert('info', '活动开始后才需要记录考勤。到时回到这一页即可。')}</div>`
        }
      </section>

      <section class="sm-card sm-card--flat">
        <h3 class="sm-card__title">小提示</h3>
        <ul class="sm-card__hint" style="line-height:1.9;padding-left:2px">
          <li>· 报名人数达到上限后活动状态会自动变成「已满员」。</li>
          <li>· 距开始 ${RULES.LATE_CANCEL_HOURS} 小时内取消报名的同学会被扣 ${RULES.LATE_CANCEL_PENALTY} 分，界面已提示。</li>
          <li>· 活动结束后，被确认到场的同学可以互相评价。</li>
        </ul>
      </section>
    </main>`
  }

  return {
    appBar: appBarOf,
    view,
    load,
    actions: {
      attendance(ctx) {
        // 直接读页面上的勾选状态
        state.attended = (ctx.form.attended ?? []).map(Number)
        return submitAttendance()
      },
      'check-all'() {
        state.attended = (state.detail?.participants ?? []).map((p) => p.user_id)
        rerender()
      },
      'check-none'() {
        state.attended = []
        rerender()
      },
      cancel() {
        return cancelActivity()
      },
      'go-detail'() {
        navigate('activity', { id })
      },
      'go-edit'() {
        navigate('activity-new', { id })
      },
      'go-manage'() {
        navigate('manage')
      },
      back() {
        navigate('manage')
      },
    },
  }
}
