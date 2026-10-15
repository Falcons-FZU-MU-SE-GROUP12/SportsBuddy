/**
 * P-04 活动详情
 * ---------------------------------------------------------------------------
 * 对应接口：GET /activities/{id}、POST /activities/{id}/join、
 *           DELETE /activities/{id}/join、POST /activities/{id}/cancel、
 *           POST /activities/{id}/attendance、POST /activities/{id}/checkin
 *
 * 权限差异（这是这一页最需要小心的地方）：
 *   · 只有发起人能拿到 checkin_code → 判断条件用 detail.checkin_code != null，
 *     而不是比较 organizer.id（后端就是这么约定的）；
 *   · 只有发起人有「记录考勤」和「取消活动」；
 *   · 已报名者才有「签到」；已开始/已结束不能报名。
 */

import { api, getCurrentPosition } from '../api/index.js'
import {
  activityCard,
  alert,
  appBar,
  button,
  codeCells,
  fact,
  memberRow,
  statusBadge,
  tag,
} from '../shared/components.js'
import { esc, feeText, fmtDateTime, fmtRange, fmtRelative, hasStarted, isLateCancelWindow } from '../shared/format.js'
import { ACT_STATUS, RULES, SKILL_TEXT, actStatusText } from '../shared/domain.js'
import { navigate } from '../router.js'
import { clearFlash, flash, store } from '../store.js'
import { setShell } from '../shared/ui.js'

export function create(params = {}) {
  const id = Number(params.id)
  const state = {
    detail: null,
    myJoinedIds: [],
    loading: true,
    busy: false,
    error: '',
    sheet: null, // 'checkin' | 'attendance' | 'leave' | null
    checkinCode: '',
    checkinMsg: '',
    attended: [],
  }

  let me = store.me
  let isOrganizer = false
  let isJoined = false

  const rerender = () => setShell({ appBar: appBarOf(), body: view(), layers: layers() })

  /** 详情接口拿不到"我报没报名"，所以再用 /activities/mine 补一次。 */
  async function loadMine() {
    if (!store.me) {
      state.myJoinedIds = []
      return
    }
    try {
      const mine = await api.getMyActivities()
      state.myJoinedIds = [...(mine.joined ?? []), ...(mine.organized ?? [])].map((a) => a.id)
    } catch {
      state.myJoinedIds = []
    }
  }

  async function load() {
    clearFlash()
    state.loading = true
    state.error = ''
    rerender()
    try {
      const [detail] = await Promise.all([api.getActivity(id, true), loadMine()])
      state.detail = detail
      isOrganizer = detail.checkin_code != null
      isJoined = state.myJoinedIds.includes(id)
    } catch (err) {
      state.error = err?.message ?? '加载失败'
      state.detail = null
    } finally {
      state.loading = false
      rerender()
    }
  }

  /** 任何写操作之后：刷新详情 + 我的报名，保证名额数字与按钮状态同步。 */
  async function refresh() {
    try {
      const [detail] = await Promise.all([api.getActivity(id, true), loadMine()])
      state.detail = detail
      isOrganizer = detail.checkin_code != null
      isJoined = state.myJoinedIds.includes(id)
      if (store.me) me = await api.getMe()
    } catch (err) {
      state.error = err?.message ?? '刷新失败'
    }
  }

  /* ---------------- 动作 ---------------- */

  async function join(note = '') {
    state.busy = true
    state.error = ''
    rerender()
    try {
      await api.joinActivity(id, note)
      flash('ok', '报名成功。到场后记得在活动详情里签到。')
      await refresh()
    } catch (err) {
      state.error = err?.message ?? '报名失败'
      if (err?.isAuthError) {
        store.me = null
        navigate('login')
        return
      }
    } finally {
      state.busy = false
      rerender()
    }
  }

  async function leave() {
    state.busy = true
    state.error = ''
    rerender()
    try {
      const reg = await api.leaveActivity(id)
      /// 后端用 is_late_cancel 明确告知"这次取消会扣分"，界面必须说清楚
      if (reg?.is_late_cancel) {
        flash('warn', `已取消报名。距离开始不足 ${RULES.LATE_CANCEL_HOURS} 小时，信用分被扣了 ${RULES.LATE_CANCEL_PENALTY} 分。`)
      } else {
        flash('ok', '已取消报名。')
      }
      state.sheet = null
      await refresh()
    } catch (err) {
      state.error = err?.message ?? '取消失败'
    } finally {
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
      flash('warn', '活动已取消，已报名的同学会被通知并置为已取消。')
      await refresh()
    } catch (err) {
      state.error = err?.message ?? '取消失败'
    } finally {
      state.busy = false
      rerender()
    }
  }

  async function checkinByCode() {
    const code = state.checkinCode.trim()
    if (!new RegExp(`^\\d{${RULES.CODE_LENGTH}}$`).test(code)) {
      state.checkinMsg = `请输入 ${RULES.CODE_LENGTH} 位数字签到码。`
      rerender()
      return
    }
    state.busy = true
    state.checkinMsg = ''
    rerender()
    try {
      const res = await api.checkinWithCode(id, code)
      state.checkinMsg = ''
      state.sheet = null
      state.checkinCode = ''
      flash('ok', res?.message ?? '签到成功')
      await refresh()
    } catch (err) {
      state.checkinMsg = err?.message ?? '签到失败'
    } finally {
      state.busy = false
      rerender()
    }
  }

  async function checkinByLocation() {
    state.busy = true
    state.checkinMsg = '正在获取定位…'
    rerender()
    try {
      const pos = await getCurrentPosition()
      const res = await api.checkinWithLocation(id, pos.latitude, pos.longitude)
      state.sheet = null
      state.checkinMsg = ''
      flash('ok', res?.message ?? '签到成功')
      await refresh()
    } catch (err) {
      state.checkinMsg = err?.message ?? '定位签到失败'
    } finally {
      state.busy = false
      rerender()
    }
  }

  async function submitAttendance() {
    state.busy = true
    state.error = ''
    rerender()
    try {
      const res = await api.recordAttendance(id, state.attended.map(Number))
      state.sheet = null
      state.attended = []
      const changed = Object.keys(res?.score_changes ?? {}).length
      flash(
        'ok',
        `考勤已记录：到场 ${res.attended?.length ?? 0} 人，爽约 ${res.no_show?.length ?? 0} 人` +
          (changed ? `，共 ${changed} 人信用分变动。` : '。')
      )
      await refresh()
    } catch (err) {
      state.error = err?.message ?? '提交考勤失败'
    } finally {
      state.busy = false
      rerender()
    }
  }

  /* ---------------- 视图 ---------------- */

  function appBarOf() {
    return appBar({ title: '活动详情', back: true, right: store.me ? tag(me?.nickname ?? '', 'ghost') : '' })
  }

  function hero(d) {
    return `<section class="sm-hero"><div class="sm-hero__inner sm-stack">
      <div class="sm-row sm-row--wrap">
        ${statusBadge(d.status)}
        ${tag(d.sport, 'brand')}
        ${tag(SKILL_TEXT[d.skill_level] ?? d.skill_level)}
        ${tag(feeText(d.fee), d.fee > 0 ? 'ghost' : 'ok')}
        ${d.gender_limit && d.gender_limit !== 'any' ? tag(d.gender_limit === 'female' ? '限女生' : '限男生', 'warn') : ''}
      </div>
      <h1 class="sm-hero__title">${esc(d.title)}</h1>
      <div class="sm-card__hint">${esc(fmtRelative(d.start_time))}开始 · ${esc(fmtRange(d.start_time, d.end_time))}</div>
    </div></section>`
  }

  function factsCard(d) {
    return `<section class="sm-card">
      <div class="sm-facts">
        ${fact('时间', `${esc(fmtDateTime(d.start_time))} 起<br /><span class="sm-card__hint">${esc(fmtRange(d.start_time, d.end_time))}（本地时间）</span>`)}
        ${fact('地点', `${esc(d.campus)} · ${esc(d.location)}`)}
        ${fact('人数', `${d.joined_count}/${d.capacity} 人 · ${d.slots_left > 0 ? `还差 ${d.slots_left} 人` : '名额已满'}`)}
        ${fact('费用', esc(feeText(d.fee)))}
        ${fact('发起人', `${esc(d.organizer?.nickname ?? '—')} · 信用分 ${d.organizer?.reliability_score ?? '—'}`)}
        ${d.description ? fact('说明', esc(d.description)) : ''}
      </div>
      ${
        d.status === ACT_STATUS.CANCELLED
          ? `<div style="margin-top:12px">${alert('error', '这场活动已被发起人取消。')}</div>`
          : ''
      }
    </section>`
  }

  function actionCard(d) {
    if (!store.me) {
      return `<section class="sm-card">
        ${alert('info', '登录后即可报名、签到、评价同场伙伴。')}
        <div style="margin-top:12px">${button('登录 / 注册', { action: 'go-login', variant: 'primary', block: true })}</div>
      </section>`
    }
    if (isOrganizer) {
      const canAttendance = d.status !== ACT_STATUS.CANCELLED && d.status !== ACT_STATUS.OPEN
      return `<section class="sm-card">
        <h3 class="sm-card__title">你是发起人</h3>
        <p class="sm-card__hint">签到码念给到场的人，他们自己输入即可签到；活动结束后记录考勤，未勾选的人会被记为爽约。</p>
        <div class="sm-row" style="margin-top:12px;flex-wrap:wrap">
          ${button('记录考勤', { action: 'open-attendance', variant: 'primary', disabled: !canAttendance || state.busy, size: 'sm' })}
          ${button('取消活动', { action: 'open-cancel', variant: 'danger', disabled: d.status === ACT_STATUS.CANCELLED, size: 'sm' })}
        </div>
        ${!canAttendance ? `<p class="sm-card__hint" style="margin-top:8px">活动开始后才需要记录考勤。</p>` : ''}
      </section>`
    }
    if (isJoined) {
      const my = d.participants.find((p) => p.user_id === me?.id)
      const done = my && ['checked_in', 'attended'].includes(my.status)
      const late = isLateCancelWindow(d.start_time)
      return `<section class="sm-card">
        <h3 class="sm-card__title">我的参与状态</h3>
        <div class="sm-row sm-row--between">
          <span>${tag(my ? (my.status === 'attended' ? '已确认到场' : my.status === 'checked_in' ? '已签到' : '已报名') : '已报名', my && my.status !== 'registered' ? 'ok' : 'ghost')}</span>
          ${my?.checked_in_at ? `<span class="sm-card__hint">签到于 ${esc(fmtDateTime(my.checked_in_at))}${my.checkin_method ? ` · ${my.checkin_method === 'code' ? '签到码' : '定位'}` : ''}</span>` : ''}
        </div>
        <div class="sm-row" style="margin-top:12px;flex-wrap:wrap">
          ${
            done
              ? ''
              : button('去签到', { action: 'open-checkin', variant: 'primary', disabled: state.busy, size: 'sm' })
          }
          ${
            d.status === ACT_STATUS.FINISHED && my?.status === 'attended'
              ? button('评价同场伙伴', { action: 'go-review', size: 'sm' })
              : ''
          }
          ${button('取消报名', { action: 'open-leave', variant: 'danger', disabled: state.busy, size: 'sm' })}
        </div>
        ${
          late && d.status === ACT_STATUS.OPEN
            ? `<p class="sm-card__hint" style="margin-top:8px;color:var(--danger)">距开始不足 ${RULES.LATE_CANCEL_HOURS} 小时，现在取消会扣 ${RULES.LATE_CANCEL_PENALTY} 分信用分。</p>`
            : ''
        }
      </section>`
    }
    const canJoin = d.status === ACT_STATUS.OPEN && d.slots_left > 0
    const lowCredit = (me?.reliability_score ?? 100) < RULES.MIN_CREDIT
    return `<section class="sm-card">
      ${
        lowCredit
          ? alert('error', `你的信用分为 ${me?.reliability_score}，低于 ${RULES.MIN_CREDIT} 分，暂时无法报名新活动。`)
          : ''
      }
      <div class="sm-row" style="margin-top:${lowCredit ? '12px' : '0'};flex-wrap:wrap">
        ${button(canJoin ? '立即报名' : d.slots_left <= 0 ? '名额已满' : actStatusText(d.status), {
          action: 'open-join',
          variant: 'primary',
          disabled: !canJoin || state.busy || lowCredit,
          block: true,
        })}
      </div>
      <p class="sm-card__hint" style="margin-top:10px">
        报名后可以在活动开始前随时取消；距开始 ${RULES.LATE_CANCEL_HOURS} 小时内取消会扣 ${RULES.LATE_CANCEL_PENALTY} 分。
      </p>
    </section>`
  }

  function participantsCard(d) {
    const list = d.participants ?? []
    const checked = list.filter((p) => ['checked_in', 'attended'].includes(p.status)).length
    return `<section class="sm-card">
      <div class="sm-row sm-row--between">
        <h3 class="sm-card__title" style="margin:0">参与者（${list.length}/${d.capacity}）</h3>
        ${isOrganizer ? `<span class="sm-card__hint">已签到 ${checked} 人</span>` : ''}
      </div>
      ${
        list.length
          ? list
              .map((p) =>
                memberRow(p, {
                  action: `<button class="sm-btn sm-btn--sm sm-btn--ghost" type="button"
                    data-action="view-user" data-id="${p.user_id}">主页</button>`,
                })
              )
              .join('')
          : `<p class="sm-card__hint">还没有人报名，可以把活动分享给同学。</p>`
      }
    </section>`
  }

  function view() {
    if (state.loading) {
      return `<main class="sm-main sm-stack">
        <div class="sm-skel" style="height:96px"></div>
        <div class="sm-skel" style="height:180px"></div>
        <div class="sm-skel" style="height:120px"></div>
      </main>`
    }
    if (!state.detail) {
      return `<main class="sm-main sm-stack">
        ${state.error ? alert('error', state.error) : alert('error', '活动不存在或已被删除。')}
        ${button('返回活动列表', { action: 'go-list', variant: 'primary', block: true })}
      </main>`
    }
    const d = state.detail
    return `${hero(d)}
    <main class="sm-main sm-stack">
      ${store.flash ? alert(store.flash.type, store.flash.text) : ''}
      ${state.error ? alert('error', state.error) : ''}
      ${factsCard(d)}
      ${actionCard(d)}
      ${participantsCard(d)}

      ${
        // 发起人专属：签到码（checkin_code 非 null 即代表当前用户是发起人）
        isOrganizer && d.checkin_code
          ? `<section class="sm-card sm-card--brand">
               <h3 class="sm-card__title">签到码</h3>
               ${codeCells(d.checkin_code)}
               <p class="sm-card__hint" style="margin-top:8px">
                 把这 ${RULES.CODE_LENGTH} 位数字念给到场的人。签到码只有你能看到。
               </p>
             </section>`
          : ''
      }

      ${d.status === ACT_STATUS.FINISHED ? `<section class="sm-card">
          <h3 class="sm-card__title">活动已结束</h3>
          <p class="sm-card__hint">如果你被确认到场，可以给同场伙伴打个分，帮助大家找到靠谱的搭子。</p>
          <div style="margin-top:12px">
            ${button('去评价', { action: 'go-review', size: 'sm' })}
          </div>
        </section>` : ''}
    </main>`
  }

  /* ---------------- 浮层 ---------------- */

  function layers() {
    if (state.sheet === 'checkin') {
      return [
        `<div class="sm-sheet" data-action="close-layer"><div class="sm-sheet__panel" data-stop>
          <div class="sm-sheet__head">
            <span class="sm-sheet__title">签到</span>
            <button class="sm-backbtn" type="button" data-action="close-layer" aria-label="关闭">✕</button>
          </div>
          <form data-action="do-checkin">
            <label class="sm-field">
              <span class="sm-label">${RULES.CODE_LENGTH} 位签到码</span>
              <input class="sm-input" name="code" inputmode="numeric" maxlength="${RULES.CODE_LENGTH}"
                style="font-family:var(--font-num);font-size:22px;letter-spacing:8px;text-align:center"
                value="${esc(state.checkinCode)}" placeholder="••••" />
            </label>
            <button class="sm-btn sm-btn--primary sm-btn--block" type="submit" style="margin-top:14px"
              ${state.busy ? 'disabled' : ''}>${state.busy ? '处理中…' : '确认签到'}</button>
          </form>
          <div class="sm-divider"></div>
          <button class="sm-btn sm-btn--block" type="button" data-action="do-checkin-location"
            ${state.busy ? 'disabled' : ''}>📍 用定位签到</button>
          <p class="sm-card__hint" style="margin-top:10px">
            定位签到需要你在活动地点 ${RULES.CHECKIN_RADIUS_M} 米内，且浏览器已授权定位（必须 HTTPS 或 localhost）。
          </p>
          ${state.checkinMsg ? `<div style="margin-top:10px">${alert('error', state.checkinMsg)}</div>` : ''}
        </div></div>`,
      ]
    }

    if (state.sheet === 'attendance') {
      const list = (state.detail?.participants ?? []).filter((p) => p.status !== 'cancelled')
      return [
        `<div class="sm-sheet" data-action="close-layer"><div class="sm-sheet__panel" data-stop>
          <div class="sm-sheet__head">
            <span class="sm-sheet__title">记录考勤</span>
            <button class="sm-backbtn" type="button" data-action="close-layer" aria-label="关闭">✕</button>
          </div>
          ${alert('warn', '勾选【实际到场】的人。没勾选的会被记为爽约，并扣 15 分信用分，请确认后再提交。')}
          <form data-action="do-attendance" style="margin-top:12px">
            ${list.map((p) => memberRow(p, { checkbox: true, checked: state.attended.includes(p.user_id) })).join('')}
            <div class="sm-row" style="margin-top:14px">
              <button class="sm-btn sm-btn--ghost" type="button" data-action="check-all">全选</button>
              <button class="sm-btn sm-btn--ghost" type="button" data-action="check-none">全不选</button>
              <span class="sm-spacer"></span>
              <button class="sm-btn sm-btn--primary" type="submit" ${state.busy ? 'disabled' : ''}>
                ${state.busy ? '提交中…' : `提交（已选 ${state.attended.length} 人）`}
              </button>
            </div>
          </form>
        </div></div>`,
      ]
    }

    if (state.sheet === 'leave') {
      const late = isLateCancelWindow(state.detail?.start_time)
      return [
        `<div class="sm-sheet" data-action="close-layer"><div class="sm-sheet__panel" data-stop>
          <div class="sm-sheet__head"><span class="sm-sheet__title">取消报名</span></div>
          ${
            late
              ? alert('error', `距离活动开始不足 ${RULES.LATE_CANCEL_HOURS} 小时，现在取消会扣 ${RULES.LATE_CANCEL_PENALTY} 分信用分（低于 ${RULES.MIN_CREDIT} 分将无法报名新活动）。`)
              : alert('info', '现在取消不会扣信用分。确认要取消吗？')
          }
          <div class="sm-row" style="margin-top:14px">
            ${button('再想想', { action: 'close-layer', block: true })}
            ${button(late ? '仍然取消' : '确认取消', { action: 'do-leave', variant: 'danger', block: true })}
          </div>
        </div></div>`,
      ]
    }

    if (state.sheet === 'cancel-activity') {
      return [
        `<div class="sm-sheet" data-action="close-layer"><div class="sm-sheet__panel" data-stop>
          <div class="sm-sheet__head"><span class="sm-sheet__title">取消这场活动</span></div>
          ${alert('warn', '取消后所有已报名的同学都会被置为「已取消」，且无法恢复。')}
          <div class="sm-row" style="margin-top:14px">
            ${button('再想想', { action: 'close-layer', block: true })}
            ${button('确认取消活动', { action: 'do-cancel-activity', variant: 'danger', block: true })}
          </div>
        </div></div>`,
      ]
    }

    if (state.sheet === 'join') {
      return [
        `<div class="sm-sheet" data-action="close-layer"><div class="sm-sheet__panel" data-stop>
          <div class="sm-sheet__head"><span class="sm-sheet__title">报名</span></div>
          <form data-action="do-join">
            <label class="sm-field">
              <span class="sm-label">给发起人留句话 <span class="sm-label__opt">（可选）</span></span>
              <input class="sm-input" name="note" placeholder="例如：第一次来，多担待" maxlength="60" />
            </label>
            <div class="sm-row" style="margin-top:14px">
              <button class="sm-btn sm-btn--block" type="button" data-action="close-layer">取消</button>
              <button class="sm-btn sm-btn--primary sm-btn--block" type="submit">确认报名</button>
            </div>
          </form>
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
      'open-checkin'() {
        state.sheet = 'checkin'
        state.checkinMsg = ''
        rerender()
      },
      'open-attendance'() {
        state.sheet = 'attendance'
        // 默认把"已签到"的人先勾上，减少发起人操作
        state.attended = (state.detail?.participants ?? [])
          .filter((p) => ['checked_in', 'attended'].includes(p.status))
          .map((p) => p.user_id)
        rerender()
      },
      'open-leave'() {
        state.sheet = 'leave'
        rerender()
      },
      'open-cancel'() {
        state.sheet = 'cancel-activity'
        rerender()
      },
      'open-join'() {
        if (!store.me) return navigate('login')
        state.sheet = 'join'
        rerender()
      },
      'close-layer'() {
        state.sheet = null
        state.checkinMsg = ''
        rerender()
      },
      'do-checkin'(ctx) {
        state.checkinCode = ctx.form.code ?? ''
        return checkinByCode()
      },
      'do-checkin-location'() {
        return checkinByLocation()
      },
      'do-leave'() {
        return leave()
      },
      'do-cancel-activity'() {
        return cancelActivity()
      },
      'do-join'(ctx) {
        return join(ctx.form.note ?? '')
      },
      'do-attendance'(ctx) {
        state.attended = (ctx.form.attended ?? []).map(Number)
        return submitAttendance()
      },
      'check-all'() {
        state.attended = (state.detail?.participants ?? [])
          .filter((p) => p.status !== 'cancelled')
          .map((p) => p.user_id)
        rerender()
      },
      'check-none'() {
        state.attended = []
        rerender()
      },
      'view-user'(ctx) {
        navigate('user', { id: ctx.data.id })
      },
      'go-review'() {
        navigate('review', { activityId: id })
      },
      'go-login'() {
        navigate('login')
      },
      'go-list'() {
        navigate('activities')
      },
      back() {
        navigate('activities')
      },
    },
  }
}
